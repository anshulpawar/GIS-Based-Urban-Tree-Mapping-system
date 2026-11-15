"""
History Feature Module.

Manages persistence and retrieval of historical GIS runs and spatial geometries
via Supabase PostGIS database tables.
"""

from app.features.history.router import router

__all__ = ["router"]

