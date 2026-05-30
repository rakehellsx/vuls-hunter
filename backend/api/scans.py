"""Scan API routes."""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import AuditLog, Scan, ScanStatus, Vulnerability, get_db
from ..engine.strix_runner import (
    generate_run_name,
    parse_strix_results,
    run_quick_scan_simulation,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scans", tags=["scans"])

# Active scan tasks: scan_id -> asyncio.Task
_active_scans: dict[int, asyncio.Task] = {}
# Log queues: scan_id -> asyncio.Queue
_scan_log_queues: dict[int, asyncio.Queue] = {}


class QuickScanRequest(BaseModel):
    target: str
    code: str | None = None
    language: str = "Python"
    scan_mode: str = "quick"
    project_id: int | None = None
    instruction: str | None = None


class ScanResponse(BaseModel):
    id: int
    run_name: str
    target: str
    scan_mode: str
    status: str
    created_at: str


@router.post("/quick", response_model=ScanResponse)
async def start_quick_scan(
    request: QuickScanRequest,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Start a quick vulnerability scan."""
    run_name = generate_run_name(request.target)

    scan = Scan(
        project_id=request.project_id,
        run_name=run_name,
        target=request.target,
        scan_mode=request.scan_mode,
        is_whitebox=bool(request.code),
        instruction=request.instruction,
        status=ScanStatus.pending,
    )
    db.add(scan)

    log = AuditLog(
        action=f"启动快速扫描: {request.target}",
        level="info",
        details=f"模式: {request.scan_mode}, 目标: {request.target}",
    )
    db.add(log)
    await db.commit()
    await db.refresh(scan)

    # Create log queue for this scan
    queue: asyncio.Queue = asyncio.Queue()
    _scan_log_queues[scan.id] = queue

    # Launch scan as background task
    task = asyncio.create_task(
        _run_scan_task(
            scan_id=scan.id,
            target=request.target,
            code=request.code,
            language=request.language,
            scan_mode=request.scan_mode,
            instruction=request.instruction,
            log_queue=queue,
        )
    )
    _active_scans[scan.id] = task

    return ScanResponse(
        id=scan.id,
        run_name=run_name,
        target=request.target,
        scan_mode=request.scan_mode,
        status=ScanStatus.pending.value,
        created_at=scan.created_at.isoformat(),
    )


async def _run_scan_task(
    *,
    scan_id: int,
    target: str,
    code: str | None,
    language: str,
    scan_mode: str,
    instruction: str | None,
    log_queue: asyncio.Queue,
) -> None:
    """Background task that runs the scan and updates the database."""
    from ..db.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        # Update status to running
        result = await db.execute(select(Scan).where(Scan.id == scan_id))
        scan = result.scalar_one_or_none()
        if not scan:
            return
        scan.status = ScanStatus.running
        await db.commit()

    logs: list[str] = []
    final_result: dict[str, Any] | None = None

    try:
        async for event in run_quick_scan_simulation(
            target=target,
            code=code,
            language=language,
            scan_mode=scan_mode,
        ):
            await log_queue.put(event)
            if event["type"] == "log":
                logs.append(event["data"])
            elif event["type"] == "finished":
                if event.get("result"):
                    final_result = event["result"]

        # Save results to database
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Scan).where(Scan.id == scan_id))
            scan = result.scalar_one_or_none()
            if scan:
                scan.status = ScanStatus.completed
                scan.log_output = "\n".join(logs)
                scan.completed_at = datetime.utcnow()
                await db.commit()

                if final_result:
                    await _save_vulnerabilities(db, scan_id, final_result)
                    await _save_report(db, scan_id, scan, final_result)

    except Exception as exc:
        logger.exception("Scan %d failed", scan_id)
        await log_queue.put({"type": "error", "data": str(exc)})
        await log_queue.put({"type": "finished", "exit_code": 1, "success": False})

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Scan).where(Scan.id == scan_id))
            scan = result.scalar_one_or_none()
            if scan:
                scan.status = ScanStatus.failed
                scan.error_message = str(exc)
                scan.log_output = "\n".join(logs)
                await db.commit()
    finally:
        _active_scans.pop(scan_id, None)


async def _save_vulnerabilities(
    db: AsyncSession, scan_id: int, result_data: dict[str, Any]
) -> None:
    """Save vulnerabilities from scan result to database."""
    vulns_data = result_data.get("vulnerabilities", [])
    for i, vuln_data in enumerate(vulns_data):
        vuln = Vulnerability(
            scan_id=scan_id,
            vuln_id=f"VULN-{scan_id:04d}-{i+1:03d}",
            title=vuln_data.get("title", "Unknown Vulnerability"),
            severity=vuln_data.get("severity", "medium").lower(),
            description=vuln_data.get("description", ""),
            impact=vuln_data.get("impact", ""),
            remediation=vuln_data.get("remediation", ""),
            proof_of_concept=vuln_data.get("proof_of_concept", ""),
            cwe=vuln_data.get("cwe", None),
            file_path=vuln_data.get("file_path", None),
            start_line=vuln_data.get("start_line", None),
            end_line=vuln_data.get("end_line", None),
            code_snippet=vuln_data.get("code_snippet", None),
            fix_before=vuln_data.get("fix_before", None),
            fix_after=vuln_data.get("fix_after", None),
            raw_data=vuln_data,
        )
        db.add(vuln)
    await db.commit()


async def _save_report(
    db: AsyncSession, scan_id: int, scan: Scan, result_data: dict[str, Any]
) -> None:
    """Save executive report to database."""
    from ..db.models import Report

    vulns_data = result_data.get("vulnerabilities", [])
    severity_counts: dict[str, int] = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for v in vulns_data:
        sev = v.get("severity", "medium").lower()
        if sev in severity_counts:
            severity_counts[sev] += 1

    # Determine compliance grade
    if severity_counts["critical"] > 0:
        grade = "D-"
    elif severity_counts["high"] > 2:
        grade = "C"
    elif severity_counts["high"] > 0:
        grade = "B"
    elif severity_counts["medium"] > 3:
        grade = "B+"
    else:
        grade = "A+"

    report_id = f"RPT-{datetime.utcnow().strftime('%Y%m%d')}-{scan_id:04d}"
    # Try to get real project name if scan is associated with a project
    project_name = scan.target[:50] if scan.target else "Unknown"
    if scan.project_id:
        from ..db.models import Project as ProjectModel
        proj_result = await db.execute(select(ProjectModel).where(ProjectModel.id == scan.project_id))
        proj = proj_result.scalar_one_or_none()
        if proj:
            project_name = proj.name

    # Build full report markdown
    full_md = f"""# 安全审计报告 {report_id}

**目标**: {scan.target}
**扫描模式**: {scan.scan_mode}
**完成时间**: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}
**合规评级**: {grade}

## 执行摘要

{result_data.get('executive_summary', '本次安全审计已完成。')}

## 测试方法论

{result_data.get('methodology', 'AI 驱动的静态代码分析与语义推理。')}

## 技术分析

{result_data.get('technical_analysis', '详见漏洞详情。')}

## 漏洞统计

| 严重级别 | 数量 |
|:---|:---|
| 严重 (Critical) | {severity_counts['critical']} |
| 高危 (High) | {severity_counts['high']} |
| 中危 (Medium) | {severity_counts['medium']} |
| 低危 (Low) | {severity_counts['low']} |

## 修复建议

{result_data.get('recommendations', '请参考各漏洞详情中的修复建议。')}
"""

    from ..db.models import Report
    report = Report(
        scan_id=scan_id,
        report_id=report_id,
        project_name=project_name,
        executive_summary=result_data.get("executive_summary", ""),
        methodology=result_data.get("methodology", ""),
        technical_analysis=result_data.get("technical_analysis", ""),
        recommendations=result_data.get("recommendations", ""),
        full_report_md=full_md,
        vulnerability_count=severity_counts,
        compliance_grade=grade,
    )
    db.add(report)
    await db.commit()


@router.get("/{scan_id}")
async def get_scan(scan_id: int, db: AsyncSession = Depends(get_db)) -> Any:
    """Get scan details including vulnerabilities."""
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    # Get vulnerabilities
    vuln_result = await db.execute(
        select(Vulnerability).where(Vulnerability.scan_id == scan_id)
    )
    vulns = vuln_result.scalars().all()

    return {
        "id": scan.id,
        "run_name": scan.run_name,
        "target": scan.target,
        "scan_mode": scan.scan_mode,
        "status": scan.status.value,
        "log_output": scan.log_output or "",
        "error_message": scan.error_message,
        "created_at": scan.created_at.isoformat(),
        "completed_at": scan.completed_at.isoformat() if scan.completed_at else None,
        "vulnerabilities": [
            {
                "id": v.id,
                "vuln_id": v.vuln_id,
                "title": v.title,
                "severity": v.severity.value,
                "description": v.description,
                "impact": v.impact,
                "remediation": v.remediation,
                "proof_of_concept": v.proof_of_concept,
                "poc_description": v.poc_description,
                "poc_script_code": v.poc_script_code,
                "poc_generated_at": v.poc_generated_at.isoformat() if v.poc_generated_at else None,
                "cwe": v.cwe,
                "file_path": v.file_path,
                "start_line": v.start_line,
                "end_line": v.end_line,
                "code_snippet": v.code_snippet,
                "fix_before": v.fix_before,
                "fix_after": v.fix_after,
                "status": v.status,
                "discovered_at": v.discovered_at.isoformat(),
            }
            for v in vulns
        ],
    }


@router.websocket("/{scan_id}/ws")
async def scan_websocket(scan_id: int, websocket: WebSocket) -> None:
    """WebSocket endpoint for real-time scan log streaming."""
    await websocket.accept()

    queue = _scan_log_queues.get(scan_id)
    if not queue:
        # Scan already finished or doesn't exist - send stored logs
        from ..db.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Scan).where(Scan.id == scan_id))
            scan = result.scalar_one_or_none()
            if scan and scan.log_output:
                for line in scan.log_output.split("\n"):
                    await websocket.send_json({"type": "log", "data": line})
            await websocket.send_json({
                "type": "finished",
                "exit_code": 0 if scan and scan.status == ScanStatus.completed else 1,
                "success": scan is not None and scan.status == ScanStatus.completed,
            })
        await websocket.close()
        return

    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=60.0)
                await websocket.send_json(event)
                if event.get("type") == "finished":
                    break
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for scan %d", scan_id)
    except Exception as exc:
        logger.exception("WebSocket error for scan %d", scan_id)
        try:
            await websocket.send_json({"type": "error", "data": str(exc)})
        except Exception:
            pass
    finally:
        _scan_log_queues.pop(scan_id, None)


@router.patch("/{scan_id}/vulnerabilities/{vuln_id}")
async def update_vulnerability_status(
    scan_id: int,
    vuln_id: int,
    status: str,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Update vulnerability status (fixed/ignored/unresolved)."""
    result = await db.execute(
        select(Vulnerability).where(
            Vulnerability.id == vuln_id,
            Vulnerability.scan_id == scan_id,
        )
    )
    vuln = result.scalar_one_or_none()
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")

    if status not in ("fixed", "ignored", "unresolved"):
        raise HTTPException(status_code=400, detail="Invalid status")

    vuln.status = status
    log = AuditLog(
        action=f"漏洞状态更新: {vuln.title[:50]} -> {status}",
        level="info",
    )
    db.add(log)
    await db.commit()
    return {"success": True, "status": status}


# ---------------------------------------------------------------------------
# PoC Generation API
# ---------------------------------------------------------------------------

@router.post("/{scan_id}/vulnerabilities/{vuln_id}/poc")
async def generate_poc(
    scan_id: int,
    vuln_id: int,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Generate a Proof-of-Concept (PoC) for a specific vulnerability using the AI engine.
    This leverages Strix's PoC generation capability via DeepSeek/OpenAI.
    """
    import openai
    import json as _json
    from pathlib import Path as _Path
    from datetime import datetime as _dt

    # 1. Load vulnerability from DB
    result = await db.execute(
        select(Vulnerability).where(
            Vulnerability.id == vuln_id,
            Vulnerability.scan_id == scan_id,
        )
    )
    vuln = result.scalar_one_or_none()
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")

    # 2. If PoC already generated, return cached version
    if vuln.poc_script_code:
        return {
            "success": True,
            "cached": True,
            "poc_description": vuln.poc_description,
            "poc_script_code": vuln.poc_script_code,
            "poc_generated_at": vuln.poc_generated_at.isoformat() if vuln.poc_generated_at else None,
        }

    # 3. Load LLM config (same logic as strix_runner)
    try:
        _settings_file = _Path(__file__).parent.parent.parent / "data" / "llm_settings.json"
        if _settings_file.exists():
            _settings = _json.loads(_settings_file.read_text(encoding="utf-8"))
            _active_id = _settings.get("active_provider_id")
            _providers = _settings.get("providers", [])
            _active = next((p for p in _providers if p.get("id") == _active_id and p.get("enabled")), None)
            if not _active:
                _active = next((p for p in _providers if p.get("enabled")), None)
            if _active and _active.get("api_key"):
                _dyn_url = _active.get("base_url", "").rstrip("/")
                if _dyn_url.endswith("/chat/completions"):
                    _dyn_url = _dyn_url[:-len("/chat/completions")]
                api_key = _active["api_key"]
                base_url = _dyn_url or None
                model_name = _active.get("model", "gpt-4.1-mini")
            else:
                raise ValueError("No active provider")
        else:
            raise ValueError("No settings file")
    except Exception:
        import os as _os
        api_key = _os.environ.get("OPENAI_API_KEY", "")
        base_url = _os.environ.get("OPENAI_BASE_URL", None)
        model_name = "gpt-4.1-mini"

    # 4. Build PoC generation prompt (Strix-style)
    vuln_context = f"""Vulnerability Details:
- Title: {vuln.title}
- Severity: {vuln.severity.value.upper()}
- CWE: {vuln.cwe or "N/A"}
- Description: {vuln.description or "N/A"}
- Impact: {vuln.impact or "N/A"}
- File: {vuln.file_path or "N/A"}
- Lines: {vuln.start_line or "N/A"} - {vuln.end_line or "N/A"}
- Vulnerable Code:
```
{vuln.code_snippet or vuln.fix_before or "N/A"}
```
- Remediation: {vuln.remediation or "N/A"}"""

    poc_prompt = f"""You are a professional penetration tester and security researcher.
Your task is to generate a complete, executable Proof-of-Concept (PoC) for the following vulnerability.

{vuln_context}

Generate a PoC that:
1. Demonstrates the vulnerability is real and exploitable
2. Shows the attack vector clearly
3. Is safe to run in a controlled test environment
4. Includes comments explaining each step

Respond with valid JSON only (no markdown code blocks):
{{
  "poc_description": "A clear, step-by-step explanation of how this vulnerability can be exploited, what conditions are needed, and what the attacker can achieve. Include: attack prerequisites, exploitation steps, expected outcome.",
  "poc_script_code": "Complete executable PoC script (Python preferred). Include: imports, setup, attack payload, verification of success. Add detailed comments.",
  "attack_type": "The attack category (e.g. SQL Injection, XSS, Command Injection, IDOR, etc.)",
  "prerequisites": "What the attacker needs (e.g. valid user account, network access, etc.)",
  "impact_demo": "What the PoC demonstrates (e.g. extracts admin password hash, executes arbitrary commands, etc.)",
  "detection_evasion": "How this attack might evade detection",
  "mitigation_test": "How to verify the fix works after patching"
}}"""

    # 5. Call LLM
    try:
        client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url or None)
        try:
            response = await client.chat.completions.create(
                model=model_name,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert penetration tester. Generate detailed, executable PoC code. Always respond with valid JSON only.",
                    },
                    {"role": "user", "content": poc_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
            )
        except Exception:
            response = await client.chat.completions.create(
                model=model_name,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert penetration tester. Generate detailed, executable PoC code. Always respond with valid JSON only, no markdown.",
                    },
                    {"role": "user", "content": poc_prompt},
                ],
                temperature=0.2,
            )

        result_text = response.choices[0].message.content or "{}"

        # Parse JSON with fallback
        import re as _re
        poc_data: dict = {}
        for strategy in [
            lambda t: _json.loads(t),
            lambda t: _json.loads(_re.search(r'\{[\s\S]*\}', t).group(0)),  # type: ignore
        ]:
            try:
                poc_data = strategy(result_text)
                break
            except Exception:
                continue

        poc_description = poc_data.get("poc_description", "")
        poc_script_code = poc_data.get("poc_script_code", "")

        # Enrich description with extra fields
        extra_info = []
        if poc_data.get("attack_type"):
            extra_info.append(f"**攻击类型**: {poc_data['attack_type']}")
        if poc_data.get("prerequisites"):
            extra_info.append(f"**前置条件**: {poc_data['prerequisites']}")
        if poc_data.get("impact_demo"):
            extra_info.append(f"**演示效果**: {poc_data['impact_demo']}")
        if poc_data.get("detection_evasion"):
            extra_info.append(f"**检测规避**: {poc_data['detection_evasion']}")
        if poc_data.get("mitigation_test"):
            extra_info.append(f"**修复验证**: {poc_data['mitigation_test']}")
        if extra_info:
            poc_description = poc_description + "\n\n---\n" + "\n\n".join(extra_info)

        # 6. Save to DB
        vuln.poc_description = poc_description
        vuln.poc_script_code = poc_script_code
        vuln.poc_generated_at = _dt.utcnow()

        log = AuditLog(
            action=f"PoC 生成: {vuln.title[:60]}",
            level="info",
            details=f"scan_id={scan_id}, vuln_id={vuln_id}, model={model_name}",
        )
        db.add(log)
        await db.commit()

        return {
            "success": True,
            "cached": False,
            "poc_description": poc_description,
            "poc_script_code": poc_script_code,
            "poc_generated_at": vuln.poc_generated_at.isoformat(),
        }

    except Exception as exc:
        logger.exception("PoC generation failed for vuln %d", vuln_id)
        raise HTTPException(
            status_code=500,
            detail=f"PoC generation failed: {str(exc)}"
        )


@router.get("/{scan_id}/vulnerabilities/{vuln_id}/poc")
async def get_poc(
    scan_id: int,
    vuln_id: int,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Get existing PoC for a vulnerability (if already generated)."""
    result = await db.execute(
        select(Vulnerability).where(
            Vulnerability.id == vuln_id,
            Vulnerability.scan_id == scan_id,
        )
    )
    vuln = result.scalar_one_or_none()
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")

    return {
        "has_poc": bool(vuln.poc_script_code),
        "poc_description": vuln.poc_description,
        "poc_script_code": vuln.poc_script_code,
        "poc_generated_at": vuln.poc_generated_at.isoformat() if vuln.poc_generated_at else None,
    }
