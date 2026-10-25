"""Router package for thin FastAPI route modules."""
from app.routers.image import router as image_router
from app.routers.office import router as office_router
from app.routers.pdf import router as pdf_router
from app.routers.system import health_router, router as system_router

__all__ = ["health_router", "image_router", "office_router", "pdf_router", "system_router"]
