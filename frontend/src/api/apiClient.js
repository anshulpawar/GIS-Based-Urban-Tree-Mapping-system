/**
 * @file apiClient.js
 * @description Centralized HTTP client communicating with the FastAPI backend.
 * Provides typed methods for NDVI analysis execution, historical run queries,
 * and service health monitoring.
 */

import { API_BASE_URL, getApiEndpoint } from "../config.js";

export { API_BASE_URL, getApiEndpoint };

/**
 * Checks system health and backend connectivity.
 * @returns {Promise<{status: string, system: string}>}
 */
export async function checkSystemHealth() {
  try {
    const response = await fetch(getApiEndpoint("/health"));
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
    area_name: options.area_name || options.name || options.run_label || "Custom Selected Area",
    name: options.name || options.run_label || options.area_name || `Analysis Run ${new Date().toLocaleTimeString()}`,
    run_label: options.run_label || options.name || options.area_name || `Analysis Run ${new Date().toLocaleTimeString()}`,
    area_sqkm: options.area_sqkm ?? null,
    area_ha: options.area_ha ?? null,
    perimeter_km: options.perimeter_km ?? null,
    cloud_threshold_pct: options.cloud_threshold_pct ?? 25.0,
    start_date: options.start_date || null,
    end_date: options.end_date || null
  };

  const response = await fetch(getApiEndpoint("/analyze"), {
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

  const response = await fetch(getApiEndpoint("/analyze/compare"), {
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
 * Retrieves the list of saved analysis runs from Supabase PostGIS via the FastAPI backend.
 * @param {number} [limit=50] - Maximum records to return
 * @returns {Promise<Array<Object>>}
 */
export async function fetchSavedAnalyses(limit = 50) {
  const response = await fetch(getApiEndpoint(`/analyses?limit=${limit}`));
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to fetch saved analyses: HTTP ${response.status}`);
  }
  return await response.json();
}

/**
 * Retrieves a single saved analysis record by ID from Supabase PostGIS.
 * @param {string} id - Analysis Run UUID
 * @returns {Promise<Object>}
 */
export async function fetchAnalysisById(id) {
  const response = await fetch(getApiEndpoint(`/analyses/${id}`));
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to fetch analysis ${id}: HTTP ${response.status}`);
  }
  return await response.json();
}

/**
 * Deletes a saved analysis run from Supabase PostGIS by ID.
 * @param {string} id - Analysis Run UUID
 * @returns {Promise<{status: string, id: string}>}
 */
export async function deleteAnalysisById(id) {
  const response = await fetch(getApiEndpoint(`/analyses/${id}`), {
    method: "DELETE"
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to delete analysis ${id}: HTTP ${response.status}`);
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
  const response = await fetch(getApiEndpoint(`/history?limit=${limit}&offset=${offset}`));
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
  const response = await fetch(getApiEndpoint(`/history/${id}`));
  if (!response.ok) {
    throw new Error(`Failed to fetch run ${id}: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Requests AI environmental insights (Gemini 3.8 Flash / Rule Engine) for an analyzed AOI.
 * @param {Object} metrics - Telemetry metrics (area_name, total_area_hectares, green_cover_percentage, mean_ndvi, etc.)
 * @returns {Promise<Object>} InsightsResponse payload
 */
export async function generateAiInsights(metrics) {
  const response = await fetch(getApiEndpoint("/insights"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(metrics)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to generate insights: HTTP ${response.status}`);
  }

  return await response.json();
}


