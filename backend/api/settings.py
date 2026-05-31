"""LLM settings and configuration API."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings", tags=["settings"])

# Settings file paths (persisted to disk)
_DATA_DIR = Path(__file__).parent.parent.parent / "data"
_DATA_DIR.mkdir(parents=True, exist_ok=True)

SETTINGS_FILE = _DATA_DIR / "llm_settings.json"
OPENCODE_SETTINGS_FILE = _DATA_DIR / "opencode_settings.json"


# ─────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────

class LLMProvider(BaseModel):
    id: str
    name: str
    base_url: str
    api_key: str
    model: str
    enabled: bool = True
    is_default: bool = False
    provider_type: str = "openai_compatible"
    # keep these fields for backward compat but they are no longer used for chat
    opencode_server_url: str = ""
    opencode_provider_id: str = "openai"
    opencode_model_id: str = "gpt-4.1-mini"


class LLMSettingsUpdate(BaseModel):
    providers: list[LLMProvider]
    active_provider_id: str | None = None


class OpenCodeConfig(BaseModel):
    """Standalone OpenCode Server configuration (used exclusively by the chat module)."""
    server_url: str = "http://localhost:4096"
    provider_id: str = "openai"
    model_id: str = "gpt-4.1-mini"
    enabled: bool = True


# ─────────────────────────────────────────────
# Default LLM settings (for scan / rule compile / etc.)
# ─────────────────────────────────────────────

DEFAULT_SETTINGS: dict[str, Any] = {
    "providers": [
        {
            "id": "openai-default",
            "name": "OpenAI (Default)",
            "base_url": os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            "api_key": "",
            "model": "gpt-4.1-mini",
            "enabled": True,
            "is_default": True,
            "provider_type": "openai_compatible",
            "opencode_server_url": "",
            "opencode_provider_id": "openai",
            "opencode_model_id": "gpt-4.1-mini",
        },
        {
            "id": "deepseek",
            "name": "DeepSeek",
            "base_url": "https://api.deepseek.com/v1",
            "api_key": "",
            "model": "deepseek-chat",
            "enabled": False,
            "is_default": False,
            "provider_type": "openai_compatible",
            "opencode_server_url": "",
            "opencode_provider_id": "deepseek",
            "opencode_model_id": "deepseek-chat",
        },
        {
            "id": "groq",
            "name": "Groq",
            "base_url": "https://api.groq.com/openai/v1",
            "api_key": "",
            "model": "llama-3.3-70b-versatile",
            "enabled": False,
            "is_default": False,
            "provider_type": "openai_compatible",
            "opencode_server_url": "",
            "opencode_provider_id": "groq",
            "opencode_model_id": "llama-3.3-70b-versatile",
        },
        {
            "id": "ollama",
            "name": "Ollama (Local)",
            "base_url": "http://localhost:11434/v1",
            "api_key": "ollama",
            "model": "llama3",
            "enabled": False,
            "is_default": False,
            "provider_type": "openai_compatible",
            "opencode_server_url": "",
            "opencode_provider_id": "ollama",
            "opencode_model_id": "llama3",
        },
    ],
    "active_provider_id": "openai-default",
}

# Default OpenCode settings
DEFAULT_OPENCODE: dict[str, Any] = {
    "server_url": os.environ.get("OPENCODE_SERVER_URL", "http://localhost:4096"),
    "provider_id": os.environ.get("OPENCODE_PROVIDER_ID", "openai"),
    "model_id": os.environ.get("OPENCODE_MODEL_ID", "gpt-4.1-mini"),
    "enabled": True,
}


# ─────────────────────────────────────────────
# LLM settings helpers
# ─────────────────────────────────────────────

def _load_settings() -> dict[str, Any]:
    """Load LLM settings from disk, falling back to defaults."""
    if SETTINGS_FILE.exists():
        try:
            data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            if "providers" not in data:
                data["providers"] = DEFAULT_SETTINGS["providers"]
            if "active_provider_id" not in data:
                data["active_provider_id"] = DEFAULT_SETTINGS["active_provider_id"]
            # Ensure new fields exist on old saved providers
            for p in data["providers"]:
                p.setdefault("provider_type", "openai_compatible")
                p.setdefault("opencode_server_url", "")
                p.setdefault("opencode_provider_id", "openai")
                p.setdefault("opencode_model_id", p.get("model", "gpt-4.1-mini"))
            # Remove opencode-server from LLM providers list if present (legacy cleanup)
            data["providers"] = [p for p in data["providers"] if p.get("id") != "opencode-server"]
            return data
        except Exception as exc:
            logger.warning("Failed to load LLM settings: %s", exc)
    return DEFAULT_SETTINGS.copy()


def _save_settings(data: dict[str, Any]) -> None:
    """Save LLM settings to disk."""
    SETTINGS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_active_llm_config() -> dict[str, Any]:
    """Get the active LLM provider config for scan/rule-compile calls (OpenAI-compatible only)."""
    settings = _load_settings()
    active_id = settings.get("active_provider_id")
    providers = settings.get("providers", [])

    active = None
    for p in providers:
        if p.get("id") == active_id and p.get("enabled"):
            active = p
            break

    if not active:
        for p in providers:
            if p.get("enabled"):
                active = p
                break

    if not active:
        return {
            "provider_type": "openai_compatible",
            "api_key": os.environ.get("OPENAI_API_KEY", ""),
            "base_url": os.environ.get("OPENAI_BASE_URL", ""),
            "model": os.environ.get("STRIX_LLM", "gpt-4.1-mini"),
        }

    return {
        "provider_type": "openai_compatible",
        "api_key": active.get("api_key") or os.environ.get("OPENAI_API_KEY", ""),
        "base_url": active.get("base_url", ""),
        "model": active.get("model", "gpt-4.1-mini"),
    }


# ─────────────────────────────────────────────
# OpenCode settings helpers (chat module only)
# ─────────────────────────────────────────────

def _load_opencode_settings() -> dict[str, Any]:
    """Load OpenCode settings from disk, falling back to defaults."""
    if OPENCODE_SETTINGS_FILE.exists():
        try:
            data = json.loads(OPENCODE_SETTINGS_FILE.read_text(encoding="utf-8"))
            # Ensure all keys exist
            data.setdefault("server_url", DEFAULT_OPENCODE["server_url"])
            data.setdefault("provider_id", DEFAULT_OPENCODE["provider_id"])
            data.setdefault("model_id", DEFAULT_OPENCODE["model_id"])
            data.setdefault("enabled", DEFAULT_OPENCODE["enabled"])
            return data
        except Exception as exc:
            logger.warning("Failed to load OpenCode settings: %s", exc)
    return DEFAULT_OPENCODE.copy()


def _save_opencode_settings(data: dict[str, Any]) -> None:
    """Save OpenCode settings to disk."""
    OPENCODE_SETTINGS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_opencode_config() -> dict[str, Any]:
    """Get OpenCode Server config for the chat module."""
    return _load_opencode_settings()


# ─────────────────────────────────────────────
# Routes — LLM (for scan / rule compile / etc.)
# ─────────────────────────────────────────────

@router.get("/llm")
async def get_llm_settings() -> Any:
    """Get current LLM settings (scan/rule providers)."""
    settings = _load_settings()
    masked = json.loads(json.dumps(settings))
    for p in masked.get("providers", []):
        key = p.get("api_key", "")
        if key and len(key) > 8:
            p["api_key_masked"] = "*" * (len(key) - 8) + key[-8:]
        else:
            p["api_key_masked"] = key
    return masked


@router.put("/llm")
async def update_llm_settings(body: LLMSettingsUpdate) -> Any:
    """Update LLM settings (scan/rule providers)."""
    settings = _load_settings()

    existing_keys: dict[str, str] = {}
    for p in settings.get("providers", []):
        existing_keys[p["id"]] = p.get("api_key", "")

    providers_data = []
    for p in body.providers:
        pd = p.model_dump()
        if "***" in pd.get("api_key", ""):
            pd["api_key"] = existing_keys.get(p.id, "")
        # Ensure opencode-server is never stored in LLM providers
        if pd.get("id") == "opencode-server":
            continue
        providers_data.append(pd)

    settings["providers"] = providers_data
    if body.active_provider_id is not None:
        settings["active_provider_id"] = body.active_provider_id

    _save_settings(settings)

    # Apply active provider to environment for immediate effect
    active_config = get_active_llm_config()
    if active_config.get("api_key"):
        os.environ["OPENAI_API_KEY"] = active_config["api_key"]
    if active_config.get("base_url"):
        os.environ["OPENAI_BASE_URL"] = active_config["base_url"]
    if active_config.get("model"):
        os.environ["STRIX_LLM"] = active_config["model"]

    logger.info("LLM settings updated, active provider: %s", settings.get("active_provider_id"))
    return {"success": True, "message": "LLM 配置已保存并生效"}


@router.post("/llm/test")
async def test_llm_connection(body: LLMProvider) -> Any:
    """Test LLM provider connectivity (OpenAI-compatible only)."""
    import openai

    api_key = body.api_key
    if "***" in api_key:
        settings = _load_settings()
        for p in settings.get("providers", []):
            if p["id"] == body.id:
                api_key = p.get("api_key", "")
                break

    if not api_key:
        raise HTTPException(status_code=400, detail="API Key 不能为空")

    base_url = body.base_url.rstrip("/")
    if base_url.endswith("/chat/completions"):
        base_url = base_url[: -len("/chat/completions")]

    try:
        client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=15.0,
        )
        response = await client.chat.completions.create(
            model=body.model,
            messages=[{"role": "user", "content": "Hello, reply with 'OK' only."}],
            max_tokens=10,
        )
        reply = response.choices[0].message.content or ""
        return {
            "success": True,
            "message": f"连接成功！模型响应: {reply[:50]}",
            "model": body.model,
        }
    except Exception as exc:
        logger.warning("LLM test failed: %s", exc)
        raise HTTPException(status_code=400, detail=f"连接失败: {exc}")


# ─────────────────────────────────────────────
# Routes — OpenCode (for chat module only)
# ─────────────────────────────────────────────

@router.get("/opencode")
async def get_opencode_settings() -> Any:
    """Get OpenCode Server settings (used exclusively by the chat module)."""
    return _load_opencode_settings()


@router.put("/opencode")
async def update_opencode_settings(body: OpenCodeConfig) -> Any:
    """Update OpenCode Server settings."""
    data = {
        "server_url": body.server_url.rstrip("/"),
        "provider_id": body.provider_id,
        "model_id": body.model_id,
        "enabled": body.enabled,
    }
    _save_opencode_settings(data)
    logger.info("OpenCode settings updated: %s", data)
    return {"success": True, "message": "OpenCode 配置已保存并生效"}


@router.post("/opencode/test")
async def test_opencode_connection(body: OpenCodeConfig) -> Any:
    """Test OpenCode Server connectivity."""
    import httpx

    server_url = (body.server_url or "").rstrip("/")
    if not server_url:
        raise HTTPException(status_code=400, detail="OpenCode Server 地址不能为空")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{server_url}/global/health")
            resp.raise_for_status()
            health = resp.json()
        version = health.get("version", "unknown")
        return {
            "success": True,
            "message": f"OpenCode Server 连接成功！版本: {version}",
            "version": version,
        }
    except Exception as exc:
        logger.warning("OpenCode server test failed: %s", exc)
        raise HTTPException(status_code=400, detail=f"连接失败: {exc}")
