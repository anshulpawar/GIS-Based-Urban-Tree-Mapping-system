"""
History Feature Validation Schemas.

Pydantic models representing saved spatial analysis runs, summary records
for drawer listings, and full GeoJSON records for recalling map bounds.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from app.features.analyze.schemas import GeoJSONPolygonGeometry, VegetationBreakdown
from app.features.insights.schemas import InsightReport


class HistoryItemSummary(BaseModel):
    """
    Compact analysis run overview for listing in the frontend sidebar drawer.
    """
    id: str = Field(..., description="Unique run identifier (UUID)")
    run_label: str = Field(..., description="User-assigned or default label for the analysis run")
    created_at: datetime = Field(..., description="Timestamp when analysis was conducted")
    acquisition_date: str = Field(..., description="Sentinel-2 imagery acquisition date")
    total_area_hectares: float = Field(..., description="Computed polygon area in hectares")
    mean_ndvi: float = Field(..., description="Mean NDVI vegetation index")
    green_cover_percentage: float = Field(..., description="Percentage of green canopy cover")
    overall_health_status: Optional[str] = Field(
        default=None,
        description="Quick indicator of health category"
    )


class HistoryDetailResponse(BaseModel):
    """
    Detailed historical run record including full GeoJSON polygon geometry
    and rule-based environmental report.
    """
    id: str = Field(..., description="Unique run identifier (UUID)")
    run_label: str = Field(..., description="Label or title of analysis")
    created_at: datetime = Field(..., description="Analysis creation timestamp")
    acquisition_date: str = Field(..., description="Satellite image acquisition date")
    total_area_hectares: float = Field(..., description="Area in hectares")
    total_area_sq_meters: float = Field(..., description="Area in square meters")
    mean_ndvi: float = Field(..., description="Mean NDVI")
    green_cover_percentage: float = Field(..., description="Vegetation coverage percentage")
    vegetation_breakdown: Optional[VegetationBreakdown] = Field(default=None)
    tile_url_template: str = Field(..., description="XYZ raster tile template for Leaflet")
    geometry: GeoJSONPolygonGeometry = Field(
        ...,
        description="GeoJSON geometry for restoring map polygon and zooming bounds"
    )
    insights: Optional[InsightReport] = Field(
        default=None,
        description="Full environmental insights diagnostic"
    )


class HistoryListResponse(BaseModel):
    """
    Paginated or bounded list of analysis history items.
    """
    total: int = Field(..., description="Total count of historical runs")
    items: List[HistoryItemSummary] = Field(..., description="List of summary items")

