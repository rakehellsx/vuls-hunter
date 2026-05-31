"""File upload and URL-based code analysis API."""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
import tempfile
import zipfile
import tarfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/upload", tags=["upload"])

# Upload temp directory
UPLOAD_DIR = Path(__file__).parent.parent.parent / "data" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Max upload size: 50MB
MAX_UPLOAD_SIZE = 50 * 1024 * 1024

# Supported archive extensions
ARCHIVE_EXTS = {".zip", ".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tar.xz"}

# Code file extensions to include in analysis
CODE_EXTS = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go", ".rb", ".php",
    ".c", ".cpp", ".h", ".cs", ".rs", ".swift", ".kt", ".scala",
    ".sh", ".bash", ".yaml", ".yml", ".json", ".xml", ".env",
    ".sql", ".graphql", ".proto",
}

# Max total code size to send to LLM (chars)
MAX_CODE_CHARS = 80_000


class AnalyzeUrlRequest(BaseModel):
    url: str
    scan_mode: str = "quick"
    instruction: str | None = None


def _extract_archive(archive_path: Path, extract_dir: Path) -> None:
    """Extract a zip or tar archive to the given directory."""
    suffix = "".join(archive_path.suffixes).lower()

    if suffix == ".zip" or archive_path.suffix.lower() == ".zip":
        with zipfile.ZipFile(archive_path, "r") as zf:
            # Security: prevent path traversal
            for member in zf.namelist():
                if ".." in member or member.startswith("/"):
                    continue
                zf.extract(member, extract_dir)
    elif ".tar" in suffix or suffix in (".tgz",):
        mode = "r:*"
        with tarfile.open(archive_path, mode) as tf:
            for member in tf.getmembers():
                if ".." in member.name or member.name.startswith("/"):
                    continue
            tf.extractall(extract_dir, filter="data")
    else:
        raise ValueError(f"Unsupported archive format: {suffix}")


def _collect_code_files(root_dir: Path, max_chars: int = MAX_CODE_CHARS) -> tuple[str, list[str]]:
    """Collect code files from a directory, returning combined content and file list."""
    code_parts: list[str] = []
    file_list: list[str] = []
    total_chars = 0

    # Sort files for deterministic order, prioritize common entry points
    priority_names = {"main.py", "app.py", "index.js", "server.js", "main.go", "App.tsx"}
    all_files: list[Path] = []

    for path in sorted(root_dir.rglob("*")):
        if not path.is_file():
            continue
        # Skip hidden dirs, node_modules, __pycache__, .git
        parts = path.relative_to(root_dir).parts
        if any(p.startswith(".") or p in ("node_modules", "__pycache__", ".git", "dist", "build", "vendor") for p in parts):
            continue
        if path.suffix.lower() in CODE_EXTS:
            all_files.append(path)

    # Sort: priority files first, then by path
    all_files.sort(key=lambda p: (p.name not in priority_names, str(p)))

    for path in all_files:
        if total_chars >= max_chars:
            break
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
            rel_path = str(path.relative_to(root_dir))
            file_list.append(rel_path)

            snippet = f"\n\n### File: {rel_path}\n```\n{content[:5000]}\n```"
            if total_chars + len(snippet) > max_chars:
                # Truncate
                remaining = max_chars - total_chars
                snippet = snippet[:remaining] + "\n... (truncated)"
                code_parts.append(snippet)
                total_chars = max_chars
                break
            code_parts.append(snippet)
            total_chars += len(snippet)
        except Exception:
            pass

    return "".join(code_parts), file_list


async def _clone_github_repo(url: str, target_dir: Path) -> str:
    """Clone a GitHub repository to target_dir. Returns the repo name."""
    import re

    # Normalize GitHub URL
    url = url.strip().rstrip("/")
    # Support: https://github.com/user/repo, github.com/user/repo
    if not url.startswith("http"):
        url = "https://" + url

    # Extract repo name
    match = re.search(r"github\.com/([^/]+/[^/]+?)(?:\.git)?(?:/.*)?$", url)
    repo_name = match.group(1).replace("/", "_") if match else "repo"

    # Use git clone (shallow)
    cmd = ["git", "clone", "--depth=1", "--single-branch", url, str(target_dir)]
    logger.info("Cloning: %s", " ".join(cmd))

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=120)
    output = stdout.decode("utf-8", errors="replace") if stdout else ""

    if proc.returncode != 0:
        raise RuntimeError(f"git clone failed (code {proc.returncode}): {output[:500]}")

    return repo_name


