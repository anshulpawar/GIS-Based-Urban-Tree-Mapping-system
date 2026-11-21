"""
Supabase PostGIS Persistence & Analysis History Service.

Interacts with Supabase REST API (PostgREST) to persist and retrieve
urban canopy analysis runs in the public.analysis_history table.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


def get_supabase_headers() -> Dict[str, str]:
    """Generates authentication and configuration headers for Supabase PostgREST."""
    settings = get_settings()
    key = settings.SUPABASE_SECRET_KEY or settings.SUPABASE_KEY
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }


def get_supabase_rest_url(table: str = "analysis_history") -> str:
    """Returns the PostgREST endpoint URL for a given table."""
    settings = get_settings()
    base_url = settings.SUPABASE_URL.rstrip("/")
    return f"{base_url}/rest/v1/{table}"


def is_supabase_configured() -> bool:
    """Checks whether valid, non-placeholder Supabase credentials exist."""
    settings = get_settings()
    return bool(
        settings.SUPABASE_URL
        and "placeholder" not in settings.SUPABASE_URL
        and settings.SUPABASE_KEY
        and "placeholder" not in settings.SUPABASE_KEY
    )


def geojson_to_ewkt(geometry: dict) -> str:
    """
    Converts a GeoJSON Polygon geometry into a PostGIS EWKT string (SRID=4326).
    Ensures that linear rings are properly closed.
    """
    coords = geometry.get("coordinates", [])
    if not coords or not coords[0]:
        raise ValueError("Invalid polygon coordinates.")

    rings_ewkt = []
    for ring in coords:
        if len(ring) < 3:
            continue
        closed_ring = list(ring)
        if closed_ring[0] != closed_ring[-1]:
            closed_ring.append(closed_ring[0])
        pts_str = ", ".join(f"{pt[0]} {pt[1]}" for pt in closed_ring)
        rings_ewkt.append(f"({pts_str})")

    return f"SRID=4326;POLYGON({', '.join(rings_ewkt)})"


def save_analysis_record(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Persists an analysis run to public.analysis_history in Supabase.
    Gracefully handles network and configuration errors without raising exceptions.

    Args:
        payload (dict): Analysis metrics, geometry, tier percentages, and metadata.

    Returns:
        dict: The inserted record from Supabase (including its UUID), or None on failure.
    """
    if not is_supabase_configured():
        logger.warning("Supabase credentials not configured. Skipping history persistence.")
        return None

    try:
        geometry = payload.get("geometry") or payload.get("geojson")
        if not geometry:
            logger.warning("No geometry provided for analysis record persistence.")
            return None

        # Convert polygon geometry to PostGIS EWKT
        ewkt = geojson_to_ewkt(geometry)

        total_area = float(payload.get("total_area_hectares") or 0.0)

        # Percentages
        stats = payload.get("stats") or {}
        dense_pct = float(payload.get("dense_pct") if payload.get("dense_pct") is not None else stats.get("dense_pct", 0.0))
        moderate_pct = float(payload.get("moderate_pct") if payload.get("moderate_pct") is not None else stats.get("moderate_pct", 0.0))
        sparse_pct = float(payload.get("sparse_pct") if payload.get("sparse_pct") is not None else stats.get("sparse_pct", 0.0))
        deficit_pct = float(
            payload.get("deficit_pct")
            if payload.get("deficit_pct") is not None
            else stats.get("non_veg_pct", payload.get("non_veg_pct", 0.0))
        )

        green_pct = float(
            payload.get("green_cover_percentage")
            if payload.get("green_cover_percentage") is not None
            else stats.get("green_cover_pct", round(dense_pct + moderate_pct, 2))
        )

        green_hectares = float(
            payload.get("green_cover_hectares")
            if payload.get("green_cover_hectares") is not None
            else round(total_area * (green_pct / 100.0), 2)
        )

        mean_ndvi = float(
            payload.get("mean_ndvi")
            if payload.get("mean_ndvi") is not None
            else stats.get("mean_ndvi", 0.0)
        )

        # Acquisition date normalization
        raw_date = payload.get("satellite_date_used") or payload.get("acquisition_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        sat_date = str(raw_date)[:10]

        # Insights serialization
        insights = payload.get("generated_insights") or payload.get("insights_summary") or payload.get("insights")
        if isinstance(insights, (dict, list)):
            insights_str = json.dumps(insights)
        elif insights:
            insights_str = str(insights)
        else:
            insights_str = "Standard urban canopy assessment"

        tile_url = payload.get("gee_tile_url") or payload.get("ndvi_tile_url") or payload.get("tile_url_template")
        area_name = payload.get("area_name") or payload.get("run_label") or payload.get("name") or "Custom Selected Area"

        row = {
            "area_name": area_name,
            "polygon_geom": ewkt,
            "total_area_hectares": round(total_area, 2),
            "green_cover_hectares": round(green_hectares, 2),
            "green_cover_percentage": round(green_pct, 2),
            "mean_ndvi": round(mean_ndvi, 3),
            "satellite_date_used": sat_date,
            "gee_tile_url": tile_url,
            "generated_insights": insights_str,
            "geojson": geometry,
            "dense_pct": round(dense_pct, 2),
            "moderate_pct": round(moderate_pct, 2),
            "sparse_pct": round(sparse_pct, 2),
            "deficit_pct": round(deficit_pct, 2)
        }

        # Optional client-provided UUID if present
        if payload.get("id"):
            row["id"] = str(payload["id"])

        headers = get_supabase_headers()
        url = get_supabase_rest_url("analysis_history")

        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, headers=headers, json=row)
            if resp.status_code in [200, 201]:
                data = resp.json()
                saved_record = data[0] if isinstance(data, list) and data else row
                logger.info("Successfully persisted analysis to Supabase: ID %s", saved_record.get("id"))
                return saved_record
            else:
                logger.warning(
                    "Failed to persist analysis to Supabase (HTTP %d): %s",
                    resp.status_code,
                    resp.text
                )
                return None

    except Exception as exc:
        logger.warning("Error saving analysis record to Supabase: %s", exc)
        return None


