"""Vuls-Hunter FastAPI Backend Server.

This server integrates:
- Strix AI vulnerability scanning engine
- SQLite database for project/scan/vulnerability persistence
- WebSocket for real-time scan log streaming
- REST API for all frontend operations
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import (
    overview_router,
    projects_router,
    reports_router,
    rules_router,
    scans_router,
)
from .db import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Static files directory (built frontend)
STATIC_DIR = Path(__file__).parent.parent / "dist" / "public"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info("Initializing Vuls-Hunter backend...")
    await init_db()
    logger.info("Database initialized successfully")
    yield
    logger.info("Shutting down Vuls-Hunter backend...")


app = FastAPI(
    title="Vuls-Hunter API",
    description="AI-powered vulnerability hunting platform API",
    version="3.0.0",
    lifespan=lifespan,
)

# CORS middleware for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(overview_router)
app.include_router(scans_router)
app.include_router(projects_router)
app.include_router(rules_router)
app.include_router(reports_router)


@app.get("/api/health")
async def health_check() -> dict:
    """Health check endpoint."""
    return {"status": "ok", "version": "3.0.0"}


# Serve static frontend files in production
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str) -> FileResponse:
        """Serve the React SPA for all non-API routes."""
        index_file = STATIC_DIR / "index.html"
        return FileResponse(str(index_file))


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 3000))
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=port,
        reload=os.environ.get("NODE_ENV") != "production",
    )
