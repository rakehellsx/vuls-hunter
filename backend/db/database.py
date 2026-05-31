"""Database initialization and session management."""
from __future__ import annotations

import json
import logging
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .models import Base, ChatMessage, ChatSession, Rule, SeverityLevel

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent.parent / "data" / "vuls_hunter.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    """Create all tables and seed default rules."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database initialized at %s", DB_PATH)
    # Run schema migrations for new columns (idempotent)
    await _migrate_schema()
    await _seed_default_rules()


async def _migrate_schema() -> None:
    """Apply incremental schema migrations (idempotent ALTER TABLE)."""
    import aiosqlite
    async with aiosqlite.connect(str(DB_PATH)) as db:
        # Get existing columns in vulnerabilities table
        async with db.execute("PRAGMA table_info(vulnerabilities)") as cursor:
            cols = {row[1] async for row in cursor}
        # Add PoC columns if missing
        new_cols = [
            ("poc_description", "TEXT"),
            ("poc_script_code", "TEXT"),
            ("poc_generated_at", "DATETIME"),
        ]
        for col_name, col_type in new_cols:
            if col_name not in cols:
                await db.execute(f"ALTER TABLE vulnerabilities ADD COLUMN {col_name} {col_type}")
                logger.info("Schema migration: added column vulnerabilities.%s", col_name)

        # Ensure chat_sessions table exists (idempotent)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_key VARCHAR(128) UNIQUE NOT NULL,
                title VARCHAR(255) DEFAULT '新建挖掘会话',
                oc_session_id VARCHAR(256),
                created_at DATETIME DEFAULT (datetime('now')),
                updated_at DATETIME DEFAULT (datetime('now'))
            )
        """)
        await db.execute("CREATE INDEX IF NOT EXISTS ix_chat_sessions_session_key ON chat_sessions(session_key)")

        # Ensure chat_messages table exists (idempotent)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
                role VARCHAR(16) NOT NULL,
                content TEXT NOT NULL,
                suggestions TEXT,
                created_at DATETIME DEFAULT (datetime('now'))
            )
        """)

        await db.commit()
        logger.info("Schema migration: chat_sessions and chat_messages tables ensured")


async def _seed_default_rules() -> None:
    """Seed built-in security rules if not already present."""
    default_rules = [
        {
            "name": "SQL 注入检测",
            "language": "Python",
            "severity": SeverityLevel.critical,
            "cwe": "CWE-89",
            "description": "检测未经参数化处理的 SQL 查询，防止 SQL 注入攻击。",
            "example_bad": "query = f\"SELECT * FROM users WHERE id = {user_id}\"",
            "example_good": "query = \"SELECT * FROM users WHERE id = ?\"\ncursor.execute(query, (user_id,))",
            "rule_type": "security",
            "is_builtin": True,
        },
        {
            "name": "系统命令执行注入",
            "language": "Python",
            "severity": SeverityLevel.critical,
            "cwe": "CWE-78",
            "description": "检测将用户输入直接传入 os.system、subprocess 等系统命令执行函数的危险模式。",
            "example_bad": "os.system(f\"ping {user_input}\")",
            "example_good": "subprocess.run(['ping', user_input], check=True)",
            "rule_type": "security",
            "is_builtin": True,
        },
        {
            "name": "XSS 跨站脚本攻击",
            "language": "JavaScript",
            "severity": SeverityLevel.high,
            "cwe": "CWE-79",
            "description": "检测将未经转义的用户输入直接插入 DOM 的危险操作（如 innerHTML）。",
            "example_bad": "element.innerHTML = userInput;",
            "example_good": "element.textContent = userInput;",
            "rule_type": "security",
            "is_builtin": True,
        },
        {
            "name": "路径遍历漏洞",
            "language": "Python",
            "severity": SeverityLevel.high,
            "cwe": "CWE-22",
            "description": "检测使用用户输入构造文件路径时未进行规范化校验，可能导致目录穿越。",
            "example_bad": "open(os.path.join(base_dir, user_filename))",
            "example_good": "safe_path = os.path.realpath(os.path.join(base_dir, user_filename))\nif not safe_path.startswith(base_dir): raise ValueError()",
            "rule_type": "security",
            "is_builtin": True,
        },
        {
            "name": "IDOR 越权访问",
            "language": "Python",
            "severity": SeverityLevel.high,
            "cwe": "CWE-639",
            "description": "检测 API 接口中直接使用用户提供的 ID 访问资源，而未进行所有权校验。",
            "example_bad": "user = db.get(User, request.args['user_id'])",
            "example_good": "user = db.get(User, request.args['user_id'])\nif user.owner_id != current_user.id: abort(403)",
            "rule_type": "security",
            "is_builtin": True,
        },
        {
            "name": "SSRF 服务端请求伪造",
            "language": "Python",
            "severity": SeverityLevel.high,
            "cwe": "CWE-918",
            "description": "检测将用户提供的 URL 直接用于服务端 HTTP 请求，可能导致内网资源泄露。",
            "example_bad": "requests.get(user_provided_url)",
            "example_good": "# 验证 URL 是否在白名单域名内后再发起请求",
            "rule_type": "security",
            "is_builtin": True,
        },
        {
            "name": "JWT 弱密钥验证",
            "language": "Python",
            "severity": SeverityLevel.critical,
            "cwe": "CWE-347",
            "description": "检测 JWT 验证时未指定算法或使用 none 算法，可能导致令牌伪造。",
            "example_bad": "jwt.decode(token, options={'verify_signature': False})",
            "example_good": "jwt.decode(token, SECRET_KEY, algorithms=['HS256'])",
            "rule_type": "security",
            "is_builtin": True,
        },
        {
            "name": "硬编码密钥检测",
            "language": "Python",
            "severity": SeverityLevel.medium,
            "cwe": "CWE-798",
            "description": "检测代码中硬编码的密码、API Key 或密钥字符串。",
            "example_bad": "SECRET_KEY = 'my_super_secret_key_123'",
            "example_good": "SECRET_KEY = os.environ.get('SECRET_KEY')",
            "rule_type": "security",
            "is_builtin": True,
        },
    ]

    async with AsyncSessionLocal() as session:
        from sqlalchemy import select
        result = await session.execute(select(Rule).where(Rule.is_builtin == True).limit(1))
        existing = result.scalar_one_or_none()
        if existing:
            return  # Already seeded

        for rule_data in default_rules:
            rule = Rule(**rule_data)
            session.add(rule)
        await session.commit()
        logger.info("Seeded %d default security rules", len(default_rules))
