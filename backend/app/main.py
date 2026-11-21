"""
GIS Urban Tree Mapping & Green-Cover Assessment System - Main Application Entrypoint.

Configures FastAPI application instance, sets up permissive CORS middleware,
registers health check endpoint, and mounts feature routers for NDVI analysis and history.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.features.analyze.router import router as analyze_router
from app.features.analyses.router import router as analyses_router
from app.features.history.router import router as history_router
from app.features.insights.router import router as insights_router
from app.services.gee_service import get_gee_status, initialize_earth_engine

settings = get_settings()

app = FastAPI(
    title="GIS Urban Tree Mapping API",
    description="Backend API service for satellite-based urban tree mapping, NDVI computation, and green-deficit assessment.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Enable CORS middleware (allow all origins, headers, and methods)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Attempt background initialization of Earth Engine on startup."""
    initialize_earth_engine()


# Health check route
@app.get("/api/health", tags=["Health"])
async def health_check():
    """
    Health check endpoint returning system status, GEE connection status, and service name.
    """
    gee_info = get_gee_status()
    return {
        "status": "ok" if gee_info.get("gee_initialized") else "degraded",
        "system": "Urban Tree Mapping & Green-Cover Assessment",
        **gee_info
    }


# Mount feature routers under API prefix
app.include_router(analyze_router, prefix="/api")
app.include_router(analyses_router, prefix="/api")
app.include_router(history_router, prefix="/api")
app.include_router(insights_router, prefix="/api")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)

