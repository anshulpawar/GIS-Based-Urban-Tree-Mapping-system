"""
History API Router.

Provides endpoints for retrieving past GIS analysis runs and recalling full
GeoJSON boundaries for map exploration and temporal comparison.
"""

from fastapi import APIRouter, HTTPException, Query, status
from app.features.history.schemas import (
    HistoryListResponse,
    HistoryDetailResponse,
)
from app.features.history.service import (
    fetch_history_list,
    fetch_history_by_id,
)

router = APIRouter(prefix="/history", tags=["History"])


@router.get(
    "",
    response_model=HistoryListResponse,
    status_code=status.HTTP_200_OK,
    summary="List Analysis Run History",
    description="Retrieves a list of saved urban canopy analysis runs with summary statistics."
)
async def list_runs(
    limit: int = Query(default=50, ge=1, le=100, description="Items per page"),
    offset: int = Query(default=0, ge=0, description="Pagination offset")
) -> HistoryListResponse:
    """
    Returns summary records for displaying in the frontend history drawer.
    """
    return fetch_history_list(limit=limit, offset=offset)


@router.get(
    "/{run_id}",
    response_model=HistoryDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Detailed Analysis Run by ID",
    description="Returns full analysis metrics, GeoJSON polygon boundary, and insight diagnostics."
)
async def get_run_detail(run_id: str) -> HistoryDetailResponse:
    """
    Returns the complete record of a specific analysis run, allowing the frontend
    to zoom to bounds, render the polygon, and reload insights.
    """
    record = fetch_history_by_id(run_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Analysis run with ID '{run_id}' not found."
        )
    return record

