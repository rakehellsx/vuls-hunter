"""Overview, audit logs, and chat API routes."""
from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
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
    vuln_result = await db.execute(
        select(Vulnerability.severity, func.count(Vulnerability.id))
        .where(Vulnerability.status == "unresolved")
        .group_by(Vulnerability.severity)
    )
    vuln_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for severity, count in vuln_result.all():
        vuln_counts[severity.value] = count

    fixed_result = await db.execute(
        select(func.count(Vulnerability.id)).where(Vulnerability.status == "fixed")
    )
    fixed_count = fixed_result.scalar() or 0

    total_result = await db.execute(select(func.count(Vulnerability.id)))
    total_count = total_result.scalar() or 0

    auto_fix_rate = round((fixed_count / total_count * 100) if total_count > 0 else 0, 1)

    project_result = await db.execute(select(func.count(Project.id)))
    project_count = project_result.scalar() or 0

    scan_result = await db.execute(select(func.count(Scan.id)))
    scan_count = scan_result.scalar() or 0

    recent_scans_result = await db.execute(
        select(Scan).order_by(Scan.created_at.desc()).limit(5)
    )
    recent_scans = recent_scans_result.scalars().all()

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
# Chat Agent — OpenCode API
# ─────────────────────────────────────────────

# In-memory store: session_id -> opencode_session_id
_oc_session_map: dict[str, str] = {}

# System prompt for vulnerability hunting
VULN_HUNTER_SYSTEM_PROMPT = """你是 Vuls-Hunter 平台的首席 AI 安全研究员，专精于代码安全审计与漏洞挖掘。

## 你的核心能力
- **代码漏洞挖掘**：深度分析代码中的安全缺陷，覆盖 OWASP Top 10、CWE Top 25、CERT 安全规范
- **漏洞链分析**：识别多个低危漏洞组合形成的高危攻击链（如 SSRF + IDOR 组合提权）
- **污点追踪**：追踪用户输入从入口到危险函数的完整数据流路径
- **修复方案**：提供具体可执行的代码级修复补丁，而非泛泛建议
- **PoC 生成**：为已发现漏洞生成概念验证利用代码（仅用于安全研究）

## 分析框架
当用户提交代码或 URL 时，你应当：
1. **识别攻击面**：枚举所有外部输入点（HTTP 参数、文件上传、WebSocket、环境变量等）
2. **漏洞分类扫描**：按 CWE 分类逐一检查注入类、认证类、加密类、逻辑类漏洞
3. **严重性评级**：按 CVSS 3.1 标准评估每个漏洞的 CRITICAL/HIGH/MEDIUM/LOW 等级
4. **修复优先级**：按风险从高到低排列，给出修复路线图

## 输出格式规范
- 使用 Markdown 格式，结构清晰
- 每个漏洞包含：**漏洞名称**、**位置**（文件:行号）、**危险等级**、**漏洞描述**、**攻击场景**、**修复代码**
- 使用代码块展示漏洞代码和修复代码
- 结尾提供**安全加固建议**和**下一步行动**

## 对话原则
- 始终用中文回复
- 对用户追问保持上下文连贯，记住已分析的代码内容
- 如果用户提供了代码，优先基于实际代码分析，而非泛泛而谈
- 鼓励用户提供更多上下文（框架版本、部署环境、业务逻辑）以提升分析精度
"""


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    history: list[dict] | None = None
    # Optional code context attached to this message
    code_context: str | None = None
    target_info: str | None = None


async def _get_or_create_oc_session(server_url: str, session_id: str, hclient: Any) -> str:
    """Get existing OpenCode session or create a new one."""
    if session_id in _oc_session_map:
        return _oc_session_map[session_id]

    sess_resp = await hclient.post(
        f"{server_url}/session",
        json={},
        headers={"Content-Type": "application/json"},
        timeout=30.0,
    )
    sess_resp.raise_for_status()
    oc_session_id = sess_resp.json()["id"]
    _oc_session_map[session_id] = oc_session_id
    logger.info("Created OpenCode session: %s -> %s", session_id, oc_session_id)
    return oc_session_id


async def _send_to_opencode(
    server_url: str,
    oc_session_id: str,
    message_text: str,
    hclient: Any,
) -> str:
    """Send a message to OpenCode and extract the text response."""
    msg_resp = await hclient.post(
        f"{server_url}/session/{oc_session_id}/message",
        json={
            "parts": [{"type": "text", "text": message_text}],
            "model": {
                "providerID": "openai",
                "modelID": "gpt-4.1-mini",
            },
        },
        headers={"Content-Type": "application/json"},
        timeout=180.0,
    )
    msg_resp.raise_for_status()
    msg_data = msg_resp.json()

    ai_text = ""
    for part in msg_data.get("parts", []):
        if part.get("type") == "text":
            ai_text += part.get("text", "")

    return ai_text or "OpenCode 已处理请求，但未返回文本内容。"


