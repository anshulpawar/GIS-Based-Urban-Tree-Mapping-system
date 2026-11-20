"""
Analyze API Router.

Exposes endpoints for triggering on-demand Sentinel-2 & NDVI processing,
computing green cover percentage, generating dynamic XYZ raster overlays,
and generating environmental insights.
"""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status

logger = logging.getLogger(__name__)
from app.features.analyze.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    CompareRequest,
    CompareResponse,
)
from app.features.analyze.service import (
    process_ndvi_analysis,
    process_temporal_comparison,
)
from app.features.insights.service import evaluate_environmental_insights
from app.services.supabase_service import save_analysis_record

router = APIRouter(prefix="/analyze", tags=["Analyze"])


@router.post(
    "",
    response_model=AnalyzeResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute Sentinel-2 NDVI & Canopy Metrics",
    description="Processes the submitted GeoJSON polygon over Google Earth Engine to derive mean NDVI, canopy breakdown, and XYZ raster tile URLs."
)
async def analyze_polygon(request: AnalyzeRequest) -> AnalyzeResponse:
    """
    Main processing endpoint for drawing/uploading an AOI polygon.

    1. Executes GEE cloud-masking & NDVI calculation.
    2. Runs deterministic environmental rules & green-deficit engine.
    3. Persists record to Supabase PostGIS spatial history.
    4. Returns statistical breakdown and raster tile link.
    """
    if not request.geometry.coordinates or len(request.geometry.coordinates[0]) < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A polygon geometry requires at least 3 coordinates."
        )

    try:
        # Step 1: Compute NDVI and zonal statistics
        analysis_result = process_ndvi_analysis(request)

        # Step 2: Generate deterministic environmental insights
        insights_report = evaluate_environmental_insights(
            mean_ndvi=analysis_result.mean_ndvi,
            green_cover_pct=analysis_result.green_cover_percentage,
            total_area_hectares=analysis_result.total_area_hectares
        )

        # Attach insights to response summary
        analysis_result.insights_summary = insights_report.model_dump()

        # Step 3: Persist run to Supabase PostGIS spatial history (resilient: non-blocking)
        try:
            save_payload = {
                "id": analysis_result.analysis_id,
                "area_name": request.area_name or request.name or request.run_label or analysis_result.area_name or "Custom Selected Area",
                "geometry": request.geometry.model_dump(),
                "total_area_hectares": analysis_result.total_area_hectares,
                "green_cover_percentage": analysis_result.green_cover_percentage,
                "mean_ndvi": analysis_result.mean_ndvi,
                "satellite_date_used": analysis_result.acquisition_date,
                "gee_tile_url": analysis_result.tile_url_template,
                "generated_insights": insights_report.model_dump() if insights_report else None,
                "dense_pct": analysis_result.stats.dense_pct,
                "moderate_pct": analysis_result.stats.moderate_pct,
                "sparse_pct": analysis_result.stats.sparse_pct,
                "deficit_pct": analysis_result.stats.non_veg_pct,
            }
            saved_record = save_analysis_record(save_payload)
            if saved_record and saved_record.get("id"):
                analysis_result.saved_id = str(saved_record["id"])
        except Exception as db_exc:
            logger.warning("Supabase persistence failed non-fatally: %s", db_exc)

        return analysis_result

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"NDVI processing failed: {str(exc)}"
        ) from exc


@router.post(
    "/compare",
    response_model=CompareResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute Custom-Date Temporal Vegetation Comparison",
    description="Compares current Sentinel-2 NDVI against a specified historical baseline date, generating delta statistics and XYZ change tiles."
)
async def compare_temporal_canopy(request: CompareRequest) -> CompareResponse:
    """
    Computes delta NDVI = current - historical over the requested GeoJSON polygon.
    """
    if not request.geometry.coordinates or len(request.geometry.coordinates[0]) < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A polygon geometry requires at least 3 coordinates."
        )

    try:
        return process_temporal_comparison(request)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Temporal comparison failed: {str(exc)}"
        ) from exc


