"""
Analyze Feature Validation Schemas.

Pydantic schemas for Sentinel-2 / NDVI calculation requests and responses,
including GeoJSON polygon coordinates, date filters, and aggregated canopy statistics.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class GeoJSONPolygonGeometry(BaseModel):
    """
    Standard GeoJSON Polygon Geometry representation.
    Coordinates format: [[[lng, lat], [lng, lat], ...]]
    """
    type: str = Field(default="Polygon", description="Geometry type, typically 'Polygon'")
    coordinates: List[List[List[float]]] = Field(
        ...,
        description="Nested coordinates array for outer ring (and optional holes) [longitude, latitude]"
    )


class AnalyzeRequest(BaseModel):
    """
    Payload for initiating on-demand NDVI and green-cover analysis.
    """
    geometry: GeoJSONPolygonGeometry = Field(
        ...,
        description="Target Area of Interest (AOI) polygon in GeoJSON format"
    )
    start_date: Optional[str] = Field(
        default=None,
        description="Filter imagery start date (YYYY-MM-DD). Defaults to 3 months prior."
    )
    end_date: Optional[str] = Field(
        default=None,
        description="Filter imagery end date (YYYY-MM-DD). Defaults to present date."
    )
    cloud_threshold_pct: float = Field(
        default=20.0,
        ge=0.0,
        le=100.0,
        description="Maximum permissible Sentinel-2 cloud pixel percentage"
    )
    run_label: Optional[str] = Field(
        default="Urban AOI Analysis",
        description="Human-readable label for saving run in history"
    )


class VegetationBreakdown(BaseModel):
    """
    Categorized vegetation density breakdown across the polygon.
    """
    dense_canopy_pct: float = Field(..., description="NDVI > 0.5 (Dense trees / forest canopy)")
    moderate_cover_pct: float = Field(..., description="0.25 <= NDVI <= 0.5 (Shrubs, lawns, scattered trees)")
    sparse_or_built_pct: float = Field(..., description="NDVI < 0.25 (Impervious surface, water, barren soil)")


class AnalyzeResponse(BaseModel):
    """
    Computed NDVI analysis result and dynamic XYZ raster tile link.
    """
    analysis_id: str = Field(..., description="Unique UUID identifier for this analysis run")
    run_label: str = Field(..., description="Label or name of the analyzed zone")
    acquisition_date: str = Field(..., description="Sentinel-2 image acquisition date used")
    total_area_hectares: float = Field(..., description="Calculated area of polygon in hectares")
    total_area_sq_meters: float = Field(..., description="Calculated area of polygon in square meters")
    mean_ndvi: float = Field(..., description="Mean Normalized Difference Vegetation Index (-1.0 to 1.0)")
    green_cover_percentage: float = Field(..., description="Percentage of area having NDVI >= 0.3")
    vegetation_breakdown: VegetationBreakdown = Field(..., description="Breakdown of vegetation density classes")
    tile_url_template: str = Field(
        ...,
        description="Google Earth Engine XYZ raster tile URL template: https://.../{z}/{x}/{y}"
    )
    insights_summary: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Quick rule-based recommendation summary generated for this run"
    )

