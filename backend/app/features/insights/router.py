"""
AI Insights API Router.

Provides endpoints for generating Gemini 2.5 Flash environmental insights
and urban forestry diagnostics from verified Sentinel-2 NDVI telemetry,
with zero-crash fallback to deterministic urban forestry benchmarks.
"""

import json
import logging
from fastapi import APIRouter, HTTPException, status

from app.features.insights.schemas import InsightsRequest, InsightsResponse
from app.features.insights.service import evaluate_environmental_insights
from app.services.insights_service import generate_ai_insights, _build_canonical_planting_recommendations
from app.services.supabase_service import get_analysis_by_id, update_analysis_insights

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI Insights"])


@router.post(
    "/insights",
    response_model=InsightsResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate AI urban canopy insights",
    description="Synthesizes ecological diagnostics and planting interventions using AI with fallback to deterministic benchmarks."
)
async def generate_insights_endpoint(payload: InsightsRequest) -> InsightsResponse:
    """
    Synthesizes AI environmental insights for the specified AOI NDVI metrics.
    When force_regenerate is False and saved insights exist in Supabase for analysis_id,
    returns the cached insights immediately.
    """
    try:
        # Check cache in Supabase if force_regenerate is False
        if not payload.force_regenerate and payload.analysis_id:
            try:
                record = get_analysis_by_id(payload.analysis_id)
                if record and record.get("generated_insights"):
                    saved = record["generated_insights"]
                    if isinstance(saved, str):
                        try:
                            saved = json.loads(saved)
                        except Exception:
                            saved = None
                    if isinstance(saved, dict) and "markdown" in saved and "recommendations" in saved:
                        logger.info("Returning saved insights for analysis %s (force_regenerate=False)", payload.analysis_id)
                        # Guarantee consistent deterministic math matching ANALYSIS tab
                        benchmark = evaluate_environmental_insights(
                            mean_ndvi=payload.mean_ndvi,
                            green_cover_pct=payload.green_cover_percentage,
                            total_area_hectares=payload.total_area_hectares,
                            dense_pct=payload.dense_pct,
                            moderate_pct=payload.moderate_pct,
                            sparse_pct=payload.sparse_pct,
                            deficit_pct=payload.deficit_pct,
                        )
                        saved["health_score"] = benchmark.health_score
                        saved["overall_health_status"] = benchmark.overall_health_status
                        saved["cooling_capacity_index"] = benchmark.cooling_capacity_index
                        saved["green_deficit_hectares"] = benchmark.green_deficit_hectares
                        saved["estimated_trees_needed"] = benchmark.estimated_trees_needed
                        # Backfill planting recommendations if missing in legacy saved record
                        if not saved.get("planting_recommendations"):
                            canonical_flora = _build_canonical_planting_recommendations(payload)
                            saved["planting_recommendations"] = [p.model_dump() for p in canonical_flora]
                        return InsightsResponse(**saved)
            except Exception as cache_err:
                logger.warning("Error reading cached insights from Supabase for %s: %s", payload.analysis_id, cache_err)

        # Generate fresh insights
        response = await generate_ai_insights(payload)

        # If analysis_id is provided, persist the updated insights into Supabase
        if payload.analysis_id:
            try:
                update_analysis_insights(payload.analysis_id, response.model_dump())
            except Exception as update_err:
                logger.warning("Failed to update insights in Supabase for %s: %s", payload.analysis_id, update_err)

        return response
    except Exception as exc:
        logger.error("Unhandled error in /api/insights: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate environmental insights: {str(exc)}"
        )
