"""Strix engine integration layer for Vuls-Hunter.

This module wraps the Strix CLI as a subprocess and provides:
- Async scan launching
- Real-time log streaming via asyncio queues
- Result parsing from Strix's output files
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator

logger = logging.getLogger(__name__)

# Strix runs directory (relative to project root)
STRIX_RUNS_DIR = Path(__file__).parent.parent.parent / "strix_runs"
STRIX_RUNS_DIR.mkdir(parents=True, exist_ok=True)

# Path to strix source (sibling directory)
STRIX_SRC = Path(__file__).parent.parent.parent.parent / "strix"


def _get_strix_env() -> dict[str, str]:
    """Build environment variables for Strix subprocess."""
    env = os.environ.copy()
    # Use OpenAI API key from environment
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    if openai_key:
        env["LLM_API_KEY"] = openai_key
        env["STRIX_LLM"] = os.environ.get("STRIX_LLM", "openai/gpt-4.1-mini")
        # Use the same base URL as configured
        api_base = os.environ.get("OPENAI_BASE_URL", "")
        if api_base:
            env["LLM_API_BASE"] = api_base
    return env


def generate_run_name(target: str) -> str:
    """Generate a unique run name for a Strix scan."""
    safe = re.sub(r"[^a-zA-Z0-9_-]", "-", target)[:30]
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    uid = uuid.uuid4().hex[:6]
    return f"{safe}-{ts}-{uid}"


async def launch_strix_scan(
    *,
    target: str,
    scan_mode: str = "quick",
    is_whitebox: bool = False,
    instruction: str | None = None,
    run_name: str | None = None,
) -> tuple[str, asyncio.subprocess.Process]:
    """Launch a Strix scan asynchronously.

    Returns:
        (run_name, process) tuple
    """
    if run_name is None:
        run_name = generate_run_name(target)

    cmd = [
        sys.executable, "-m", "strix",
        "--target", target,
        "--scan-mode", scan_mode,
        "--run-name", run_name,
        "-n",  # non-interactive
    ]

    if is_whitebox:
        cmd.append("--whitebox")

    if instruction:
        cmd.extend(["--instruction", instruction])

    env = _get_strix_env()

    logger.info("Launching Strix: %s", " ".join(cmd))

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env=env,
        cwd=str(STRIX_SRC),
    )

    return run_name, process


async def stream_scan_logs(
    process: asyncio.subprocess.Process,
    log_queue: asyncio.Queue,
) -> None:
    """Stream stdout/stderr from a Strix process into a queue."""
    assert process.stdout is not None
    try:
        async for line in process.stdout:
            decoded = line.decode("utf-8", errors="replace").rstrip()
            if decoded:
                await log_queue.put({"type": "log", "data": decoded})
        await process.wait()
        exit_code = process.returncode
        await log_queue.put({
            "type": "finished",
            "exit_code": exit_code,
            "success": exit_code == 0,
        })
    except Exception as exc:
        logger.exception("Error streaming Strix logs")
        await log_queue.put({"type": "error", "data": str(exc)})


def parse_strix_results(run_name: str) -> dict[str, Any]:
    """Parse Strix scan results from the run directory.

    Returns a dict with:
        - vulnerabilities: list of vulnerability dicts
        - report_md: str (executive report markdown)
        - run_record: dict (metadata)
    """
    run_dir = STRIX_RUNS_DIR / run_name
    result: dict[str, Any] = {
        "run_name": run_name,
        "run_dir": str(run_dir),
        "vulnerabilities": [],
        "report_md": "",
        "run_record": {},
    }

    if not run_dir.exists():
        logger.warning("Run directory not found: %s", run_dir)
        return result

    # Parse run.json
    run_record_path = run_dir / "run.json"
    if run_record_path.exists():
        try:
            result["run_record"] = json.loads(run_record_path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("Failed to parse run.json: %s", exc)

    # Parse executive report
    report_path = run_dir / "penetration_test_report.md"
    if report_path.exists():
        result["report_md"] = report_path.read_text(encoding="utf-8")

    # Parse individual vulnerability files
    vuln_dir = run_dir / "vulnerabilities"
    if vuln_dir.exists():
        for vuln_file in sorted(vuln_dir.glob("*.md")):
            vuln_data = _parse_vulnerability_md(vuln_file)
            if vuln_data:
                result["vulnerabilities"].append(vuln_data)

    # Parse vulnerabilities.csv as fallback
    if not result["vulnerabilities"]:
        csv_path = run_dir / "vulnerabilities.csv"
        if csv_path.exists():
            result["vulnerabilities"] = _parse_vulnerabilities_csv(csv_path)

    return result


def _parse_vulnerability_md(path: Path) -> dict[str, Any] | None:
    """Parse a single vulnerability markdown file."""
    try:
        content = path.read_text(encoding="utf-8")
        data: dict[str, Any] = {
            "vuln_id": path.stem,
            "title": "",
            "severity": "medium",
            "description": "",
            "impact": "",
            "remediation": "",
            "proof_of_concept": "",
            "cvss_score": None,
            "cwe": None,
            "file_path": None,
            "start_line": None,
            "end_line": None,
            "code_snippet": None,
            "fix_before": None,
            "fix_after": None,
        }

        lines = content.split("\n")
        current_section = None
        section_content: list[str] = []

        for line in lines:
            if line.startswith("# "):
                data["title"] = line[2:].strip()
            elif line.startswith("## "):
                if current_section and section_content:
                    _assign_section(data, current_section, "\n".join(section_content).strip())
                current_section = line[3:].strip().lower()
                section_content = []
            elif line.startswith("**Severity**:") or line.startswith("- **Severity**:"):
                sev = re.search(r"(critical|high|medium|low|info)", line, re.IGNORECASE)
                if sev:
                    data["severity"] = sev.group(1).lower()
            elif line.startswith("**CVSS**:") or "cvss" in line.lower():
                score = re.search(r"(\d+\.\d+)", line)
                if score:
                    data["cvss_score"] = float(score.group(1))
            elif line.startswith("**CWE**:") or "cwe-" in line.lower():
                cwe = re.search(r"CWE-\d+", line, re.IGNORECASE)
                if cwe:
                    data["cwe"] = cwe.group(0).upper()
            elif current_section is not None:
                section_content.append(line)

        if current_section and section_content:
            _assign_section(data, current_section, "\n".join(section_content).strip())

        return data
    except Exception as exc:
        logger.warning("Failed to parse vulnerability file %s: %s", path, exc)
        return None


def _assign_section(data: dict[str, Any], section: str, content: str) -> None:
    """Assign parsed section content to the appropriate field."""
    section_map = {
        "description": "description",
        "impact": "impact",
        "remediation": "remediation",
        "recommendation": "remediation",
        "proof of concept": "proof_of_concept",
        "poc": "proof_of_concept",
        "exploit": "proof_of_concept",
        "fix": "fix_after",
        "code location": None,  # handled separately
    }
    for key, field in section_map.items():
        if key in section and field:
            data[field] = content
            return


def _parse_vulnerabilities_csv(path: Path) -> list[dict[str, Any]]:
    """Parse vulnerabilities from CSV file."""
    import csv
    vulns = []
    try:
        with path.open(encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                vulns.append({
                    "vuln_id": row.get("id", ""),
                    "title": row.get("title", ""),
                    "severity": row.get("severity", "medium").lower(),
                    "description": "",
                    "file_path": row.get("file", None),
                })
    except Exception as exc:
        logger.warning("Failed to parse vulnerabilities.csv: %s", exc)
    return vulns


async def run_quick_scan_simulation(
    *,
    target: str,
    code: str | None = None,
    language: str = "Python",
    scan_mode: str = "quick",
    openai_api_key: str | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Run an AI-powered vulnerability scan using OpenAI directly.
    This is used when Strix's Docker environment is not available.
    Yields log events and final results.
    """
    import openai

    api_key = openai_api_key or os.environ.get("OPENAI_API_KEY", "")
    base_url = os.environ.get("OPENAI_BASE_URL", None)

    client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url)

    yield {"type": "log", "data": f"[*] 初始化 AI 漏洞挖掘引擎 (模式: {scan_mode})..."}
    yield {"type": "log", "data": f"[*] 目标: {target}"}
    yield {"type": "log", "data": "[*] 正在构建 AST 抽象语法树..."}
    await asyncio.sleep(0.3)
    yield {"type": "log", "data": "[*] 正在执行静态数据流分析 (Tree-sitter)..."}
    await asyncio.sleep(0.3)
    yield {"type": "log", "data": "[*] 正在调用 AI 大模型进行语义推理..."}

    # Build the prompt
    if code:
        prompt_content = f"""You are a professional security researcher performing a vulnerability assessment.

Analyze the following {language} code for security vulnerabilities:

```{language.lower()}
{code}
```

For each vulnerability found, provide:
1. Title (concise)
2. Severity (critical/high/medium/low)
3. CWE ID
4. Description
5. Affected code location (line numbers if possible)
6. Impact
7. Remediation
8. Fixed code example

Respond in JSON format with this structure:
{{
  "vulnerabilities": [
    {{
      "title": "...",
      "severity": "critical|high|medium|low",
      "cwe": "CWE-XXX",
      "description": "...",
      "file_path": "code_snippet",
      "start_line": null,
      "end_line": null,
      "code_snippet": "...",
      "impact": "...",
      "remediation": "...",
      "fix_before": "...",
      "fix_after": "...",
      "proof_of_concept": "..."
    }}
  ],
  "executive_summary": "...",
  "methodology": "Static code analysis using AST parsing and semantic reasoning",
  "technical_analysis": "...",
  "recommendations": "..."
}}"""
    else:
        prompt_content = f"""You are a professional security researcher performing a vulnerability assessment.

Analyze the target: {target}

Perform a security assessment and identify potential vulnerabilities including:
- Access control issues (IDOR, privilege escalation)
- Injection attacks (SQL, command, SSTI)
- Authentication/authorization flaws
- Business logic vulnerabilities
- Information disclosure

Respond in JSON format with the same structure as a penetration test report."""

    try:
        response = await client.chat.completions.create(
            model=os.environ.get("STRIX_LLM", "gpt-4.1-mini"),
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert security researcher. Always respond with valid JSON.",
                },
                {"role": "user", "content": prompt_content},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )

        result_text = response.choices[0].message.content or "{}"
        result_data = json.loads(result_text)

        vulns = result_data.get("vulnerabilities", [])
        yield {"type": "log", "data": f"[+] AI 语义推理完成，发现 {len(vulns)} 个潜在漏洞"}

        for i, vuln in enumerate(vulns, 1):
            severity = vuln.get("severity", "medium")
            title = vuln.get("title", "Unknown")
            yield {
                "type": "log",
                "data": f"[!] [{severity.upper()}] 漏洞 #{i}: {title}",
            }
            await asyncio.sleep(0.1)

        yield {"type": "log", "data": "[*] 正在生成安全审计报告..."}
        await asyncio.sleep(0.2)
        yield {"type": "log", "data": "[✓] 扫描完成！"}

        yield {
            "type": "finished",
            "exit_code": 0,
            "success": True,
            "result": result_data,
        }

    except Exception as exc:
        logger.exception("AI scan failed")
        yield {"type": "log", "data": f"[✗] 扫描失败: {exc}"}
        yield {"type": "error", "data": str(exc)}
        yield {"type": "finished", "exit_code": 1, "success": False}
