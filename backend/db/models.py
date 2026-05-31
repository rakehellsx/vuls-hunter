"""SQLAlchemy ORM models for Vuls-Hunter backend."""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class ScanStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class SeverityLevel(str, enum.Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"
    info = "info"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    repo_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    language: Mapped[str] = mapped_column(String(64), default="Python")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    branch: Mapped[str] = mapped_column(String(128), default="main")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    scans: Mapped[list[Scan]] = relationship("Scan", back_populates="project", cascade="all, delete-orphan")

    @property
    def latest_scan(self) -> Scan | None:
        if not self.scans:
            return None
        return sorted(self.scans, key=lambda s: s.created_at, reverse=True)[0]


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("projects.id"), nullable=True)
    run_name: Mapped[str] = mapped_column(String(255), nullable=False)
    target: Mapped[str] = mapped_column(String(1024), nullable=False)
    scan_mode: Mapped[str] = mapped_column(String(32), default="quick")
    is_whitebox: Mapped[bool] = mapped_column(Boolean, default=False)
    instruction: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ScanStatus] = mapped_column(
        Enum(ScanStatus), default=ScanStatus.pending
    )
    pid: Mapped[int | None] = mapped_column(Integer, nullable=True)
    run_dir: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    log_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    project: Mapped[Project | None] = relationship("Project", back_populates="scans")
    vulnerabilities: Mapped[list[Vulnerability]] = relationship(
        "Vulnerability", back_populates="scan", cascade="all, delete-orphan"
    )
    report: Mapped[Report | None] = relationship(
        "Report", back_populates="scan", uselist=False, cascade="all, delete-orphan"
    )


class Vulnerability(Base):
    __tablename__ = "vulnerabilities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scan_id: Mapped[int] = mapped_column(Integer, ForeignKey("scans.id"), nullable=False)
    vuln_id: Mapped[str] = mapped_column(String(64), nullable=False)  # strix's internal id
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    severity: Mapped[SeverityLevel] = mapped_column(Enum(SeverityLevel), default=SeverityLevel.medium)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    impact: Mapped[str | None] = mapped_column(Text, nullable=True)
    remediation: Mapped[str | None] = mapped_column(Text, nullable=True)
    proof_of_concept: Mapped[str | None] = mapped_column(Text, nullable=True)
    poc_description: Mapped[str | None] = mapped_column(Text, nullable=True)   # Strix PoC description
    poc_script_code: Mapped[str | None] = mapped_column(Text, nullable=True)   # Strix PoC executable script
    poc_generated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # When PoC was generated
    cvss_score: Mapped[float | None] = mapped_column(nullable=True)
    cwe: Mapped[str | None] = mapped_column(String(64), nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    start_line: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_line: Mapped[int | None] = mapped_column(Integer, nullable=True)
    code_snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    fix_before: Mapped[str | None] = mapped_column(Text, nullable=True)
    fix_after: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="unresolved")  # unresolved/fixed/ignored
    raw_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    discovered_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    scan: Mapped[Scan] = relationship("Scan", back_populates="vulnerabilities")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scan_id: Mapped[int] = mapped_column(Integer, ForeignKey("scans.id"), nullable=False)
    report_id: Mapped[str] = mapped_column(String(64), nullable=False)  # e.g. RPT-20240530-001
    project_name: Mapped[str] = mapped_column(String(255), nullable=False)
    executive_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    methodology: Mapped[str | None] = mapped_column(Text, nullable=True)
    technical_analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommendations: Mapped[str | None] = mapped_column(Text, nullable=True)
    full_report_md: Mapped[str | None] = mapped_column(Text, nullable=True)
    vulnerability_count: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    compliance_grade: Mapped[str | None] = mapped_column(String(8), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    scan: Mapped[Scan] = relationship("Scan", back_populates="report")


class Rule(Base):
    __tablename__ = "rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    language: Mapped[str] = mapped_column(String(64), default="Python")
    severity: Mapped[SeverityLevel] = mapped_column(Enum(SeverityLevel), default=SeverityLevel.medium)
    cwe: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    example_bad: Mapped[str | None] = mapped_column(Text, nullable=True)
    example_good: Mapped[str | None] = mapped_column(Text, nullable=True)
    rule_type: Mapped[str] = mapped_column(String(32), default="security")  # security/quality/standard
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class ChatSession(Base):
    """Persistent chat session for the AI vulnerability hunting dialog."""
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Frontend session identifier (e.g. "SESSION-1717000000000")
    session_key: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), default="新建挖掘会话")
    # OpenCode Server session ID mapped to this session
    oc_session_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage", back_populates="session", cascade="all, delete-orphan",
        order_by="ChatMessage.id"
    )


class ChatMessage(Base):
    """A single message in a chat session."""
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("chat_sessions.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # "user" or "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional JSON-serialized suggestions list (for assistant messages)
    suggestions: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    session: Mapped[ChatSession] = relationship("ChatSession", back_populates="messages")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    action: Mapped[str] = mapped_column(String(512), nullable=False)
    level: Mapped[str] = mapped_column(String(16), default="info")
    user: Mapped[str] = mapped_column(String(128), default="admin")
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
