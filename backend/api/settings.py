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

# Settings file path (persisted to disk)
SETTINGS_FILE = Path(__file__).parent.parent.parent / "data" / "llm_settings.json"
SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)


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


class LLMSettingsUpdate(BaseModel):
    providers: list[LLMProvider]
    active_provider_id: str | None = None


# ─────────────────────────────────────────────
# Default settings
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
        },
        {
            "id": "deepseek",
            "name": "DeepSeek",
            "base_url": "https://api.deepseek.com/v1",
            "api_key": "",
            "model": "deepseek-chat",
            "enabled": False,
            "is_default": False,
        },
    ],
    "active_provider_id": "openai-default",
}


def _load_settings() -> dict[str, Any]:
    """Load settings from disk, falling back to defaults."""
    if SETTINGS_FILE.exists():
        try:
            data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            # Merge with defaults to ensure all keys exist
            if "providers" not in data:
                data["providers"] = DEFAULT_SETTINGS["providers"]
            if "active_provider_id" not in data:
                data["active_provider_id"] = DEFAULT_SETTINGS["active_provider_id"]
            return data
        except Exception as exc:
            logger.warning("Failed to load settings: %s", exc)
    return DEFAULT_SETTINGS.copy()


def _save_settings(data: dict[str, Any]) -> None:
    """Save settings to disk."""
    SETTINGS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_active_llm_config() -> dict[str, str]:
    """Get the active LLM provider config for use in scan/chat calls."""
    settings = _load_settings()
    active_id = settings.get("active_provider_id")
    providers = settings.get("providers", [])

    # Find active provider
    active = None
    for p in providers:
        if p.get("id") == active_id and p.get("enabled"):
            active = p
            break

    # Fallback to first enabled provider
    if not active:
        for p in providers:
            if p.get("enabled"):
                active = p
                break

    if not active:
        # Use environment variables as last resort
        return {
            "api_key": os.environ.get("OPENAI_API_KEY", ""),
            "base_url": os.environ.get("OPENAI_BASE_URL", ""),
            "model": os.environ.get("STRIX_LLM", "gpt-4.1-mini"),
        }

    return {
        "api_key": active.get("api_key") or os.environ.get("OPENAI_API_KEY", ""),
        "base_url": active.get("base_url", ""),
        "model": active.get("model", "gpt-4.1-mini"),
    }


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@router.get("/llm")
async def get_llm_settings() -> Any:
    """Get current LLM settings."""
    settings = _load_settings()
    # Mask API keys for security (show only last 8 chars)
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
    """Update LLM settings."""
    settings = _load_settings()

    # Update providers (preserve existing API keys if not changed)
    existing_keys: dict[str, str] = {}
    for p in settings.get("providers", []):
        existing_keys[p["id"]] = p.get("api_key", "")

    providers_data = []
    for p in body.providers:
        pd = p.model_dump()
        # If API key is masked (contains ***), restore original
        if "***" in pd.get("api_key", ""):
            pd["api_key"] = existing_keys.get(p.id, "")
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
    """Test LLM provider connectivity."""
    import openai

    api_key = body.api_key
    # If masked, load from saved settings
    if "***" in api_key:
        settings = _load_settings()
        for p in settings.get("providers", []):
            if p["id"] == body.id:
                api_key = p.get("api_key", "")
                break

    if not api_key:
        raise HTTPException(status_code=400, detail="API Key 不能为空")

    # Normalize base_url: remove trailing /chat/completions if present
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
