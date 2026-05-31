"""Security rules API routes."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import AuditLog, Rule, SeverityLevel, get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rules", tags=["rules"])


class RuleCreate(BaseModel):
    name: str
    language: str = "Python"
    severity: str = "medium"
    cwe: str
    description: str
    example_bad: str | None = None
    example_good: str | None = None
    rule_type: str = "security"


@router.get("/", response_model=list[dict])
async def list_rules(db: AsyncSession = Depends(get_db)) -> Any:
    """List all security rules."""
    result = await db.execute(select(Rule).order_by(Rule.is_builtin.desc(), Rule.created_at.desc()))
    rules = result.scalars().all()

    return [
        {
            "id": r.id,
            "name": r.name,
            "language": r.language,
            "severity": r.severity.value,
            "cwe": r.cwe,
            "description": r.description,
            "example_bad": r.example_bad,
            "example_good": r.example_good,
            "rule_type": r.rule_type,
            "is_builtin": r.is_builtin,
            "is_active": r.is_active,
            "created_at": r.created_at.isoformat(),
        }
        for r in rules
    ]


@router.post("/", response_model=dict)
async def create_rule(data: RuleCreate, db: AsyncSession = Depends(get_db)) -> Any:
    """Create a custom security rule."""
    try:
        severity = SeverityLevel(data.severity)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid severity: {data.severity}")

    rule = Rule(
        name=data.name,
        language=data.language,
        severity=severity,
        cwe=data.cwe,
        description=data.description,
        example_bad=data.example_bad,
        example_good=data.example_good,
        rule_type=data.rule_type,
        is_builtin=False,
    )
    db.add(rule)
    log = AuditLog(action=f"创建安全规则: {data.name}", level="info")
    db.add(log)
    await db.commit()
    await db.refresh(rule)

    return {
        "id": rule.id,
        "name": rule.name,
        "language": rule.language,
        "severity": rule.severity.value,
        "cwe": rule.cwe,
        "description": rule.description,
        "example_bad": rule.example_bad,
        "example_good": rule.example_good,
        "rule_type": rule.rule_type,
        "is_builtin": rule.is_builtin,
        "is_active": rule.is_active,
        "created_at": rule.created_at.isoformat(),
    }


@router.delete("/{rule_id}")
async def delete_rule(rule_id: int, db: AsyncSession = Depends(get_db)) -> Any:
    """Delete a custom security rule."""
    result = await db.execute(select(Rule).where(Rule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    if rule.is_builtin:
        raise HTTPException(status_code=403, detail="Cannot delete built-in rules")

    log = AuditLog(action=f"删除安全规则: {rule.name}", level="warning")
    db.add(log)
    await db.delete(rule)
    await db.commit()
    return {"success": True}


@router.post("/{rule_id}/compile")
async def compile_rule_with_ai(
    rule_id: int, db: AsyncSession = Depends(get_db)
) -> Any:
    """Use AI to compile and enhance a security rule."""
    import os
    import openai

    result = await db.execute(select(Rule).where(Rule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    try:
        client = openai.AsyncOpenAI(
            api_key=os.environ.get("OPENAI_API_KEY"),
            base_url=os.environ.get("OPENAI_BASE_URL"),
        )

        prompt = f"""You are a security expert. Enhance the following security rule with better examples and description.

Rule: {rule.name}
CWE: {rule.cwe}
Description: {rule.description}
Current bad example: {rule.example_bad or 'None'}
Current good example: {rule.example_good or 'None'}

Provide improved examples in JSON:
{{
  "description": "improved description",
  "example_bad": "concrete bad code example",
  "example_good": "concrete good code example"
}}"""

        response = await client.chat.completions.create(
            model=os.environ.get("STRIX_LLM", "gpt-4.1-mini"),
            messages=[
                {"role": "system", "content": "You are a security expert. Respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )

        import json
        enhanced = json.loads(response.choices[0].message.content or "{}")

        if enhanced.get("description"):
            rule.description = enhanced["description"]
        if enhanced.get("example_bad"):
            rule.example_bad = enhanced["example_bad"]
        if enhanced.get("example_good"):
            rule.example_good = enhanced["example_good"]

        log = AuditLog(action=f"AI 编译规则: {rule.name}", level="info")
        db.add(log)
        await db.commit()

        return {
            "success": True,
            "description": rule.description,
            "example_bad": rule.example_bad,
            "example_good": rule.example_good,
        }

    except Exception as exc:
        logger.exception("Rule compilation failed")
        raise HTTPException(status_code=500, detail=f"AI compilation failed: {exc}")
