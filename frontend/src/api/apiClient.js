/**
 * @file apiClient.js
 * @description Centralized HTTP client communicating with the FastAPI backend.
 * Provides typed methods for NDVI analysis execution, historical run queries,
 * and service health monitoring.
 */

const API_BASE_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:8000/api"
  : "/api";

/**
 * Checks system health and backend connectivity.
 * @returns {Promise<{status: string, system: string}>}
 */
export async function checkSystemHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error(`Health check returned status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn("Backend health check failed:", error);
    return { status: "disconnected", error: error.message };
  }
}

/**
 * Submits an AOI polygon geometry to Google Earth Engine for NDVI and True-Color processing.
 * @param {Object} geoJsonPolygon - GeoJSON Polygon geometry { type: "Polygon", coordinates: [...] }
 * @param {Object} [options={}] - Optional filters and metrics (name, run_label, area_sqkm, area_ha, perimeter_km, cloud_threshold_pct, start_date, end_date)
 * @returns {Promise<Object>} Computed NDVI stats, ndvi_tile_url, and rgb_tile_url
 */
export async function submitAnalyzeRequest(geoJsonPolygon, options = {}) {
  const payload = {
    geometry: geoJsonPolygon,
    name: options.name || options.run_label || `Analysis Run ${new Date().toLocaleTimeString()}`,
    run_label: options.run_label || options.name || `Analysis Run ${new Date().toLocaleTimeString()}`,
    area_sqkm: options.area_sqkm ?? null,
    area_ha: options.area_ha ?? null,
    perimeter_km: options.perimeter_km ?? null,
    cloud_threshold_pct: options.cloud_threshold_pct ?? 25.0,
    start_date: options.start_date || null,
    end_date: options.end_date || null
  };

  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Analysis failed with HTTP ${response.status}`);
  }

  return await response.json();
}

/**
 * Submits an AOI polygon geometry and historical comparison date to Google Earth Engine.
 * @param {Object} geoJsonPolygon - GeoJSON Polygon geometry { type: "Polygon", coordinates: [...] }
 * @param {string} historicalDate - Target historical date (YYYY-MM-DD)
 * @param {Object} [options={}] - Optional parameters (name, current_date)
 * @returns {Promise<Object>} Comparison results: mean_current_ndvi, mean_historical_ndvi, mean_delta_ndvi, gain_pct, loss_pct, stable_pct, delta_tile_url, historical_tile_url
 */
export async function submitCompareRequest(geoJsonPolygon, historicalDate, options = {}) {
  const payload = {
    geometry: geoJsonPolygon,
    historical_date: historicalDate,
    current_date: options.current_date || null,
    name: options.name || `Temporal Comparison ${historicalDate}`
  };

  const response = await fetch(`${API_BASE_URL}/analyze/compare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Temporal comparison failed with HTTP ${response.status}`);
  }

  return await response.json();
}

/**
 * Retrieves the historical analysis runs.
 * @param {number} [limit=50]
 * @param {number} [offset=0]
 * @returns {Promise<{total: number, items: Array}>}
 */
export async function fetchAnalysisHistory(limit = 50, offset = 0) {
  const response = await fetch(`${API_BASE_URL}/history?limit=${limit}&offset=${offset}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch history: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Retrieves a single analysis run by ID including its GeoJSON boundary.
 * @param {string} id - Analysis Run UUID
 * @returns {Promise<Object>}
 */
export async function fetchHistoryDetail(id) {
  const response = await fetch(`${API_BASE_URL}/history/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch run ${id}: ${response.statusText}`);
  }
  return await response.json();
}

