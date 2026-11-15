"""
Analyze API Router.

Exposes endpoints for triggering on-demand Sentinel-2 & NDVI processing,
computing green cover percentage, generating dynamic XYZ raster overlays,
and generating environmental insights.
"""

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status
from app.features.analyze.schemas import AnalyzeRequest, AnalyzeResponse
from app.features.analyze.service import process_ndvi_analysis
from app.features.insights.service import evaluate_environmental_insights
from app.features.history.service import save_analysis_record
from app.features.history.schemas import HistoryDetailResponse

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

        # Step 3: Persist run to PostGIS history
        history_record = HistoryDetailResponse(
            id=analysis_result.analysis_id,
            run_label=analysis_result.run_label,
            created_at=datetime.now(timezone.utc),
            acquisition_date=analysis_result.acquisition_date,
            total_area_hectares=analysis_result.total_area_hectares,
            total_area_sq_meters=analysis_result.total_area_sq_meters,
            mean_ndvi=analysis_result.mean_ndvi,
            green_cover_percentage=analysis_result.green_cover_percentage,
            vegetation_breakdown=analysis_result.vegetation_breakdown,
            tile_url_template=analysis_result.tile_url_template,
            geometry=request.geometry,
            insights=insights_report
        )
        save_analysis_record(history_record)

        return analysis_result

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"NDVI processing failed: {str(exc)}"
        ) from exc

