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

# In-memory session history store: {session_id: [messages]}
_chat_session_history: dict[str, list[dict]] = {}


class ChatMessage(BaseModel):
    message: str
    session_id: str | None = None
    context: dict | None = None
    # Optional: pass conversation history from frontend
    history: list[dict] | None = None


@router.post("/api/chat")
async def chat_with_agent(
    request: ChatMessage,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Chat with the AI security agent via OpenCode Server.

    The chat module exclusively uses OpenCode Server (configured separately in settings).
    Other modules (scan, rule compile, etc.) use the LLM provider settings.

    Maintains multi-turn conversation context per session.
    """
    import httpx
    import openai
    from .settings import get_opencode_config

    # ── 1. Load OpenCode config (chat module always uses OpenCode) ────────────
    oc_config = get_opencode_config()
    session_id = request.session_id or "default"

    # ── 2. Build context from database ────────────────────────────────────────
    vuln_result = await db.execute(
        select(Vulnerability)
        .where(Vulnerability.status == "unresolved")
        .order_by(Vulnerability.discovered_at.desc())
        .limit(10)
    )
    recent_vulns = vuln_result.scalars().all()

    project_result = await db.execute(select(func.count(Project.id)))
    project_count = project_result.scalar() or 0

    system_prompt = (
        "You are an expert AI security analyst for the Vuls-Hunter platform. "
        "You help security teams understand vulnerabilities, plan remediation, and conduct security audits.\n\n"
        f"Current platform state:\n"
        f"- Projects monitored: {project_count}\n"
        f"- Active unresolved vulnerabilities: {len(recent_vulns)}\n"
        f"- Recent vulnerabilities: {[v.title for v in recent_vulns[:5]]}\n\n"
        "You can:\n"
        "1. Explain vulnerabilities and their impact\n"
        "2. Suggest remediation strategies\n"
        "3. Guide users through security audits\n"
        "4. Analyze code for security issues\n"
        "5. Provide security best practices\n"
        "Respond in Chinese (Simplified). Be concise but thorough.\n"
        "When suggesting actions, provide specific actionable steps.\n"
        "Format your response with clear sections when appropriate."
    )

    # ── 3. Manage multi-turn session history ──────────────────────────────────
    if session_id not in _chat_session_history:
        _chat_session_history[session_id] = []

    if request.history:
        _chat_session_history[session_id] = [
            {"role": h["role"], "content": h["content"]}
            for h in request.history
            if h.get("role") in ("user", "assistant") and h.get("content")
        ]

    history = _chat_session_history[session_id]
    if len(history) > 40:
        history = history[-40:]
        _chat_session_history[session_id] = history

    # ── 4. OpenCode Server mode (always used for chat) ───────────────────────
    if True:
        server_url = (oc_config.get("server_url") or "").rstrip("/")
        oc_provider_id = oc_config.get("provider_id") or "openai"
        oc_model_id = oc_config.get("model_id") or "gpt-4.1-mini"

        if not server_url:
            return {
                "text": (
                    "**OpenCode Server 未配置**\n\n"
                    "请前往 **模型设置** 页面，找到 **智能对话引擎 (OpenCode)** 配置区域，"
                    "填写 OpenCode Server 地址（如 `http://localhost:4096`），"
                    "然后点击 [测试连接] 并保存配置。"
                ),
                "suggestions": ["前往模型设置", "查看 OpenCode 文档"],
                "session_id": session_id,
            }

        try:
            async with httpx.AsyncClient(timeout=60.0) as hclient:
                # Create or reuse an OpenCode session
                oc_session_key = f"opencode_{session_id}"
                oc_session_id = _chat_session_history.get(oc_session_key + "_oc_id")

                if not oc_session_id:
                    # Create new OpenCode session
                    sess_resp = await hclient.post(
                        f"{server_url}/session",
                        json={},
                        headers={"Content-Type": "application/json"},
                    )
                    sess_resp.raise_for_status()
                    oc_session_id = sess_resp.json()["id"]
                    # Store the mapping: vuls-hunter session_id -> opencode session id
                    _chat_session_history[oc_session_key + "_oc_id"] = oc_session_id
                    logger.info("Created OpenCode session: %s", oc_session_id)

                # Build message text with system context on first message
                user_text = request.message
                if not history:  # First message in session
                    user_text = (
                        f"[系统背景]\n{system_prompt}\n\n"
                        f"[用户问题]\n{request.message}"
                    )

                # Send message to OpenCode
                msg_resp = await hclient.post(
                    f"{server_url}/session/{oc_session_id}/message",
                    json={
                        "parts": [{"type": "text", "text": user_text}],
                        "model": {
                            "providerID": oc_provider_id,
                            "modelID": oc_model_id,
                        },
                    },
                    headers={"Content-Type": "application/json"},
                    timeout=120.0,
                )
                msg_resp.raise_for_status()
                msg_data = msg_resp.json()

            # Extract text from response parts
            ai_text = ""
            for part in msg_data.get("parts", []):
                if part.get("type") == "text":
                    ai_text += part.get("text", "")

            if not ai_text:
                ai_text = "OpenCode 已处理请求，但未返回文本内容。"

            # Update session history
            _chat_session_history[session_id].append({"role": "user", "content": request.message})
            _chat_session_history[session_id].append({"role": "assistant", "content": ai_text})

            # Log
            log = AuditLog(
                action=f"OpenCode 对话: {request.message[:50]}...",
                level="info",
            )
            db.add(log)
            await db.commit()

            suggestions = _generate_suggestions(request.message, recent_vulns)
            return {
                "text": ai_text,
                "suggestions": suggestions,
                "session_id": session_id,
                "provider": f"opencode-server ({oc_provider_id}/{oc_model_id})",
            }

        except Exception as exc:
            logger.exception("OpenCode Server chat failed: %s", exc)
            fallback_text = (
                f"抱歉，OpenCode Server 暂时无法响应。\n\n"
                f"**当前配置：** `{server_url}` (provider={oc_provider_id}, model={oc_model_id})\n\n"
                "**可能原因：**\n"
                "1. OpenCode Server 未启动或地址不正确\n"
                "2. 指定的 provider/model 未在 OpenCode 中配置\n"
                "3. 网络连接问题\n\n"
                "**解决方案：** 确认 OpenCode Server 已运行 (`opencode serve --hostname 0.0.0.0 --port 4096`)，"
                "然后在模型设置中更新 Server 地址并测试连接。"
            )
            return {
                "text": fallback_text,
                "suggestions": ["前往模型设置", "检查 OpenCode Server", "切换为 OpenAI 模式"],
                "session_id": session_id,
            }

    # (OpenAI-compatible fallback removed — chat always uses OpenCode Server)


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