async def _download_generic_url(url: str, target_dir: Path) -> str:
    """Download a file from a generic URL to target_dir."""
    import urllib.request

    filename = url.split("/")[-1].split("?")[0] or "download"
    dest = target_dir / filename

    def _download():
        urllib.request.urlretrieve(url, str(dest))

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _download)
    return filename


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@router.post("/archive")
async def upload_archive(
    file: UploadFile = File(...),
    scan_mode: str = Form("quick"),
    instruction: str = Form(""),
) -> Any:
    """
    Upload a zip/tar archive for vulnerability analysis.
    Returns scan_id for WebSocket log streaming.
    """
    # Validate file size
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail=f"文件过大，最大支持 {MAX_UPLOAD_SIZE // 1024 // 1024}MB")

    # Validate extension
    filename = file.filename or "upload.zip"
    suffix = Path(filename).suffix.lower()
    name_lower = filename.lower()
    is_archive = (
        suffix in {".zip", ".tar", ".tgz"}
        or name_lower.endswith(".tar.gz")
        or name_lower.endswith(".tar.bz2")
        or name_lower.endswith(".tar.xz")
    )
    if not is_archive:
        raise HTTPException(
            status_code=400,
            detail="仅支持 .zip / .tar / .tar.gz / .tgz 格式的压缩包"
        )

    # Save to temp dir
    tmp_dir = Path(tempfile.mkdtemp(dir=UPLOAD_DIR))
    archive_path = tmp_dir / filename
    archive_path.write_bytes(content)

    # Extract
    extract_dir = tmp_dir / "extracted"
    extract_dir.mkdir()
    try:
        _extract_archive(archive_path, extract_dir)
    except Exception as exc:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"解压失败: {exc}")

    # Collect code
    combined_code, file_list = _collect_code_files(extract_dir)
    if not combined_code:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="压缩包中未找到可分析的代码文件")

    # Detect primary language
    language = _detect_language(file_list)

    # Trigger scan via internal scan API
    from .scans import start_quick_scan, QuickScanRequest
    from ..db.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        req = QuickScanRequest(
            target=f"archive:{filename}",
            code=combined_code,
            language=language,
            scan_mode=scan_mode,
            instruction=instruction or None,
        )
        scan_resp = await start_quick_scan(req, db)

    # Cleanup temp dir after a delay
    asyncio.create_task(_cleanup_later(tmp_dir, delay=300))

    return {
        "scan_id": scan_resp.id,
        "run_name": scan_resp.run_name,
        "target": scan_resp.target,
        "file_count": len(file_list),
        "language": language,
        "files_analyzed": file_list[:20],  # Return first 20 for display
        "code_content": combined_code,  # Full code for OpenCode analysis
        "message": f"已提取 {len(file_list)} 个代码文件，开始分析...",
    }


@router.post("/url")
async def analyze_url(body: AnalyzeUrlRequest) -> Any:
    """
    Analyze code from a URL (GitHub repo or direct file URL).
    Returns scan_id for WebSocket log streaming.
    """
    url = body.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL 不能为空")

    tmp_dir = Path(tempfile.mkdtemp(dir=UPLOAD_DIR))
    clone_dir = tmp_dir / "repo"
    clone_dir.mkdir()

    is_github = "github.com" in url.lower()

    try:
        if is_github:
            repo_name = await _clone_github_repo(url, clone_dir)
            combined_code, file_list = _collect_code_files(clone_dir)
            target_name = repo_name
        else:
            # Generic URL download
            filename = await _download_generic_url(url, clone_dir)
            dl_path = clone_dir / filename
            suffix = Path(filename).suffix.lower()
            name_lower = filename.lower()
            is_archive = (
                suffix in {".zip", ".tar", ".tgz"}
                or name_lower.endswith(".tar.gz")
            )
            if is_archive:
                extract_dir = tmp_dir / "extracted"
                extract_dir.mkdir()
                _extract_archive(dl_path, extract_dir)
                combined_code, file_list = _collect_code_files(extract_dir)
            else:
                # Single file
                try:
                    combined_code = dl_path.read_text(encoding="utf-8", errors="replace")
                    file_list = [filename]
                except Exception:
                    combined_code = ""
                    file_list = []
            target_name = filename

        if not combined_code:
            shutil.rmtree(tmp_dir, ignore_errors=True)
            raise HTTPException(status_code=400, detail="未找到可分析的代码文件")

        language = _detect_language(file_list)

        # Trigger scan
        from .scans import start_quick_scan, QuickScanRequest
        from ..db.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            req = QuickScanRequest(
                target=url,
                code=combined_code,
                language=language,
                scan_mode=body.scan_mode,
                instruction=body.instruction,
            )
            scan_resp = await start_quick_scan(req, db)

        asyncio.create_task(_cleanup_later(tmp_dir, delay=300))

        return {
            "scan_id": scan_resp.id,
            "run_name": scan_resp.run_name,
            "target": url,
            "target_name": target_name,
            "file_count": len(file_list),
            "language": language,
            "files_analyzed": file_list[:20],
            "code_content": combined_code,  # Full code for OpenCode analysis
            "message": f"已获取 {len(file_list)} 个代码文件，开始分析...",
        }

    except HTTPException:
        raise
    except asyncio.TimeoutError:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=408, detail="下载超时，请检查 URL 是否可访问")
    except Exception as exc:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        logger.exception("URL analysis failed: %s", url)
        raise HTTPException(status_code=500, detail=f"分析失败: {exc}")


def _detect_language(file_list: list[str]) -> str:
    """Detect primary programming language from file list."""
    ext_counts: dict[str, int] = {}
    for f in file_list:
        ext = Path(f).suffix.lower()
        ext_counts[ext] = ext_counts.get(ext, 0) + 1

    ext_lang_map = {
        ".py": "Python",
        ".js": "JavaScript",
        ".ts": "TypeScript",
        ".jsx": "JavaScript",
        ".tsx": "TypeScript",
        ".java": "Java",
        ".go": "Go",
        ".rb": "Ruby",
        ".php": "PHP",
        ".c": "C",
        ".cpp": "C++",
        ".cs": "C#",
        ".rs": "Rust",
        ".swift": "Swift",
        ".kt": "Kotlin",
        ".scala": "Scala",
        ".sh": "Shell",
    }

    if not ext_counts:
        return "Unknown"

    top_ext = max(ext_counts, key=lambda e: ext_counts[e])
    return ext_lang_map.get(top_ext, "Unknown")


async def _cleanup_later(path: Path, delay: int = 300) -> None:
    """Delete a directory after a delay (seconds)."""
    await asyncio.sleep(delay)
    shutil.rmtree(path, ignore_errors=True)
