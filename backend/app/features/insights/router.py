"""
AI Insights API Router.

Provides endpoints for generating Gemini 2.5 Flash environmental insights
and urban forestry diagnostics from verified Sentinel-2 NDVI telemetry,
with zero-crash fallback to deterministic urban forestry benchmarks.
"""

import logging
from fastapi import APIRouter, HTTPException, status

from app.features.insights.schemas import InsightsRequest, InsightsResponse
from app.services.insights_service import generate_ai_insights
from app.services.supabase_service import update_analysis_insights

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI Insights"])


@router.post(
    "/insights",
    response_model=InsightsResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate AI urban canopy insights",
    description="Synthesizes ecological diagnostics and planting interventions using Gemini 2.5 Flash with fallback to deterministic benchmarks."
)
async def generate_insights_endpoint(payload: InsightsRequest) -> InsightsResponse:
    """
    Synthesizes AI environmental insights for the specified AOI NDVI metrics.

    Args:
        payload (InsightsRequest): Verified telemetry metrics (mean NDVI, green %, area, etc.)

    Returns:
        InsightsResponse: Structured diagnostics, recommendations, and full markdown report.
    """
    try:
        response = await generate_ai_insights(payload)

        # If analysis_id is provided, optionally persist the updated insights into Supabase
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