def list_analyses(limit: int = 50) -> List[Dict[str, Any]]:
    """
    Retrieves saved analysis records from analysis_history ordered by created_at DESC.

    Args:
        limit (int): Maximum records to return.

    Returns:
        list[dict]: Array of analysis records.
    """
    if not is_supabase_configured():
        return []

    try:
        headers = get_supabase_headers()
        url = f"{get_supabase_rest_url('analysis_history')}?order=created_at.desc&limit={limit}"
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, headers=headers)
            if resp.status_code == 200:
                return resp.json()
            else:
                logger.warning("Failed to query analysis_history (HTTP %d): %s", resp.status_code, resp.text)
                return []
    except Exception as exc:
        logger.warning("Error listing analyses from Supabase: %s", exc)
        return []


def get_analysis_by_id(analysis_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves a single saved analysis record by UUID.

    Args:
        analysis_id (str): UUID of the analysis record.

    Returns:
        dict: The full analysis record, or None if not found.
    """
    if not is_supabase_configured():
        return None

    try:
        headers = get_supabase_headers()
        url = f"{get_supabase_rest_url('analysis_history')}?id=eq.{analysis_id}&limit=1"
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                return data[0] if data else None
            else:
                logger.warning("Failed to get analysis by id (HTTP %d): %s", resp.status_code, resp.text)
                return None
    except Exception as exc:
        logger.warning("Error getting analysis by id from Supabase: %s", exc)
        return None


def delete_analysis_by_id(analysis_id: str) -> bool:
    """
    Deletes an analysis record by UUID from analysis_history.

    Args:
        analysis_id (str): UUID of the analysis record.

    Returns:
        bool: True if deleted, False otherwise.
    """
    if not is_supabase_configured():
        return False

    try:
        headers = get_supabase_headers()
        url = f"{get_supabase_rest_url('analysis_history')}?id=eq.{analysis_id}"
        with httpx.Client(timeout=10.0) as client:
            resp = client.delete(url, headers=headers)
            if resp.status_code in [200, 204]:
                data = resp.json() if resp.status_code == 200 and resp.text else []
                return len(data) > 0 if isinstance(data, list) else True
            else:
                logger.warning("Failed to delete analysis from Supabase (HTTP %d): %s", resp.status_code, resp.text)
                return False
    except Exception as exc:
        logger.warning("Error deleting analysis from Supabase: %s", exc)
        return False


def update_analysis_insights(analysis_id: str, insights: Any) -> bool:
    """
    Updates the generated_insights column of a saved analysis record by UUID.

    Args:
        analysis_id (str): UUID of the analysis record.
        insights (Any): Insights payload (dict, list, or string).

    Returns:
        bool: True if updated successfully, False otherwise.
    """
    if not is_supabase_configured():
        return False

    try:
        if isinstance(insights, (dict, list)):
            insights_str = json.dumps(insights)
        else:
            insights_str = str(insights)

        headers = get_supabase_headers()
        url = f"{get_supabase_rest_url('analysis_history')}?id=eq.{analysis_id}"
        payload = {"generated_insights": insights_str}

        with httpx.Client(timeout=10.0) as client:
            resp = client.patch(url, headers=headers, json=payload)
            if resp.status_code in [200, 204]:
                logger.info("Successfully updated insights for analysis %s in Supabase", analysis_id)
                return True
            else:
                logger.warning("Failed to update insights in Supabase (HTTP %d): %s", resp.status_code, resp.text)
                return False
    except Exception as exc:
        logger.warning("Error updating insights in Supabase: %s", exc)
        return False


