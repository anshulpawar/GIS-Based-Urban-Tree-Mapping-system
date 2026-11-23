/**
 * @file config.js
 * @description Centralized environment configuration for Urban GreenWatch.
 * Automatically detects local development (127.0.0.1:8000) vs. production Render backend.
 */

// Production Render backend URL (overridable via window.UGW_API_URL in frontend/config.js)
const DEFAULT_PROD_API_URL = "https://gis-based-urban-tree-mapping-system.onrender.com";

function isLocalEnvironment() {
  if (typeof window === "undefined" || !window.location) return true;
  const h = (window.location.hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h.endsWith(".local");
}

export const IS_LOCAL = isLocalEnvironment();

export function resolveApiBaseUrl() {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:8000/api";
  }

  // 1. Explicit runtime override (set in frontend/config.js or injected by host)
  // When running locally, ignore default production URL so local dev works seamlessly with 127.0.0.1:8000
  const runtimeOverride = window.UGW_API_URL || (window.__ENV__ && window.__ENV__.API_URL);
  if (runtimeOverride && typeof runtimeOverride === "string" && runtimeOverride.trim()) {
    const trimmed = runtimeOverride.trim().replace(/\/+$/, "");
    if (!IS_LOCAL || window.UGW_FORCE_REMOTE || trimmed !== DEFAULT_PROD_API_URL.replace(/\/+$/, "")) {
      return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
    }
  }

  // 2. Local development fallback
  if (IS_LOCAL) {
    return "http://127.0.0.1:8000/api";
  }

  // 3. Production deployed fallback (Vercel -> Render)
  const prodTrimmed = DEFAULT_PROD_API_URL.replace(/\/+$/, "");
  return prodTrimmed.endsWith("/api") ? prodTrimmed : `${prodTrimmed}/api`;
}

export const API_BASE_URL = resolveApiBaseUrl();

/**
 * Returns a clean, normalized endpoint URL with zero duplicate slashes.
 * Dynamically resolves against current runtime configuration.
 * @param {string} path - e.g. "/analyze", "analyze/compare", "/health"
 * @returns {string} Fully qualified URL e.g. "http://127.0.0.1:8000/api/analyze"
 */
export function getApiEndpoint(path) {
  const base = resolveApiBaseUrl();
  const cleanPath = path ? path.replace(/^\/+/, "") : "";
  return `${base}/${cleanPath}`;
}
