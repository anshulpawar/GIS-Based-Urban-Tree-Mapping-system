/**
 * @file mapManager.js
 * @description Global Nature Watch Vector Map Engine powered by MapLibre GL JS (v4.7.1).
 * Features:
 * - Raster Base: Esri World Imagery (High-Resolution Global Satellite, 100% key-free)
 * - Vector Boundaries & Labels: OpenFreeMap Planet Vector Tiles with GPU collision detection
 * - Zoom-Progressive Hierarchy: Country (z1-6) -> State (z4-8.5) -> City (z6-14) -> Street (z13+)
 * - Dedicated camera flight, bounding box fitting, live cursor coordinates & zoom tracking
 */

/* global maplibregl */

export class MapManager {
  /**
   * @param {string} [containerId="map"] - Target canvas container ID
   * @param {Object} [options={}]
   */
  constructor(containerId = "map", options = {}) {
    this.containerId = containerId;
    // MapLibre uses [lng, lat] for coordinates
    this.defaultCenter = options.center || [15.0, 20.0];
    this.defaultZoom = options.zoom || 2.5;
    this.map = null;
    this.isLoaded = false;
    this.onLoadCallbacks = [];

    // UI elements
    this.readoutZoomEl = document.getElementById("readout-zoom");
    this.readoutCoordsEl = document.getElementById("readout-coords");
  }

  /**
   * Initializes the MapLibre GL WebGL map instance.
   * @returns {maplibregl.Map}
   */
  init() {
    const style = this.buildVectorHybridStyle();

    this.map = new maplibregl.Map({
      container: this.containerId,
      style: style,
      center: this.defaultCenter,
      zoom: this.defaultZoom,
      minZoom: 2,
      maxZoom: 18,
      attributionControl: false,
      preserveDrawingBuffer: true
    });

    this.map.on("load", () => {
      this.isLoaded = true;
      this.onLoadCallbacks.forEach((callback) => {
        try {
          callback(this.map);
        } catch (err) {
          console.error("Map onLoad callback error:", err);
        }
      });
      this.onLoadCallbacks = [];
    });

    this.setupCursorTracking();
    this.setupBottomRightControls();

    return this.map;
  }

  /**
   * Registers a callback executed once MapLibre has finished loading style assets.
   * @param {Function} callback
   */
  onLoad(callback) {
    if (this.isLoaded) {
      callback(this.map);
    } else {
      this.onLoadCallbacks.push(callback);
    }
  }

