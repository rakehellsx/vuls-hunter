"""Overview, audit logs, and chat API routes."""
from __future__ import annotations

import json
import logging
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import (
    AuditLog,
    ChatMessage,
    ChatSession,
    Project,
    Report,
    Scan,
    ScanStatus,
    Vulnerability,
    get_db,
)

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
# Chat Agent — OpenCode API + SQLite Persistence
# ─────────────────────────────────────────────

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


# ─── DB helpers ──────────────────────────────────────────────────────────────

async def _get_or_create_db_session(
    db: AsyncSession, session_key: str
) -> ChatSession:
    """Get existing ChatSession row or create a new one."""
    result = await db.execute(
        select(ChatSession).where(ChatSession.session_key == session_key)
    )
    sess = result.scalar_one_or_none()
    if sess is None:
        sess = ChatSession(session_key=session_key)
        db.add(sess)
        await db.flush()  # get sess.id without committing
    return sess


async def _get_db_session_history(
    db: AsyncSession, session_db_id: int, limit: int = 40
) -> list[dict]:
    """Return the last `limit` messages as list of {role, content} dicts."""
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_db_id)
        .order_by(ChatMessage.id.desc())
        .limit(limit)
    )
    rows = list(reversed(result.scalars().all()))
    return [{"role": r.role, "content": r.content} for r in rows]


async def _save_messages(
    db: AsyncSession,
    session_db_id: int,
    user_text: str,
    ai_text: str,
    suggestions: list[str] | None = None,
) -> None:
    """Persist user + assistant messages to the database."""
    db.add(ChatMessage(session_id=session_db_id, role="user", content=user_text))
    db.add(ChatMessage(
        session_id=session_db_id,
        role="assistant",
        content=ai_text,
        suggestions=json.dumps(suggestions, ensure_ascii=False) if suggestions else None,
    ))


# ─── OpenCode helpers ─────────────────────────────────────────────────────────

async def _get_or_create_oc_session(
    server_url: str,
    db_session: ChatSession,
    db: AsyncSession,
    hclient: Any,
) -> str:
    """Get existing OpenCode session or create a new one, persisted in DB."""
    if db_session.oc_session_id:
        return db_session.oc_session_id

    sess_resp = await hclient.post(
        f"{server_url}/session",
        json={},
        headers={"Content-Type": "application/json"},
        timeout=30.0,
    )
    sess_resp.raise_for_status()
    oc_session_id = sess_resp.json()["id"]

    # Persist the OpenCode session ID
    db_session.oc_session_id = oc_session_id
    await db.flush()
    logger.info(
        "Created OpenCode session: %s -> %s",
        db_session.session_key,
        oc_session_id,
    )
    return oc_session_id


async def _send_to_opencode(
    server_url: str,
    oc_session_id: str,
    message_text: str,
    hclient: Any,
    model_id: str | None = None,
    provider_id: str | None = None,
) -> str:
    """Send a message to OpenCode and extract the text response.

    Does NOT hardcode providerID/modelID — uses OpenCode Server's default
    model configuration unless explicitly specified.
    """
    payload: dict = {
        "parts": [{"type": "text", "text": message_text}],
    }
    # Only pass model field if explicitly configured; otherwise let OpenCode
    # use its own default model (avoids 401/provider-not-found errors)
    if provider_id and model_id:
        payload["model"] = {"providerID": provider_id, "modelID": model_id}

    msg_resp = await hclient.post(
        f"{server_url}/session/{oc_session_id}/message",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=180.0,
    )
    msg_resp.raise_for_status()
    msg_data = msg_resp.json()

    # Extract text from parts array
    ai_text = ""
    for part in msg_data.get("parts", []):
        if part.get("type") == "text":
            ai_text += part.get("text", "")

    if ai_text:
        return ai_text

    # parts is empty — check info.error for the real error reason
    info = msg_data.get("info") or {}
    error = info.get("error") or {}
    if error:
        err_name = error.get("name", "UnknownError")
        err_data = error.get("data") or {}
        err_msg = err_data.get("message") or str(error)
        status_code = err_data.get("statusCode", "")
        raise RuntimeError(
            f"OpenCode LLM 调用失败 [{err_name}] "
            f"{'(HTTP ' + str(status_code) + ') ' if status_code else ''}"
            f"{err_msg}"
        )

    return "OpenCode 已处理请求，但未返回文本内容。"


