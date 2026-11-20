"""
Analyses API Router.

Exposes REST endpoints for listing, retrieving, and deleting saved
urban canopy analysis runs from Supabase PostGIS public.analysis_history.
"""

import logging
from typing import List
from fastapi import APIRouter, HTTPException, Query, status

from app.features.analyses.schemas import AnalysisRecordResponse, AnalysisDeleteResponse
from app.services.supabase_service import (
    list_analyses,
    get_analysis_by_id,
    delete_analysis_by_id,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analyses", tags=["Analyses"])


@router.get(
    "",
    response_model=List[AnalysisRecordResponse],
    status_code=status.HTTP_200_OK,
    summary="List Saved Analysis Runs",
    description="Returns a list of saved analysis runs from Supabase PostGIS ordered newest-first."
)
async def list_saved_analyses(
    limit: int = Query(default=50, ge=1, le=100, description="Maximum number of records to return")
) -> List[AnalysisRecordResponse]:
    """
    Lists saved analysis records from public.analysis_history.
    """
    records = list_analyses(limit=limit)
    return [AnalysisRecordResponse(**rec) for rec in records]


@router.get(
    "/{analysis_id}",
    response_model=AnalysisRecordResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Saved Analysis Run by ID",
    description="Fetches a single saved analysis record including GeoJSON bounds and environmental metrics."
)
async def get_saved_analysis(analysis_id: str) -> AnalysisRecordResponse:
    """
    Retrieves full details and GeoJSON geometry for a single analysis run by UUID.
    """
    record = get_analysis_by_id(analysis_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Analysis run with ID '{analysis_id}' not found."
        )
    return AnalysisRecordResponse(**record)


@router.delete(
    "/{analysis_id}",
    response_model=AnalysisDeleteResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete Saved Analysis Run by ID",
    description="Deletes a saved analysis run from Supabase PostGIS."
)
async def delete_saved_analysis(analysis_id: str) -> AnalysisDeleteResponse:
    """
    Deletes an analysis record by UUID from public.analysis_history.
    """
    # Verify existence first
    existing = get_analysis_by_id(analysis_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Analysis run with ID '{analysis_id}' not found."
        )

    success = delete_analysis_by_id(analysis_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete analysis run with ID '{analysis_id}'."
        )

    return AnalysisDeleteResponse(status="deleted", id=analysis_id)

