from .overview import router as overview_router
from .projects import router as projects_router
from .reports import router as reports_router
from .rules import router as rules_router
from .scans import router as scans_router
from .settings import router as settings_router
from .upload import router as upload_router

__all__ = [
    "overview_router",
    "projects_router",
    "reports_router",
    "rules_router",
    "scans_router",
    "settings_router",
    "upload_router",
]
