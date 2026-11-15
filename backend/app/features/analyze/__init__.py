"""
Analyze Feature Module.

Handles real-time Sentinel-2 imagery processing, cloud-masking,
NDVI calculation via Google Earth Engine (GEE), and raster tile generation.
"""

from app.features.analyze.router import router

__all__ = ["router"]

