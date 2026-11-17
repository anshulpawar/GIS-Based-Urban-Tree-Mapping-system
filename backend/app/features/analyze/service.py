"""
Earth Engine (GEE) & Sentinel-2 Analysis Service.

Coordinates with app.services.gee_service to compute deterministic NDVI,
True-Color optical composites, 4-tier discrete classification, and zonal metrics.
"""

import logging
import uuid
from typing import Dict, Any

from app.features.analyze.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    VegetationBreakdown,
    ZonalStats,
)
from app.services.gee_service import analyze_sentinel2_aoi, initialize_earth_engine, is_gee_ready

logger = logging.getLogger(__name__)


def process_ndvi_analysis(request: AnalyzeRequest) -> AnalyzeResponse:
    """
    Executes live Sentinel-2 L2A NDVI and True-Color analysis via Google Earth Engine.
    """
    study_name = request.name or request.run_label or "Urban AOI Analysis"
    coords = request.geometry.coordinates

    gee_result = analyze_sentinel2_aoi(
        coordinates=coords,
        area_name=study_name,
        start_date=request.start_date,
        end_date=request.end_date,
        cloud_threshold_pct=request.cloud_threshold_pct,
    )

    stats_dict = gee_result["stats"]
    analysis_id = str(uuid.uuid4())

    # Build strongly-typed ZonalStats
    zonal_stats = ZonalStats(
        mean_ndvi=stats_dict["mean_ndvi"],
        green_cover_pct=stats_dict["green_cover_pct"],
        dense_pct=stats_dict["dense_pct"],
        moderate_pct=stats_dict["moderate_pct"],
        sparse_pct=stats_dict["sparse_pct"],
        non_veg_pct=stats_dict["non_veg_pct"],
        area_ha=request.area_ha or stats_dict["area_ha"],
        area_sqkm=request.area_sqkm or stats_dict["area_sqkm"],
        pixel_count=stats_dict["pixel_count"]
    )

    # Legacy 3-tier mapping for existing widgets
    veg_breakdown = VegetationBreakdown(
        dense_canopy_pct=stats_dict["dense_pct"],
        moderate_cover_pct=stats_dict["moderate_pct"],
        sparse_or_built_pct=round(stats_dict["sparse_pct"] + stats_dict["non_veg_pct"], 1),
        sparse_pct=stats_dict["sparse_pct"],
        non_veg_pct=stats_dict["non_veg_pct"]
    )

    total_ha = request.area_ha or gee_result["total_area_hectares"]
    total_sqm = (total_ha * 10000.0) if total_ha else gee_result["total_area_sq_meters"]

    return AnalyzeResponse(
        status=gee_result["status"],
        area_name=study_name,
        analysis_id=analysis_id,
        run_label=study_name,
        acquisition_date=gee_result["acquisition_date"],
        satellite=gee_result["satellite"],
        ndvi_tile_url=gee_result["ndvi_tile_url"],
        rgb_tile_url=gee_result["rgb_tile_url"],
        stats=zonal_stats,
        total_area_hectares=round(total_ha, 2),
        total_area_sq_meters=round(total_sqm, 2),
        mean_ndvi=stats_dict["mean_ndvi"],
        green_cover_percentage=stats_dict["green_cover_pct"],
        vegetation_breakdown=veg_breakdown,
        tile_url_template=gee_result["ndvi_tile_url"],
        insights_summary={"source": "gee_sentinel2_l2a"},
        is_simulated=gee_result.get("is_simulated", False)
    )
