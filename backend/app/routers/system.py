"""System routes: health check only (no queue, no downloads)."""
from fastapi import APIRouter

router = APIRouter()

health_router = APIRouter()


@health_router.get("/health")
def health_check():
    return {"status": "ok", "service": "yourpdf-backend"}