@router.post("/api/chat")
async def chat_with_agent(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Chat with the AI security agent via OpenCode Server.

    Exclusively uses OpenCode Server for all chat interactions.
    Supports multi-turn conversation with full context retention.
    When code_context is provided, it is injected into the message for vulnerability analysis.
    """
    import httpx
    from .settings import get_opencode_config

    oc_config = get_opencode_config()
    session_id = request.session_id or "default"

    server_url = (oc_config.get("server_url") or "").rstrip("/")
    api_key = oc_config.get("api_key") or ""

    if not server_url:
        return {
            "text": (
                "**OpenCode Server 未配置**\n\n"
                "请前往 **模型设置** 页面，找到 **智能对话引擎** 配置区域，"
                "填写 OpenCode Server 地址（如 `http://localhost:4096`），"
                "然后点击「测试连接」并保存配置。"
            ),
            "suggestions": ["前往模型设置"],
            "session_id": session_id,
        }

    # Build the message text
    # On first message of a session, prepend the system prompt
    is_new_session = session_id not in _oc_session_map

    message_parts: list[str] = []

    if is_new_session:
        message_parts.append(f"[系统指令]\n{VULN_HUNTER_SYSTEM_PROMPT}\n\n---\n")

    # If code context is attached (from file upload or URL clone), inject it
    if request.code_context:
        target_label = request.target_info or "提交的代码"
        message_parts.append(
            f"[代码上下文 - {target_label}]\n"
            f"以下是需要进行安全审计的代码内容：\n\n"
            f"{request.code_context}\n\n---\n"
        )

    message_parts.append(f"[用户]\n{request.message}")
    full_message = "\n".join(message_parts)

    try:
        headers = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        async with httpx.AsyncClient(timeout=30.0, headers=headers) as hclient:
            oc_session_id = await _get_or_create_oc_session(server_url, session_id, hclient)
            ai_text = await _send_to_opencode(
                server_url, oc_session_id, full_message, hclient
            )

        # Log to audit
        log = AuditLog(
            action=f"OpenCode 对话: {request.message[:80]}",
            level="info",
        )
        db.add(log)
        await db.commit()

        suggestions = _generate_suggestions(request.message, request.code_context)
        return {
            "text": ai_text,
            "suggestions": suggestions,
            "session_id": session_id,
            "provider": "opencode-server",
        }

    except Exception as exc:
        logger.exception("OpenCode chat failed: %s", exc)
        # Remove failed session so next request creates a fresh one
        _oc_session_map.pop(session_id, None)
        return {
            "text": (
                f"抓歉，Vuls-Hunter AI 引擎暂时无法响应。\n\n"
                f"**当前配置：** `{server_url}`\n\n"
                "可能原因：\n"
                "1. OpenCode Server 未启动或地址不正确\n"
                "2. API Key 错误或过期\n"
                "3. 网络连接问题或请求超时\n\n"
                "解决方案： 确认 OpenCode Server 已运行，"
                "然后在模型设置中更新 Server 地址并测试连接。"
            ),
            "suggestions": ["前往模型设置", "检查 OpenCode Server"],
            "session_id": session_id,
        }


@router.post("/api/chat/reset-session")
async def reset_chat_session(body: dict) -> Any:
    """Reset (delete) an OpenCode session mapping so next message creates a fresh session."""
    session_id = body.get("session_id", "default")
    removed = _oc_session_map.pop(session_id, None)
    return {"ok": True, "removed": removed is not None, "session_id": session_id}


@router.post("/api/chat/analyze-url")
async def analyze_url_for_chat(
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Placeholder — URL analysis is handled by /api/upload/url.
    This endpoint exists for frontend compatibility.
    """
    return {"ok": True}


def _generate_suggestions(message: str, code_context: str | None = None) -> list[str]:
    """Generate contextual follow-up suggestions."""
    suggestions: list[str] = []
    msg_lower = message.lower()

    if code_context:
        suggestions = [
            "列出所有高危漏洞并给出修复补丁",
            "生成漏洞利用 PoC 代码",
            "分析漏洞攻击链和影响范围",
        ]
    elif any(w in msg_lower for w in ["sql", "注入", "injection"]):
        suggestions = ["展示 SQL 注入修复示例", "检查参数化查询", "生成防御代码"]
    elif any(w in msg_lower for w in ["xss", "跨站", "cross-site"]):
        suggestions = ["展示 XSS 修复方案", "分析 DOM-based XSS", "检查输出编码"]
    elif any(w in msg_lower for w in ["ssrf", "请求伪造"]):
        suggestions = ["分析 SSRF 利用路径", "展示白名单防御方案", "检查内网访问风险"]
    elif any(w in msg_lower for w in ["jwt", "token", "认证", "auth"]):
        suggestions = ["检查 JWT 配置安全性", "分析会话管理缺陷", "展示安全认证方案"]
    elif any(w in msg_lower for w in ["扫描", "分析", "审计", "scan"]):
        suggestions = ["上传代码压缩包分析", "输入 GitHub URL 分析", "查看已有漏洞报告"]
    else:
        suggestions = ["上传代码包开始漏洞挖掘", "输入 GitHub 仓库 URL 分析", "查看 OWASP Top 10 漏洞"]

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
