"""
Supabase PostGIS Spatial History Service.

Handles persistence, querying, and retrieval of historical GIS runs
and GeoJSON polygon boundaries stored in Supabase with PostGIS spatial indexing.
Includes an in-memory fallback cache for development when database credentials are not set.
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from app.core.database import get_supabase_client
from app.features.history.schemas import (
    HistoryItemSummary,
    HistoryDetailResponse,
    HistoryListResponse,
)
from app.features.analyze.schemas import GeoJSONPolygonGeometry, VegetationBreakdown
from app.features.insights.schemas import InsightReport, ActionableRecommendation, InsightSeverity

logger = logging.getLogger(__name__)

# Development in-memory mock repository when Supabase is not connected
_mock_history_db: Dict[str, HistoryDetailResponse] = {
    "sample-run-1": HistoryDetailResponse(
        id="sample-run-1",
        run_label="Central Urban Park & Buffer Zone",
        created_at=datetime(2026, 11, 10, 14, 30, tzinfo=timezone.utc),
        acquisition_date="2026-11-05",
        total_area_hectares=42.8,
        total_area_sq_meters=428000.0,
        mean_ndvi=0.62,
        green_cover_percentage=78.5,
        vegetation_breakdown=VegetationBreakdown(
            dense_canopy_pct=52.1,
            moderate_cover_pct=26.4,
            sparse_or_built_pct=21.5
        ),
        tile_url_template="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        geometry=GeoJSONPolygonGeometry(
            type="Polygon",
            coordinates=[[
                [77.585, 12.970],
                [77.600, 12.970],
                [77.600, 12.985],
                [77.585, 12.985],
                [77.585, 12.970]
            ]]
        ),
        insights=InsightReport(
            overall_health_status="Optimal Canopy Cover",
            health_score=88,
            green_deficit_hectares=0.0,
            estimated_trees_needed=0,
            cooling_capacity_index="High (Effective Natural Cooling)",
            recommendations=[
                ActionableRecommendation(
                    title="Canopy Preservation Order",
                    description="High-density mature forest canopy provides critical urban cooling.",
                    severity=InsightSeverity.HEALTHY,
                    suggested_action="Maintain routine ground soil moisture telemetry."
                )
            ]
        )
    ),
    "sample-run-2": HistoryDetailResponse(
        id="sample-run-2",
        run_label="Industrial Sector Corridor",
        created_at=datetime(2026, 11, 8, 9, 15, tzinfo=timezone.utc),
        acquisition_date="2026-11-02",
        total_area_hectares=65.2,
        total_area_sq_meters=652000.0,
        mean_ndvi=0.18,
        green_cover_percentage=12.4,
        vegetation_breakdown=VegetationBreakdown(
            dense_canopy_pct=3.1,
            moderate_cover_pct=9.3,
            sparse_or_built_pct=87.6
        ),
        tile_url_template="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        geometry=GeoJSONPolygonGeometry(
            type="Polygon",
            coordinates=[[
                [77.620, 12.920],
                [77.640, 12.920],
                [77.640, 12.940],
                [77.620, 12.940],
                [77.620, 12.920]
            ]]
        ),
        insights=InsightReport(
            overall_health_status="Critical Green Deficit",
            health_score=22,
            green_deficit_hectares=11.47,
            estimated_trees_needed=4588,
            cooling_capacity_index="Low (High Urban Heat Island Risk)",
            recommendations=[
                ActionableRecommendation(
                    title="Emergency Heat Action Plan",
                    description="Severe impervious surface concentration causing elevated surface temperature.",
                    severity=InsightSeverity.CRITICAL,
                    suggested_action="Mandate perimeter green buffers and urban tree planting along arterial roads."
                )
            ]
        )
    )
}


def save_analysis_record(detail: HistoryDetailResponse) -> HistoryDetailResponse:
    """
    Saves an analysis record to Supabase PostGIS table 'analysis_runs'.
    Falls back to the in-memory cache if Supabase is unreachable.

    Args:
        detail (HistoryDetailResponse): Full analysis data with GeoJSON geometry.

    Returns:
        HistoryDetailResponse: The saved record.
    """
    # Always keep in-memory cache updated
    _mock_history_db[detail.id] = detail

    try:
        supabase = get_supabase_client()
        payload = {
            "id": detail.id,
            "run_label": detail.run_label,
            "created_at": detail.created_at.isoformat(),
            "acquisition_date": detail.acquisition_date,
            "total_area_hectares": detail.total_area_hectares,
            "total_area_sq_meters": detail.total_area_sq_meters,
            "mean_ndvi": detail.mean_ndvi,
            "green_cover_percentage": detail.green_cover_percentage,
            "tile_url_template": detail.tile_url_template,
            "geometry": detail.geometry.model_dump(),
            "insights": detail.insights.model_dump() if detail.insights else None
        }
        supabase.table("analysis_runs").insert(payload).execute()
        logger.info("Saved analysis run %s to Supabase PostGIS.", detail.id)
    except Exception as exc:
        logger.warning("Could not persist to Supabase (%s). Retained in local session cache.", exc)

    return detail


def fetch_history_list(limit: int = 50, offset: int = 0) -> HistoryListResponse:
    """
    Queries historical analysis runs from Supabase PostGIS or local fallback.

    Args:
        limit (int): Number of items to retrieve.
        offset (int): Offset for pagination.

    Returns:
        HistoryListResponse: List of summary objects for sidebar rendering.
    """
    try:
        supabase = get_supabase_client()
        response = (
            supabase.table("analysis_runs")
            .select("id, run_label, created_at, acquisition_date, total_area_hectares, mean_ndvi, green_cover_percentage, insights")
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        if response.data:
            items = []
            for row in response.data:
                health_status = None
                if row.get("insights") and isinstance(row["insights"], dict):
                    health_status = row["insights"].get("overall_health_status")

                items.append(
                    HistoryItemSummary(
                        id=str(row["id"]),
                        run_label=row.get("run_label", "Unnamed AOI"),
                        created_at=datetime.fromisoformat(row["created_at"]),
                        acquisition_date=row.get("acquisition_date", "N/A"),
                        total_area_hectares=float(row.get("total_area_hectares", 0.0)),
                        mean_ndvi=float(row.get("mean_ndvi", 0.0)),
                        green_cover_percentage=float(row.get("green_cover_percentage", 0.0)),
                        overall_health_status=health_status
                    )
                )
            return HistoryListResponse(total=len(items), items=items)
    except Exception as exc:
        logger.debug("Supabase unavailable for history listing (%s). Using fallback data.", exc)

    # Local fallback
    sorted_items = sorted(_mock_history_db.values(), key=lambda x: x.created_at, reverse=True)
    summaries = [
        HistoryItemSummary(
            id=item.id,
            run_label=item.run_label,
            created_at=item.created_at,
            acquisition_date=item.acquisition_date,
            total_area_hectares=item.total_area_hectares,
            mean_ndvi=item.mean_ndvi,
            green_cover_percentage=item.green_cover_percentage,
            overall_health_status=item.insights.overall_health_status if item.insights else None
        )
        for item in sorted_items[offset : offset + limit]
    ]
    return HistoryListResponse(total=len(summaries), items=summaries)


def fetch_history_by_id(run_id: str) -> Optional[HistoryDetailResponse]:
    """
    Fetches full historical run detail by UUID, including GeoJSON bounds.

    Args:
        run_id (str): UUID of the analysis run.

    Returns:
        Optional[HistoryDetailResponse]: The full analysis item or None if not found.
    """
    if run_id in _mock_history_db:
        return _mock_history_db[run_id]

    try:
        supabase = get_supabase_client()
        response = supabase.table("analysis_runs").select("*").eq("id", run_id).single().execute()
        if response.data:
            data = response.data
            return HistoryDetailResponse(
                id=str(data["id"]),
                run_label=data.get("run_label", "Analysis AOI"),
                created_at=datetime.fromisoformat(data["created_at"]),
                acquisition_date=data.get("acquisition_date", "N/A"),
                total_area_hectares=float(data.get("total_area_hectares", 0.0)),
                total_area_sq_meters=float(data.get("total_area_sq_meters", 0.0)),
                mean_ndvi=float(data.get("mean_ndvi", 0.0)),
                green_cover_percentage=float(data.get("green_cover_percentage", 0.0)),
                vegetation_breakdown=VegetationBreakdown(**data["vegetation_breakdown"]) if data.get("vegetation_breakdown") else None,
                tile_url_template=data.get("tile_url_template", ""),
                geometry=GeoJSONPolygonGeometry(**data["geometry"]),
                insights=InsightReport(**data["insights"]) if data.get("insights") else None
            )
    except Exception as exc:
        logger.warning("Supabase record fetch failed for %s: %s", run_id, exc)

    return None