# ─── Chat endpoints ───────────────────────────────────────────────────────────

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
    All conversation history is persisted to SQLite.
    """
    import httpx
    from .settings import get_opencode_config

    oc_config = get_opencode_config()
    session_key = request.session_id or "default"

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
            "session_id": session_key,
        }

    # ── Get or create DB session ──────────────────────────────────────────────
    db_session = await _get_or_create_db_session(db, session_key)
    is_new_session = db_session.oc_session_id is None

    # ── Build message text ────────────────────────────────────────────────────
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
        async with httpx.AsyncClient(timeout=None, headers=headers) as hclient:
            oc_session_id = await _get_or_create_oc_session(
                server_url, db_session, db, hclient
            )
            # Do not pass providerID/modelID — let OpenCode use its own default model
            ai_text = await _send_to_opencode(
                server_url, oc_session_id, full_message, hclient
            )

        suggestions = _generate_suggestions(request.message, request.code_context)

        # ── Update session title if it's the first real message ───────────────
        if db_session.title in ("新建挖掘会话", "") or not db_session.title:
            db_session.title = request.message[:30] + ("..." if len(request.message) > 30 else "")

        # ── Persist messages ──────────────────────────────────────────────────
        await _save_messages(db, db_session.id, request.message, ai_text, suggestions)

        # ── Audit log ─────────────────────────────────────────────────────────
        log = AuditLog(
            action=f"OpenCode 对话: {request.message[:80]}",
            level="info",
        )
        db.add(log)
        await db.commit()

        return {
            "text": ai_text,
            "suggestions": suggestions,
            "session_id": session_key,
            "provider": "opencode-server",
        }

    except Exception as exc:
        logger.exception("OpenCode chat failed: %s", exc)
        # Clear the OpenCode session ID so next request creates a fresh one
        db_session.oc_session_id = None
        err_detail = str(exc)
        err_text = (
            f"抓歉，Vuls-Hunter AI 引擎暂时无法响应。\n\n"
            f"**当前配置：** `{server_url}`\n\n"
            f"**错误信息：** `{err_detail}`\n\n"
            "常见原因：\n"
            "1. OpenCode Server 未启动或地址不正确\n"
            "2. OpenCode Server 内部的 LLM 提供商 API Key 错误或未配置\n"
            "3. 网络连接问题或请求超时\n\n"
            "解决方案：\n"
            "- 确认 OpenCode Server 已运行，在模型设置中点击「测试连接」\n"
            "- 确认 OpenCode Server 内部已正确配置 LLM 提供商（如 openai、anthropic）"
        )
        # Still persist the user message + error response so history is not lost
        try:
            await _save_messages(
                db, db_session.id, request.message, err_text,
                ["前往模型设置", "检查 OpenCode Server"]
            )
        except Exception:
            pass
        await db.commit()
        return {
            "text": (
                f"抓歉，Vuls-Hunter AI 引擎暂时无法响应。\n\n"
                f"**当前配置：** `{server_url}`\n\n"
                f"**错误信息：** `{err_detail}`\n\n"
                "常见原因：\n"
                "1. OpenCode Server 未启动或地址不正确\n"
                "2. OpenCode Server 内部的 LLM 提供商 API Key 错误或未配置\n"
                "3. 网络连接问题或请求超时\n\n"
                "解决方案：\n"
                "- 确认 OpenCode Server 已运行，在模型设置中点击「测试连接」\n"
                "- 确认 OpenCode Server 内部已正确配置 LLM 提供商（如 openai、anthropic）"
            ),
            "suggestions": ["前往模型设置", "检查 OpenCode Server"],
            "session_id": session_key,
        }


@router.get("/api/chat/sessions")
async def list_chat_sessions(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """List all persisted chat sessions, newest first."""
    result = await db.execute(
        select(ChatSession)
        .order_by(ChatSession.updated_at.desc())
        .limit(limit)
    )
    sessions = result.scalars().all()

    # For each session, fetch the last message preview
    out = []
    for sess in sessions:
        last_msg_result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == sess.id)
            .order_by(ChatMessage.id.desc())
            .limit(1)
        )
        last_msg = last_msg_result.scalar_one_or_none()
        out.append({
            "session_key": sess.session_key,
            "title": sess.title,
            "last_message": (last_msg.content[:60] + "...") if last_msg and len(last_msg.content) > 60 else (last_msg.content if last_msg else ""),
            "message_count": 0,  # lightweight, skip count query
            "created_at": sess.created_at.isoformat(),
            "updated_at": sess.updated_at.isoformat(),
        })
    return out


@router.get("/api/chat/sessions/{session_key}/messages")
async def get_session_messages(
    session_key: str,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Get all messages for a specific chat session."""
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.session_key == session_key)
        .options(selectinload(ChatSession.messages))
    )
    sess = result.scalar_one_or_none()
    if sess is None:
        raise HTTPException(status_code=404, detail="会话不存在")

    return {
        "session_key": sess.session_key,
        "title": sess.title,
        "created_at": sess.created_at.isoformat(),
        "updated_at": sess.updated_at.isoformat(),
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "suggestions": json.loads(m.suggestions) if m.suggestions else [],
                "created_at": m.created_at.isoformat(),
            }
            for m in sess.messages
        ],
    }


@router.delete("/api/chat/sessions/{session_key}")
async def delete_chat_session(
    session_key: str,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Delete a chat session and all its messages."""
    result = await db.execute(
        select(ChatSession).where(ChatSession.session_key == session_key)
    )
    sess = result.scalar_one_or_none()
    if sess is None:
        raise HTTPException(status_code=404, detail="会话不存在")

    await db.delete(sess)
    log = AuditLog(action=f"删除对话会话: {session_key}", level="info")
    db.add(log)
    await db.commit()
    return {"ok": True, "session_key": session_key}


@router.post("/api/chat/reset-session")
async def reset_chat_session(
    body: dict,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Reset the OpenCode session mapping so next message creates a fresh OC session.
    Does NOT delete message history — only clears the oc_session_id link.
    """
    session_key = body.get("session_id", "default")
    result = await db.execute(
        select(ChatSession).where(ChatSession.session_key == session_key)
    )
    sess = result.scalar_one_or_none()
    if sess:
        sess.oc_session_id = None
        await db.commit()
        return {"ok": True, "removed": True, "session_id": session_key}
    return {"ok": True, "removed": False, "session_id": session_key}


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
    elif any(w in msg_lower for w in ["扫描", "分析", "审计"]):
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
