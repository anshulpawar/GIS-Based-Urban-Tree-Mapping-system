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
    Supports both Phase 2 and Phase 3 specifications.
    """
    geometry: GeoJSONPolygonGeometry = Field(
        ...,
        description="Target Area of Interest (AOI) polygon in GeoJSON format"
    )
    name: Optional[str] = Field(
        default=None,
        description="Study area name (Phase 3 spec)"
    )
    run_label: Optional[str] = Field(
        default="Urban AOI Analysis",
        description="Human-readable label for saving run in history"
    )
    area_sqkm: Optional[float] = Field(
        default=None,
        description="Geodesic surface area in square kilometers"
    )
    area_ha: Optional[float] = Field(
        default=None,
        description="Geodesic surface area in hectares"
    )
    perimeter_km: Optional[float] = Field(
        default=None,
        description="Geodesic perimeter in kilometers"
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
        default=25.0,
        ge=0.0,
        le=100.0,
        description="Maximum permissible Sentinel-2 cloud pixel percentage"
    )


class ZonalStats(BaseModel):
    """
    Zonal reduction summary statistics over the AOI.
    """
    mean_ndvi: float = Field(..., description="Mean NDVI value (-1.0 to 1.0)")
    green_cover_pct: float = Field(..., description="Total green cover percentage (NDVI >= 0.20)")
    dense_pct: float = Field(..., description="Dense canopy / forest percentage (NDVI >= 0.60)")
    moderate_pct: float = Field(..., description="Moderate vegetation / urban trees percentage (0.40 <= NDVI < 0.60)")
    sparse_pct: float = Field(..., description="Sparse vegetation / shrubs percentage (0.20 <= NDVI < 0.40)")
    non_veg_pct: float = Field(..., description="Non-vegetated / built-up / water percentage (NDVI < 0.20)")
    area_ha: float = Field(..., description="Area in hectares")
    area_sqkm: float = Field(..., description="Area in square kilometers")
    pixel_count: int = Field(..., description="Count of 10m Sentinel-2 pixels analyzed")


class VegetationBreakdown(BaseModel):
    """
    Categorized vegetation density breakdown across the polygon.
    """
    dense_canopy_pct: float = Field(..., description="NDVI >= 0.60 (Dense trees / forest canopy)")
    moderate_cover_pct: float = Field(..., description="0.40 <= NDVI < 0.60 (Moderate trees / shrubs)")
    sparse_or_built_pct: float = Field(..., description="NDVI < 0.40 (Sparse vegetation and built-up / water)")
    sparse_pct: Optional[float] = Field(default=None, description="0.20 <= NDVI < 0.40 (Sparse vegetation)")
    non_veg_pct: Optional[float] = Field(default=None, description="NDVI < 0.20 (Non-vegetated / built-up / water)")


class AnalyzeResponse(BaseModel):
    """
    Computed Sentinel-2 NDVI analysis result with dynamic XYZ raster tile links.
    """
    status: str = Field(default="success", description="Status indicator ('success')")
    area_name: str = Field(..., description="Name or label of the analyzed study area")
    analysis_id: str = Field(..., description="Unique UUID identifier for this analysis run")
    run_label: str = Field(..., description="Label or name of the analyzed zone")
    acquisition_date: str = Field(..., description="Sentinel-2 image acquisition date used (YYYY-MM-DD)")
    satellite: str = Field(default="Sentinel-2 L2A (10m)", description="Satellite mission and optical resolution")
    ndvi_tile_url: str = Field(..., description="MapLibre XYZ raster tile URL for 4-tier discrete NDVI heatmap")
    rgb_tile_url: str = Field(..., description="MapLibre XYZ raster tile URL for True-Color Sentinel-2 RGB composite")
    rgb_thumb_url: Optional[str] = Field(default=None, description="Static 640px optical satellite capture preview URL")
    stats: ZonalStats = Field(..., description="Comprehensive zonal statistics")
    total_area_hectares: float = Field(..., description="Calculated area of polygon in hectares")
    total_area_sq_meters: float = Field(..., description="Calculated area of polygon in square meters")
    mean_ndvi: float = Field(..., description="Mean Normalized Difference Vegetation Index (-1.0 to 1.0)")
    green_cover_percentage: float = Field(..., description="Percentage of area having vegetation")
    vegetation_breakdown: VegetationBreakdown = Field(..., description="Breakdown of vegetation density classes")
    tile_url_template: str = Field(
        ...,
        description="Google Earth Engine XYZ raster tile URL template: https://.../{z}/{x}/{y}"
    )
    insights_summary: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Rule-based environmental recommendation summary"
    )
    is_simulated: bool = Field(default=False, description="Flag indicating if GEE was simulated")

