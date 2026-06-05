"""Reports API routes."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import AuditLog, Report, get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/", response_model=list[dict])
async def list_reports(db: AsyncSession = Depends(get_db)) -> Any:
    """List all security audit reports."""
    result = await db.execute(select(Report).order_by(Report.created_at.desc()))
    reports = result.scalars().all()

    return [
        {
            "id": r.id,
            "report_id": r.report_id,
            "project_name": r.project_name,
            "executive_summary": r.executive_summary,
            "vulnerability_count": r.vulnerability_count or {"critical": 0, "high": 0, "medium": 0, "low": 0},
            "compliance_grade": r.compliance_grade,
            "created_at": r.created_at.isoformat(),
            "scan_id": r.scan_id,
        }
        for r in reports
    ]


@router.get("/{report_id}/markdown", response_class=PlainTextResponse)
async def get_report_markdown(report_id: int, db: AsyncSession = Depends(get_db)) -> str:
    """Get the full report in Markdown format."""
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report.full_report_md or "# Report\n\nNo content available."


@router.get("/{report_id}")
async def get_report(report_id: int, db: AsyncSession = Depends(get_db)) -> Any:
    """Get a specific report with full details."""
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    return {
        "id": report.id,
        "report_id": report.report_id,
        "project_name": report.project_name,
        "executive_summary": report.executive_summary,
        "methodology": report.methodology,
        "technical_analysis": report.technical_analysis,
        "recommendations": report.recommendations,
        "full_report_md": report.full_report_md,
        "vulnerability_count": report.vulnerability_count,
        "compliance_grade": report.compliance_grade,
        "created_at": report.created_at.isoformat(),
        "scan_id": report.scan_id,
    }