  /**
   * Constructs the MapLibre Style Specification combining:
   * 1. Esri World Imagery (high-resolution satellite raster)
   * 2. OpenFreeMap planet vector tiles (borders, transportation, places)
   * 3. GPU collision-managed label symbol layers
   */
  buildVectorHybridStyle() {
    return {
      version: 8,
      glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
      sources: {
        "esri-satellite": {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          ],
          tileSize: 256,
          maxzoom: 17,
          attribution: "Tiles © Esri — Source: Esri, Copernicus Sentinel-2"
        },
        "openfreemap": {
          type: "vector",
          url: "https://tiles.openfreemap.org/planet"
        }
      },
      layers: [
        // 1. Satellite Base Raster Layer
        {
          id: "esri-satellite-layer",
          type: "raster",
          source: "esri-satellite",
          minzoom: 0,
          maxzoom: 22
        },

        // 2. Vector Administrative Boundaries
        // Country Boundaries (admin_level: 2)
        {
          id: "boundary-country",
          type: "line",
          source: "openfreemap",
          "source-layer": "boundary",
          filter: ["==", "admin_level", 2],
          minzoom: 1,
          maxzoom: 22,
          paint: {
            "line-color": "rgba(255, 255, 255, 0.65)",
            "line-width": [
              "interpolate", ["linear"], ["zoom"],
              2, 0.9,
              6, 1.8,
              12, 2.5
            ]
          }
        },
        // State / Province Boundaries (admin_level: 4)
        {
          id: "boundary-state",
          type: "line",
          source: "openfreemap",
          "source-layer": "boundary",
          filter: ["==", "admin_level", 4],
          minzoom: 4,
          maxzoom: 22,
          paint: {
            "line-color": "rgba(236, 252, 203, 0.55)",
            "line-width": [
              "interpolate", ["linear"], ["zoom"],
              4, 0.7,
              8, 1.4
            ],
            "line-dasharray": [3, 2]
          }
        },

        // 3. Transportation Lines (Clean, subtle, non-cluttered)
        // Motorways & Trunks (Zoom 7+)
        {
          id: "transport-motorway",
          type: "line",
          source: "openfreemap",
          "source-layer": "transportation",
          filter: ["in", "class", "motorway", "trunk", "primary"],
          minzoom: 7,
          maxzoom: 22,
          paint: {
            "line-color": "rgba(255, 255, 255, 0.5)",
            "line-width": [
              "interpolate", ["linear"], ["zoom"],
              7, 0.8,
              12, 2,
              16, 3.5
            ]
          }
        },
        // Secondary & Local Roads (Zoom 11+)
        {
          id: "transport-local",
          type: "line",
          source: "openfreemap",
          "source-layer": "transportation",
          filter: ["in", "class", "secondary", "tertiary", "minor", "street", "service"],
          minzoom: 11,
          maxzoom: 22,
          paint: {
            "line-color": "rgba(255, 255, 255, 0.35)",
            "line-width": [
              "interpolate", ["linear"], ["zoom"],
              11, 0.5,
              14, 1.5,
              17, 3
            ]
          }
        },

        // 4. Vector Labels (GPU-accelerated with collision detection)
        // Country Labels (Zoom 1 to 6)
        {
          id: "label-country",
          type: "symbol",
          source: "openfreemap",
          "source-layer": "place",
          filter: ["==", "class", "country"],
          minzoom: 1,
          maxzoom: 6,
          layout: {
            "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
            "text-font": ["Noto Sans Bold"],
            "text-size": [
              "interpolate", ["linear"], ["zoom"],
              2, 11,
              4, 14,
              6, 16
            ],
            "text-transform": "uppercase",
            "text-letter-spacing": 0.15,
            "text-max-width": 8,
            "text-allow-overlap": false,
            "text-ignore-placement": false
          },
          paint: {
            "text-color": "#f8fafc",
            "text-halo-color": "rgba(0, 0, 0, 0.9)",
            "text-halo-width": 2,
            "text-opacity": [
              "interpolate", ["linear"], ["zoom"],
              4, 1,
              5.5, 0.7,
              6, 0
            ]
          }
        },
        // State / Province Labels (Zoom 4 to 8.5)
        {
          id: "label-state",
          type: "symbol",
          source: "openfreemap",
          "source-layer": "place",
          filter: ["==", "class", "state"],
          minzoom: 4,
          maxzoom: 8.5,
          layout: {
            "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
            "text-font": ["Noto Sans Bold"],
            "text-size": [
              "interpolate", ["linear"], ["zoom"],
              4, 10,
              6, 12,
              8, 14
            ],
            "text-transform": "uppercase",
            "text-letter-spacing": 0.12,
            "text-allow-overlap": false,
            "text-ignore-placement": false
          },
          paint: {
            "text-color": "#ecfccb",
            "text-halo-color": "rgba(0, 0, 0, 0.9)",
            "text-halo-width": 1.8,
            "text-opacity": [
              "interpolate", ["linear"], ["zoom"],
              4, 0.5,
              5, 1,
              7.5, 1,
              8.5, 0
            ]
          }
        },
        // Major Cities (Zoom 6 to 14)
        {
          id: "label-city",
          type: "symbol",
          source: "openfreemap",
          "source-layer": "place",
          filter: ["in", "class", "city"],
          minzoom: 6,
          maxzoom: 14,
          layout: {
            "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
            "text-font": ["Noto Sans Bold"],
            "text-size": [
              "interpolate", ["linear"], ["zoom"],
              6, 11,
              10, 14
            ],
            "text-letter-spacing": 0.05,
            "text-allow-overlap": false,
            "text-ignore-placement": false
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "rgba(0, 0, 0, 0.85)",
            "text-halo-width": 1.5
          }
        },
        // Towns, Suburbs, Wards, Neighborhoods (Zoom 10+)
        {
          id: "label-town-neighborhood",
          type: "symbol",
          source: "openfreemap",
          "source-layer": "place",
          filter: ["in", "class", "town", "village", "suburb", "neighbourhood", "quarter"],
          minzoom: 10,
          maxzoom: 20,
          layout: {
            "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
            "text-font": ["Noto Sans Regular"],
            "text-size": [
              "interpolate", ["linear"], ["zoom"],
              10, 10,
              14, 13
            ],
            "text-allow-overlap": false,
            "text-ignore-placement": false
          },
          paint: {
            "text-color": "#f1f5f9",
            "text-halo-color": "rgba(0, 0, 0, 0.85)",
            "text-halo-width": 1.5
          }
        },
        // Road & Street Names (Zoom 13+)
        {
          id: "label-street",
          type: "symbol",
          source: "openfreemap",
          "source-layer": "transportation_name",
          minzoom: 13,
          maxzoom: 22,
          layout: {
            "symbol-placement": "line",
            "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11,
            "text-letter-spacing": 0.05,
            "text-allow-overlap": false,
            "text-ignore-placement": false
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "rgba(0, 0, 0, 0.9)",
            "text-halo-width": 1.5
          }
        }
      ]
    };
  }

  /**
   * Configures bottom-right zoom in and zoom out buttons.
   */
  setupBottomRightControls() {
    const zoomInBtn = document.getElementById("btn-zoom-in");
    const zoomOutBtn = document.getElementById("btn-zoom-out");

    if (zoomInBtn) {
      zoomInBtn.addEventListener("click", () => this.map.zoomIn());
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener("click", () => this.map.zoomOut());
    }
  }

  /**
   * Updates live mouse cursor coordinates and zoom level in bottom-right readout box.
   */
  setupCursorTracking() {
    const updateReadout = (lat, lng) => {
      if (this.readoutCoordsEl && lat !== undefined && lng !== undefined) {
        this.readoutCoordsEl.textContent = `lat, lon: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
      if (this.readoutZoomEl) {
        this.readoutZoomEl.textContent = `zoom: ${this.map.getZoom().toFixed(2)}`;
      }
    };

    this.map.on("mousemove", (event) => {
      updateReadout(event.lngLat.lat, event.lngLat.lng);
    });

    this.map.on("zoom", () => {
      const center = this.map.getCenter();
      updateReadout(center.lat, center.lng);
    });

    // Initial readout
    updateReadout(this.defaultCenter[1], this.defaultCenter[0]);
  }

  /**
   * Geocodes query via OpenStreetMap Nominatim and smoothly flies the camera.
   * @param {string} query - City, region, or coordinates
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async searchLocation(query) {
    if (!query || !query.trim()) {
      return { success: false, message: "Please enter a location name or coordinates." };
    }

    const cleanQuery = query.trim();

    // Check if query is latitude, longitude
    const coordMatch = cleanQuery.match(/^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[3]);
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        this.map.flyTo({ center: [lon, lat], zoom: 14, speed: 1.4 });
        return { success: true, message: `Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}` };
      }
    }

    const endpoint = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&limit=1`;

    try {
      const response = await fetch(endpoint, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "UrbanGreenWatch-GIS/1.0"
        }
      });

      if (!response.ok) {
        throw new Error(`Geocoding HTTP ${response.status}`);
      }

      const results = await response.json();
      if (!results || results.length === 0) {
        return { success: false, message: `No location found for "${cleanQuery}".` };
      }

      const item = results[0];
      const lat = parseFloat(item.lat);
      const lon = parseFloat(item.lon);

      if (item.boundingbox && item.boundingbox.length === 4) {
        const south = parseFloat(item.boundingbox[0]);
        const north = parseFloat(item.boundingbox[1]);
        const west = parseFloat(item.boundingbox[2]);
        const east = parseFloat(item.boundingbox[3]);
        this.map.fitBounds([[west, south], [east, north]], { padding: 60, maxZoom: 16 });
      } else {
        this.map.flyTo({ center: [lon, lat], zoom: 14, speed: 1.4 });
      }

      return {
        success: true,
        message: item.display_name.split(",").slice(0, 3).join(",")
      };
    } catch (err) {
      console.warn("Geocoding network error:", err);
      return { success: false, message: "Geocoding network error. Please try again." };
    }
  }

  /**
   * Fits camera to a GeoJSON polygon boundary.
   * Handles coordinates formatted as [[[lng, lat], ...]]
   * @param {Array} coordinates
   */
  fitToCoordinates(coordinates) {
    if (!this.map || !coordinates || coordinates.length === 0) return;

    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    const traverse = (item) => {
      if (typeof item[0] === "number" && typeof item[1] === "number") {
        const lng = item[0];
        const lat = item[1];
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      } else if (Array.isArray(item)) {
        item.forEach(traverse);
      }
    };

    traverse(coordinates);

    if (minLng !== Infinity && maxLng !== -Infinity) {
      this.map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 80, maxZoom: 16 });
    }
  }

  /**
   * Smoothly animates camera to coordinates [lat, lng].
   * @param {number} lat
   * @param {number} lng
   * @param {number} zoom
   */
  flyToLocation(lat, lng, zoom) {
    if (!this.map) return;
    this.map.flyTo({ center: [lng, lat], zoom, speed: 1.4 });
  }

  /**
   * Triggers map canvas re-render when switching views or window resize.
   */
  resize() {
    if (this.map) {
      this.map.resize();
    }
  }

  /**
   * Backward compatible alias for resize.
   */
  invalidateSize() {
    this.resize();
  }

  /**
   * Returns underlying MapLibre Map instance.
   * @returns {maplibregl.Map}
   */
  getMapInstance() {
    return this.map;
  }

  /**
   * Captures an image snapshot of the active map canvas, tightly zoomed and cropped
   * around the active AOI polygon with a minimal 10-15% buffer.
   * Restores the user's interactive camera view immediately upon capture.
   * @param {Object} [geometry] - Optional GeoJSON Polygon geometry
   * @returns {Promise<string|null>} Base64 PNG data URL or null on error
   */
  async getMapSnapshot(geometry = null) {
    try {
      if (!this.map) return null;
      const canvas = this.map.getCanvas();
      if (!canvas) return null;

      // If no valid polygon coordinates provided, capture full viewport as fallback
      if (!geometry || !geometry.coordinates || !Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
        const dataUrl = canvas.toDataURL("image/png");
        return (dataUrl && dataUrl.length > 200) ? dataUrl : null;
      }

      // 1. Extract coordinate bounds [minLng, minLat, maxLng, maxLat]
      let minLng = Infinity;
      let maxLng = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      const allCoords = [];

      const traverse = (coords) => {
        if (typeof coords[0] === "number" && typeof coords[1] === "number") {
          minLng = Math.min(minLng, coords[0]);
          maxLng = Math.max(maxLng, coords[0]);
          minLat = Math.min(minLat, coords[1]);
          maxLat = Math.max(maxLat, coords[1]);
          allCoords.push(coords);
        } else if (Array.isArray(coords)) {
          coords.forEach(traverse);
        }
      };
      traverse(geometry.coordinates);

      if (minLng === Infinity || maxLng === -Infinity || allCoords.length === 0) {
        const dataUrl = canvas.toDataURL("image/png");
        return (dataUrl && dataUrl.length > 200) ? dataUrl : null;
      }

      // 2. Save current camera state so user view is not disrupted
      const prevCenter = this.map.getCenter();
      const prevZoom = this.map.getZoom();
      const prevBearing = this.map.getBearing();
      const prevPitch = this.map.getPitch();

      // 3. Calculate 12% geographic buffer around the bounding box
      const dLng = Math.max(0.0005, (maxLng - minLng) * 0.12);
      const dLat = Math.max(0.0005, (maxLat - minLat) * 0.12);
      const bufferedBounds = [
        [minLng - dLng, minLat - dLat],
        [maxLng + dLng, maxLat + dLat]
      ];

      // 4. Fit camera tightly to polygon with animate: false
      this.map.fitBounds(bufferedBounds, { padding: 25, maxZoom: 18, animate: false });

      // 5. Wait for MapLibre to complete rendering the tight frame
      await new Promise((resolve) => {
        let resolved = false;
        const done = () => {
          if (!resolved) {
            resolved = true;
            requestAnimationFrame(() => requestAnimationFrame(resolve));
          }
        };

        if (this.map.loaded() && this.map.areTilesLoaded()) {
          done();
        } else {
          this.map.once("idle", done);
          setTimeout(done, 750);
        }
      });

      // 6. Project polygon vertices onto screen coordinates to crop tightly
      const activeCanvas = this.map.getCanvas();
      const clientW = activeCanvas.clientWidth || activeCanvas.width;
      const pixelRatio = activeCanvas.width / clientW;

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      allCoords.forEach((coord) => {
        const pt = this.map.project(coord);
        minX = Math.min(minX, pt.x);
        maxX = Math.max(maxX, pt.x);
        minY = Math.min(minY, pt.y);
        maxY = Math.max(maxY, pt.y);
      });

      minX *= pixelRatio;
      maxX *= pixelRatio;
      minY *= pixelRatio;
      maxY *= pixelRatio;

      const polyW = maxX - minX;
      const polyH = maxY - minY;

      // 12% pixel buffer around the polygon
      const bufX = Math.max(20 * pixelRatio, polyW * 0.12);
      const bufY = Math.max(20 * pixelRatio, polyH * 0.12);

      const cropX = Math.max(0, Math.floor(minX - bufX));
      const cropY = Math.max(0, Math.floor(minY - bufY));
      const cropW = Math.min(activeCanvas.width - cropX, Math.ceil(polyW + bufX * 2));
      const cropH = Math.min(activeCanvas.height - cropY, Math.ceil(polyH + bufY * 2));

      let tightDataUrl = null;
      if (cropW > 50 && cropH > 50) {
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const ctx = cropCanvas.getContext("2d");
        ctx.drawImage(activeCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        tightDataUrl = cropCanvas.toDataURL("image/png");
      }

      // 7. Immediately restore original camera position
      this.map.jumpTo({
        center: prevCenter,
        zoom: prevZoom,
        bearing: prevBearing,
        pitch: prevPitch
      });

      const finalUrl = tightDataUrl || activeCanvas.toDataURL("image/png");
      return (finalUrl && finalUrl.length > 200) ? finalUrl : null;
    } catch (err) {
      console.warn("Unable to capture map canvas snapshot (CORS or WebGL context):", err);
      return null;
    }
  }
}
