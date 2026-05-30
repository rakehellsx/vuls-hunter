"""Project management API routes."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
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


@router.post("/upload-archive", response_model=dict)
async def create_project_from_archive(
    name: str = Form(...),
    language: str = Form("Python"),
    description: str = Form(""),
    branch: str = Form("main"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Create a new project from an uploaded code archive (.zip / .tar.gz).
    Saves the archive to the uploads dir and creates a project record
    with repo_url pointing to the local extracted path.
    """
    import shutil, tempfile, zipfile, tarfile
    from pathlib import Path

    UPLOAD_DIR = Path(__file__).parent.parent.parent / "data" / "uploads"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    MAX_SIZE = 50 * 1024 * 1024  # 50 MB

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="文件过大，最大支持 50MB")

    filename = file.filename or "upload.zip"
    name_lower = filename.lower()
    is_archive = (
        name_lower.endswith(".zip")
        or name_lower.endswith(".tar")
        or name_lower.endswith(".tar.gz")
        or name_lower.endswith(".tgz")
        or name_lower.endswith(".tar.bz2")
        or name_lower.endswith(".tar.xz")
    )
    if not is_archive:
        raise HTTPException(status_code=400, detail="仅支持 .zip / .tar / .tar.gz 格式")

    # Save archive
    tmp_dir = Path(tempfile.mkdtemp(dir=UPLOAD_DIR))
    archive_path = tmp_dir / filename
    archive_path.write_bytes(content)

    # Create project record with repo_url = archive path
    repo_url = f"archive:{filename}"
    project = Project(
        name=name,
        repo_url=repo_url,
        language=language,
        description=description or f"从压缩包导入: {filename}",
        branch=branch,
    )
    db.add(project)
    log = AuditLog(
        action=f"创建项目(压缩包): {name}",
        level="info",
        details=f"文件: {filename}",
    )
    db.add(log)
    await db.commit()
    await db.refresh(project)

    # Store archive path in a sidecar file so scan can find it later
    sidecar = UPLOAD_DIR / f"project_{project.id}_archive.path"
    sidecar.write_text(str(archive_path))

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
        "archive_filename": filename,
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

    from .scans import QuickScanRequest, start_quick_scan

    # Check if this is an archive-based project
    if project.repo_url.startswith("archive:"):
        from pathlib import Path
        UPLOAD_DIR = Path(__file__).parent.parent.parent / "data" / "uploads"
        sidecar = UPLOAD_DIR / f"project_{project_id}_archive.path"
        combined_code = ""
        if sidecar.exists():
            archive_path = Path(sidecar.read_text().strip())
            if archive_path.exists():
                import tempfile, shutil
                from ..api.upload import _extract_archive, _collect_code_files
                tmp_dir = Path(tempfile.mkdtemp(dir=UPLOAD_DIR))
                extract_dir = tmp_dir / "extracted"
                extract_dir.mkdir()
                try:
                    _extract_archive(archive_path, extract_dir)
                    combined_code, file_list = _collect_code_files(extract_dir)
                except Exception as exc:
                    logger.warning("Archive extract failed: %s", exc)
                finally:
                    shutil.rmtree(tmp_dir, ignore_errors=True)

        request = QuickScanRequest(
            target=project.repo_url,
            code=combined_code or None,
            language=project.language,
            scan_mode=scan_mode,
            project_id=project_id,
            instruction=instruction,
        )
    else:
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
