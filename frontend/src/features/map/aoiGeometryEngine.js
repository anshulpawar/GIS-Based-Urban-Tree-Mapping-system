/**
 * @file aoiGeometryEngine.js
 * @description Geospatial calculations, ellipsoidal measurements, and guardrail validations
 * powered by Turf.js (@turf/turf). Handles live geodesic area (m², ha, km²), perimeter,
 * self-intersection detection (turf.kinks), size guardrails (0.01 km² to 250 km²),
 * centroid calculation, and reverse geocoding study area naming.
 */

/* global turf */

export class AoiGeometryEngine {
  // Simple in-memory cache for reverse geocoding queries
  static geocodeCache = new Map();

  /**
   * Minimum permissible AOI area in square kilometers (1 hectare = 0.01 km²).
   * Polygons below this lack sufficient 10m Sentinel-2 pixels for robust aggregation.
   */
  static MIN_AREA_SQ_KM = 0.01;

  /**
   * Maximum permissible AOI area in square kilometers (25,000 hectares = 250 km²).
   * Prevents excessive memory overhead and GEE zonal reduction quota timeouts.
   */
  static MAX_AREA_SQ_KM = 250.0;

  /**
   * Validates GeoJSON Polygon geometry and computes all geodesic metrics.
   * @param {Object} geojsonGeometry - GeoJSON Polygon geometry { type: "Polygon", coordinates: [...] }
   * @returns {Object} Validation status and detailed spatial metrics
   */
  static validateAndMeasure(geojsonGeometry) {
    if (!geojsonGeometry || !geojsonGeometry.coordinates || geojsonGeometry.coordinates.length === 0) {
      return {
        valid: false,
        status: "EMPTY",
        error: "No geometry coordinates provided.",
        metrics: null
      };
    }

    const ring = geojsonGeometry.coordinates[0];
    if (!Array.isArray(ring) || ring.length < 4) {
      return {
        valid: false,
        status: "INCOMPLETE",
        error: "At least 3 vertices are required to form an enclosed AOI polygon.",
        metrics: null
      };
    }

    // Ensure turf is available
    if (typeof turf === "undefined") {
      console.warn("Turf.js is not loaded. Fallback planar approximation will be used.");
      return this.fallbackPlanarMeasure(geojsonGeometry);
    }

    const feature = {
      type: "Feature",
      properties: {},
      geometry: geojsonGeometry
    };

    // 1. Check for polygon self-intersections (bow-tie geometries)
    try {
      const kinks = turf.kinks(feature);
      if (kinks && kinks.features && kinks.features.length > 0) {
        return {
          valid: false,
          status: "SELF_INTERSECTING",
          error: `Polygon has ${kinks.features.length} self-intersection(s). Boundaries cannot cross each other.`,
          kinkPoints: kinks.features.map((f) => f.geometry.coordinates),
          metrics: this.computeRawMetrics(feature, ring)
        };
      }
    } catch (kinkErr) {
      console.warn("Self-intersection detection warning:", kinkErr);
    }

    // 2. Compute Geodesic Measurements
    const metrics = this.computeRawMetrics(feature, ring);

    // 3. Guardrail: Minimum Area (0.01 km² = 1 ha)
    if (metrics.areaSqKm < this.MIN_AREA_SQ_KM) {
      return {
        valid: false,
        status: "TOO_SMALL",
        error: `AOI is too small (${metrics.formattedAreaHa}). Minimum size is 1.0 ha (0.01 km²) to aggregate 10m Sentinel-2 pixels.`,
        metrics
      };
    }

    // 4. Guardrail: Maximum Area (250 km² = 25,000 ha)
    if (metrics.areaSqKm > this.MAX_AREA_SQ_KM) {
      return {
        valid: false,
        status: "TOO_LARGE",
        error: `AOI exceeds processing threshold (${metrics.formattedAreaKm2}). Maximum allowed size is 250.0 km² (25,000 ha).`,
        metrics
      };
    }

    // AOI passes all geospatial guardrails!
    return {
      valid: true,
      status: "VALID",
      error: null,
      metrics
    };
  }

  /**
   * Computes ellipsoidal area, perimeter, centroid, bounding box, and pixel count.
   * @param {Object} feature - GeoJSON Feature
   * @param {Array} ring - Outer coordinate ring
   * @returns {Object}
   */
  static computeRawMetrics(feature, ring) {
    // 1. Geodesic Surface Area
    const areaSqMeters = turf.area(feature);
    const areaHectares = areaSqMeters / 10000.0;
    const areaSqKm = areaSqMeters / 1000000.0;
    const areaAcres = areaHectares * 2.47105;

    // 2. Geodesic Boundary Perimeter
    let perimeterKm = 0;
    let perimeterMeters = 0;
    try {
      const line = turf.polygonToLine(feature);
      perimeterKm = turf.length(line, { units: "kilometers" });
      perimeterMeters = perimeterKm * 1000.0;
    } catch {
      perimeterKm = 0;
      perimeterMeters = 0;
    }

    // 3. Centroid
    let centroidLng = 0;
    let centroidLat = 0;
    try {
      const centroid = turf.centroid(feature);
      [centroidLng, centroidLat] = centroid.geometry.coordinates;
    } catch {
      if (ring.length > 0) {
        centroidLng = ring[0][0];
        centroidLat = ring[0][1];
      }
    }

    // 4. Bounding Box [minLng, minLat, maxLng, maxLat]
    let bbox = null;
    try {
      bbox = turf.bbox(feature);
    } catch {
      bbox = null;
    }

    // 5. Estimated Sentinel-2 10m Pixels (1 pixel = 100 m²)
    const estimatedS2Pixels = Math.max(1, Math.round(areaSqMeters / 100.0));
    const vertexCount = ring.length > 1 ? ring.length - 1 : ring.length;

    return {
      areaSqMeters,
      areaHectares,
      areaSqKm,
      areaAcres,
      perimeterKm,
      perimeterMeters,
      centroid: [centroidLng, centroidLat],
      centroidLng,
      centroidLat,
      bbox,
      estimatedS2Pixels,
      vertexCount,

      // Pre-formatted strings for direct UI rendering
      formattedAreaHa: `${areaHectares.toFixed(2)} ha`,
      formattedAreaKm2: `${areaSqKm.toFixed(3)} km²`,
      formattedAreaSqM: `${Math.round(areaSqMeters).toLocaleString()} m²`,
      formattedPerimeter: perimeterKm >= 1.0 ? `${perimeterKm.toFixed(2)} km` : `${Math.round(perimeterMeters)} m`,
      formattedCentroid: `${centroidLat.toFixed(4)}° N, ${centroidLng.toFixed(4)}° E`,
      formattedPixels: `~${estimatedS2Pixels.toLocaleString()} px`
    };
  }

