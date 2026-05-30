"""Project management API routes."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import AuditLog, Project, Scan, ScanStatus, Vulnerability, get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    repo_url: str
    language: str = "Python"
    description: str | None = None
    branch: str = "main"


class ProjectResponse(BaseModel):
    id: int
    name: str
    repo_url: str
    language: str
    description: str | None
    branch: str
    created_at: str
    vulnerability_summary: dict
    latest_scan_status: str | None


@router.get("/", response_model=list[dict])
async def list_projects(db: AsyncSession = Depends(get_db)) -> Any:
    """List all projects with vulnerability summaries."""
    result = await db.execute(
        select(Project).order_by(Project.created_at.desc())
    )
    projects = result.scalars().all()

    project_list = []
    for p in projects:
        # Get scans for this project
        scan_result = await db.execute(
            select(Scan)
            .where(Scan.project_id == p.id)
            .order_by(Scan.created_at.desc())
            .limit(1)
        )
        latest_scan = scan_result.scalar_one_or_none()

        # Get vulnerability counts
        vuln_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        if latest_scan:
            vuln_result = await db.execute(
                select(Vulnerability).where(
                    Vulnerability.scan_id == latest_scan.id,
                    Vulnerability.status == "unresolved",
                )
            )
            vulns = vuln_result.scalars().all()
            for v in vulns:
                sev = v.severity.value
                if sev in vuln_counts:
                    vuln_counts[sev] += 1

        project_list.append({
            "id": p.id,
            "name": p.name,
            "repo_url": p.repo_url,
            "language": p.language,
            "description": p.description,
            "branch": p.branch,
            "created_at": p.created_at.isoformat(),
            "vulnerability_summary": vuln_counts,
            "latest_scan_status": latest_scan.status.value if latest_scan else None,
            "latest_scan_id": latest_scan.id if latest_scan else None,
        })

    return project_list


@router.post("/", response_model=dict)
async def create_project(
    data: ProjectCreate, db: AsyncSession = Depends(get_db)
) -> Any:
    """Create a new project."""
    project = Project(
        name=data.name,
        repo_url=data.repo_url,
        language=data.language,
        description=data.description,
        branch=data.branch,
    )
    db.add(project)
    log = AuditLog(
        action=f"创建项目: {data.name}",
        level="info",
        details=f"仓库: {data.repo_url}",
    )
    db.add(log)
    await db.commit()
    await db.refresh(project)

    return {
        "id": project.id,
        "name": project.name,
        "repo_url": project.repo_url,
        "language": project.language,
        "description": project.description,
        "branch": project.branch,
        "created_at": project.created_at.isoformat(),
        "vulnerability_summary": {"critical": 0, "high": 0, "medium": 0, "low": 0},
        "latest_scan_status": None,
        "latest_scan_id": None,
    }


@router.delete("/{project_id}")
async def delete_project(
    project_id: int, db: AsyncSession = Depends(get_db)
) -> Any:
    """Delete a project and all associated scans."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    log = AuditLog(
        action=f"删除项目: {project.name}",
        level="warning",
    )
    db.add(log)
    await db.delete(project)
    await db.commit()
    return {"success": True}


@router.post("/{project_id}/scan")
async def start_project_scan(
    project_id: int,
    scan_mode: str = "standard",
    instruction: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Start a scan for a project."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Delegate to scan API
    from .scans import QuickScanRequest, start_quick_scan
    request = QuickScanRequest(
        target=project.repo_url,
        scan_mode=scan_mode,
        project_id=project_id,
        instruction=instruction,
    )
    return await start_quick_scan(request, db)


@router.get("/{project_id}/scans")
async def get_project_scans(
    project_id: int, db: AsyncSession = Depends(get_db)
) -> Any:
    """Get all scans for a project."""
    result = await db.execute(
        select(Scan)
        .where(Scan.project_id == project_id)
        .order_by(Scan.created_at.desc())
    )
    scans = result.scalars().all()

    return [
        {
            "id": s.id,
            "run_name": s.run_name,
            "target": s.target,
            "scan_mode": s.scan_mode,
            "status": s.status.value,
            "created_at": s.created_at.isoformat(),
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
        }
        for s in scans
    ]
