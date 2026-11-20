"""
Analyses Feature Validation Schemas.

Pydantic models representing saved analysis history records retrieved
from Supabase PostGIS public.analysis_history table.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class AnalysisRecordResponse(BaseModel):
    """
    Representation of a single analysis run record stored in Supabase PostGIS.
    """
    id: str = Field(..., description="Unique analysis UUID")
    created_at: Optional[str] = Field(default=None, description="Timestamp when record was created")
    area_name: Optional[str] = Field(default="Custom Selected Area", description="Study area name")
    total_area_hectares: Optional[float] = Field(default=None, description="Total polygon area in hectares")
    green_cover_hectares: Optional[float] = Field(default=None, description="Total green cover in hectares")
    green_cover_percentage: Optional[float] = Field(default=None, description="Green canopy percentage")
    mean_ndvi: Optional[float] = Field(default=None, description="Mean NDVI value")
    satellite_date_used: Optional[str] = Field(default=None, description="Sentinel-2 image acquisition date")
    gee_tile_url: Optional[str] = Field(default=None, description="MapLibre / Leaflet XYZ tile URL template")
    generated_insights: Optional[str] = Field(default=None, description="Environmental diagnostic summary")
    geojson: Optional[Dict[str, Any]] = Field(default=None, description="GeoJSON Polygon geometry")
    polygon_geom: Optional[Any] = Field(default=None, description="PostGIS geometry representation")
    dense_pct: Optional[float] = Field(default=None, description="Dense canopy percentage")
    moderate_pct: Optional[float] = Field(default=None, description="Moderate canopy percentage")
    sparse_pct: Optional[float] = Field(default=None, description="Sparse vegetation percentage")
    deficit_pct: Optional[float] = Field(default=None, description="Non-vegetated / built-up percentage")


class AnalysisDeleteResponse(BaseModel):
    """
    Confirmation model for record deletion.
    """
    status: str = Field(default="deleted", description="Operation status")
    id: str = Field(..., description="UUID of deleted analysis record")