  /**
   * Fallback planar approximation if Turf.js CDN fails to load.
   */
  static fallbackPlanarMeasure(geojsonGeometry) {
    const ring = geojsonGeometry.coordinates[0];
    let areaSqMeters = 0;
    const vertexCount = ring.length - 1;

    if (ring.length >= 4) {
      const latScale = Math.cos((ring[0][1] * Math.PI) / 180.0);
      const mPerDegLat = 111320.0;
      const mPerDegLng = 111320.0 * latScale;

      for (let i = 0; i < ring.length - 1; i++) {
        const x1 = ring[i][0] * mPerDegLng;
        const y1 = ring[i][1] * mPerDegLat;
        const x2 = ring[i + 1][0] * mPerDegLng;
        const y2 = ring[i + 1][1] * mPerDegLat;
        areaSqMeters += x1 * y2 - x2 * y1;
      }
      areaSqMeters = Math.abs(areaSqMeters) / 2.0;
    }

    const areaHectares = areaSqMeters / 10000.0;
    const areaSqKm = areaSqMeters / 1000000.0;
    const centroidLng = ring[0] ? ring[0][0] : 0;
    const centroidLat = ring[0] ? ring[0][1] : 0;

    return {
      valid: areaSqKm >= this.MIN_AREA_SQ_KM && areaSqKm <= this.MAX_AREA_SQ_KM,
      status: areaSqKm < this.MIN_AREA_SQ_KM ? "TOO_SMALL" : areaSqKm > this.MAX_AREA_SQ_KM ? "TOO_LARGE" : "VALID",
      error: null,
      metrics: {
        areaSqMeters,
        areaHectares,
        areaSqKm,
        areaAcres: areaHectares * 2.47105,
        perimeterKm: 1.0,
        perimeterMeters: 1000,
        centroid: [centroidLng, centroidLat],
        centroidLng,
        centroidLat,
        bbox: null,
        estimatedS2Pixels: Math.round(areaSqMeters / 100.0),
        vertexCount,
        formattedAreaHa: `${areaHectares.toFixed(2)} ha`,
        formattedAreaKm2: `${areaSqKm.toFixed(3)} km²`,
        formattedAreaSqM: `${Math.round(areaSqMeters).toLocaleString()} m²`,
        formattedPerimeter: "1.00 km",
        formattedCentroid: `${centroidLat.toFixed(4)}° N, ${centroidLng.toFixed(4)}° E`,
        formattedPixels: `~${Math.round(areaSqMeters / 100.0).toLocaleString()} px`
      }
    };
  }

  /**
   * Reverse-geocodes coordinate centroid into a human-readable study area label.
   * @param {number} lng - Longitude
   * @param {number} lat - Latitude
   * @returns {Promise<string>} Human-friendly study area name
   */
  static async reverseGeocode(lng, lat) {
    if (typeof lng !== "number" || typeof lat !== "number") {
      return "Custom Study Area";
    }

    const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    if (this.geocodeCache.has(cacheKey)) {
      return this.geocodeCache.get(cacheKey);
    }

    const endpoint = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=14&addressdetails=1`;

    try {
      const response = await fetch(endpoint, {
        headers: {
          Accept: "application/json",
          "User-Agent": "UrbanGreenWatch-GIS/1.0"
        }
      });

      if (!response.ok) {
        throw new Error(`Reverse geocoding HTTP ${response.status}`);
      }

      const data = await response.json();
      const addr = data.address || {};

      // Build hierarchical place name: [Local feature/suburb, City/district, State]
      const local =
        addr.suburb ||
        addr.neighbourhood ||
        addr.park ||
        addr.amenity ||
        addr.leisure ||
        addr.quarter ||
        addr.residential ||
        addr.road ||
        "";

      const municipality =
        addr.city ||
        addr.town ||
        addr.municipality ||
        addr.county ||
        addr.district ||
        "";

      const state = addr.state || addr.region || addr.country || "";

      const parts = [local, municipality, state].filter(Boolean);
      let studyName = parts.slice(0, 2).join(", ");

      if (!studyName) {
        studyName = data.display_name
          ? data.display_name.split(",").slice(0, 2).join(", ")
          : `Study Area (${lat.toFixed(3)}°, ${lng.toFixed(3)}°)`;
      }

      this.geocodeCache.set(cacheKey, studyName);
      return studyName;
    } catch (err) {
      console.warn("Reverse geocode fetch error:", err);
      const fallback = `Study Area (${lat.toFixed(3)}°, ${lng.toFixed(3)}°)`;
      this.geocodeCache.set(cacheKey, fallback);
      return fallback;
    }
  }
}

