"""Overview, audit logs, and chat API routes."""
from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import AuditLog, Project, Report, Scan, ScanStatus, Vulnerability, get_db

logger = logging.getLogger(__name__)
router = APIRouter(tags=["overview"])


# ─────────────────────────────────────────────
# Overview / Dashboard
# ─────────────────────────────────────────────

@router.get("/api/overview")
async def get_overview(db: AsyncSession = Depends(get_db)) -> Any:
    """Get dashboard overview statistics."""
    # Total vulnerabilities by severity (unresolved)
    vuln_result = await db.execute(
        select(Vulnerability.severity, func.count(Vulnerability.id))
        .where(Vulnerability.status == "unresolved")
        .group_by(Vulnerability.severity)
    )
    vuln_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for severity, count in vuln_result.all():
        vuln_counts[severity.value] = count

    # Fixed vulnerabilities
    fixed_result = await db.execute(
        select(func.count(Vulnerability.id)).where(Vulnerability.status == "fixed")
    )
    fixed_count = fixed_result.scalar() or 0

    # Total vulnerabilities
    total_result = await db.execute(select(func.count(Vulnerability.id)))
    total_count = total_result.scalar() or 0

    # Auto-fix rate
    auto_fix_rate = round((fixed_count / total_count * 100) if total_count > 0 else 0, 1)

    # Project count
    project_result = await db.execute(select(func.count(Project.id)))
    project_count = project_result.scalar() or 0

    # Scan count
    scan_result = await db.execute(select(func.count(Scan.id)))
    scan_count = scan_result.scalar() or 0

    # Recent scans
    recent_scans_result = await db.execute(
        select(Scan).order_by(Scan.created_at.desc()).limit(5)
    )
    recent_scans = recent_scans_result.scalars().all()

    # Recent reports
    recent_reports_result = await db.execute(
        select(Report).order_by(Report.created_at.desc()).limit(5)
    )
    recent_reports = recent_reports_result.scalars().all()

    return {
        "vulnerability_counts": vuln_counts,
        "total_vulnerabilities": total_count,
        "fixed_count": fixed_count,
        "auto_fix_rate": auto_fix_rate,
        "project_count": project_count,
        "scan_count": scan_count,
        "recent_scans": [
            {
                "id": s.id,
                "target": s.target,
                "scan_mode": s.scan_mode,
                "status": s.status.value,
                "created_at": s.created_at.isoformat(),
            }
            for s in recent_scans
        ],
        "recent_reports": [
            {
                "id": r.id,
                "report_id": r.report_id,
                "project_name": r.project_name,
                "compliance_grade": r.compliance_grade,
                "vulnerability_count": r.vulnerability_count,
                "created_at": r.created_at.isoformat(),
            }
            for r in recent_reports
        ],
    }


# ─────────────────────────────────────────────
# Audit Logs
# ─────────────────────────────────────────────

@router.get("/api/audit-logs")
async def get_audit_logs(
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Get audit logs."""
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    )
    logs = result.scalars().all()

    return [
        {
            "id": log.id,
            "action": log.action,
            "level": log.level,
            "user": log.user,
            "details": log.details,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]


# ─────────────────────────────────────────────
# Chat Agent
# ─────────────────────────────────────────────

class ChatMessage(BaseModel):
    message: str
    session_id: str | None = None
    context: dict | None = None


@router.post("/api/chat")
async def chat_with_agent(
    request: ChatMessage,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Chat with the AI security agent."""
    import openai

    client = openai.AsyncOpenAI(
        api_key=os.environ.get("OPENAI_API_KEY"),
        base_url=os.environ.get("OPENAI_BASE_URL"),
    )

    # Build context from database
    vuln_result = await db.execute(
        select(Vulnerability)
        .where(Vulnerability.status == "unresolved")
        .order_by(Vulnerability.discovered_at.desc())
        .limit(10)
    )
    recent_vulns = vuln_result.scalars().all()

    project_result = await db.execute(select(func.count(Project.id)))
    project_count = project_result.scalar() or 0

    system_prompt = f"""You are an expert AI security analyst for the Vuls-Hunter platform.
You help security teams understand vulnerabilities, plan remediation, and conduct security audits.

Current platform state:
- Projects monitored: {project_count}
- Active unresolved vulnerabilities: {len(recent_vulns)}
- Recent vulnerabilities: {[v.title for v in recent_vulns[:5]]}

You can:
1. Explain vulnerabilities and their impact
2. Suggest remediation strategies
3. Guide users through security audits
4. Analyze code for security issues
5. Provide security best practices

Respond in Chinese (Simplified). Be concise but thorough.
When suggesting actions, provide specific actionable steps.
Format your response with clear sections when appropriate."""

    try:
        response = await client.chat.completions.create(
            model=os.environ.get("STRIX_LLM", "gpt-4.1-mini"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.message},
            ],
            temperature=0.7,
            max_tokens=1024,
        )

        ai_text = response.choices[0].message.content or "抱歉，我无法处理您的请求。"

        # Log the interaction
        log = AuditLog(
            action=f"AI 对话: {request.message[:50]}...",
            level="info",
        )
        db.add(log)
        await db.commit()

        # Generate suggestions based on context
        suggestions = _generate_suggestions(request.message, recent_vulns)

        return {
            "text": ai_text,
            "suggestions": suggestions,
            "session_id": request.session_id,
        }

    except Exception as exc:
        logger.exception("Chat agent failed")
        raise HTTPException(status_code=500, detail=f"AI agent error: {exc}")


def _generate_suggestions(message: str, vulns: list) -> list[str]:
    """Generate contextual suggestions based on the conversation."""
    suggestions = []
    msg_lower = message.lower()

    if any(word in msg_lower for word in ["扫描", "检测", "audit", "scan"]):
        suggestions.extend(["启动快速扫描", "查看项目列表"])
    if any(word in msg_lower for word in ["漏洞", "vulnerability", "vuln"]):
        suggestions.extend(["查看漏洞详情", "一键修复高危漏洞"])
    if any(word in msg_lower for word in ["报告", "report"]):
        suggestions.extend(["生成审计报告", "导出 PDF 报告"])
    if any(word in msg_lower for word in ["规则", "rule"]):
        suggestions.extend(["查看规则库", "创建自定义规则"])

    if not suggestions and vulns:
        suggestions = ["查看最新漏洞", "启动深度扫描", "生成安全报告"]

    return suggestions[:3]


# ─────────────────────────────────────────────
# Engine Status
# ─────────────────────────────────────────────

@router.get("/api/engine/status")
async def get_engine_status() -> Any:
    """Get AI engine status and metrics."""
    import psutil

    cpu_percent = psutil.cpu_percent(interval=0.1)
    mem = psutil.virtual_memory()

    return {
        "status": "running",
        "components": {
            "tree_sitter": {"status": "running", "version": "0.23.0"},
            "symbolic_engine": {"status": "running", "version": "2.1.0"},
            "llm_inference": {
                "status": "running",
                "model": os.environ.get("STRIX_LLM", "gpt-4.1-mini"),
            },
            "strix_agent": {"status": "available", "version": "0.1.0"},
        },
        "metrics": {
            "cpu_usage": round(cpu_percent, 1),
            "memory_usage": round(mem.percent, 1),
            "memory_used_gb": round(mem.used / 1024**3, 2),
            "memory_total_gb": round(mem.total / 1024**3, 2),
        },
    }
