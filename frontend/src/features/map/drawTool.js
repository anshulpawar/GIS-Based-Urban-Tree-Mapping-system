/**
 * @file drawTool.js
 * @description Manages interactive vector polygon drawing powered by Mapbox GL Draw (v1.4.3)
 * over MapLibre GL JS. Manages geometry capture, GeoJSON extraction, toolbar button states
 * (Draw, Clear, Analyze), and spatial rendering of recalled boundaries from PostGIS.
 */

/* global MapboxDraw */

export class DrawTool {
  /**
   * @param {Object} map - Active MapLibre map instance
   * @param {Object} [options={}]
   * @param {Function} [options.onPolygonComplete] - Callback when polygon is drawn
   * @param {Function} [options.onPolygonClear] - Callback when polygon is cleared
   * @param {Function} [options.onAnalyzeClick] - Callback when Analyze Area button is clicked
   */
  constructor(map, options = {}) {
    this.map = map;
    this.onPolygonComplete = options.onPolygonComplete || null;
    this.onPolygonClear = options.onPolygonClear || null;
    this.onAnalyzeClick = options.onAnalyzeClick || null;

    this.currentGeometry = null;
    this.isDrawing = false;

    // UI Buttons
    this.btnDraw = document.getElementById("btn-draw-polygon");
    this.btnClear = document.getElementById("btn-clear-polygon");
    this.btnAnalyze = document.getElementById("btn-analyze");
    this.btnEmptyStateDraw = document.getElementById("btn-empty-state-draw");

    this.init();
  }

  /**
   * Initializes MapboxDraw control with Global Nature Watch emerald theme.
   */
  init() {
    this.draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      defaultMode: "simple_select",
      styles: this.getDrawStyles()
    });

    this.map.addControl(this.draw);

    // Event listeners on MapLibre map
    this.map.on("draw.create", (e) => this.handleDrawCreate(e));
    this.map.on("draw.update", (e) => this.handleDrawUpdate(e));
    this.map.on("draw.delete", () => this.clear());
    this.map.on("draw.modechange", (e) => this.handleModeChange(e));

    this.bindToolbarEvents();
  }

  /**
   * Emerald polygon styling for active drawing, vertex selection, and static inspection.
   */
  getDrawStyles() {
    return [
      // Polygon fill - active / drawing
      {
        id: "gl-draw-polygon-fill-active",
        type: "fill",
        filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
        paint: {
          "fill-color": "#10b981",
          "fill-outline-color": "#10b981",
          "fill-opacity": 0.28
        }
      },
      // Polygon fill - inactive / completed
      {
        id: "gl-draw-polygon-fill-inactive",
        type: "fill",
        filter: [
          "all",
          ["==", "active", "false"],
          ["==", "$type", "Polygon"],
          ["!=", "mode", "static"]
        ],
        paint: {
          "fill-color": "#059669",
          "fill-outline-color": "#10b981",
          "fill-opacity": 0.25
        }
      },
      // Polygon fill - static (recalled)
      {
        id: "gl-draw-polygon-fill-static",
        type: "fill",
        filter: ["all", ["==", "mode", "static"], ["==", "$type", "Polygon"]],
        paint: {
          "fill-color": "#059669",
          "fill-outline-color": "#10b981",
          "fill-opacity": 0.25
        }
      },
      // Polygon stroke - active / drawing
      {
        id: "gl-draw-polygon-stroke-active",
        type: "line",
        filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": "#10b981",
          "line-width": 2.5
        }
      },
      // Polygon stroke - inactive / completed
      {
        id: "gl-draw-polygon-stroke-inactive",
        type: "line",
        filter: [
          "all",
          ["==", "active", "false"],
          ["==", "$type", "Polygon"],
          ["!=", "mode", "static"]
        ],
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": "#10b981",
          "line-width": 2.5
        }
      },
      // Polygon stroke - static (recalled)
      {
        id: "gl-draw-polygon-stroke-static",
        type: "line",
        filter: ["all", ["==", "mode", "static"], ["==", "$type", "Polygon"]],
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": "#10b981",
          "line-width": 2.5
        }
      },
      // Line active (while drawing edges)
      {
        id: "gl-draw-line-active",
        type: "line",
        filter: ["all", ["==", "active", "true"], ["==", "$type", "LineString"]],
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": "#10b981",
          "line-dasharray": [0.2, 2],
          "line-width": 2.5
        }
      },
      // Line inactive
      {
        id: "gl-draw-line-inactive",
        type: "line",
        filter: [
          "all",
          ["==", "active", "false"],
          ["==", "$type", "LineString"],
          ["!=", "mode", "static"]
        ],
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": "#10b981",
          "line-width": 2.5
        }
      },
      // Vertex outer halo
      {
        id: "gl-draw-polygon-and-line-vertex-halo-active",
        type: "circle",
        filter: [
          "all",
          ["==", "meta", "vertex"],
          ["==", "$type", "Point"],
          ["!=", "mode", "static"]
        ],
        paint: {
          "circle-radius": 7,
          "circle-color": "#ffffff"
        }
      },
      // Vertex center point
      {
        id: "gl-draw-polygon-and-line-vertex-active",
        type: "circle",
        filter: [
          "all",
          ["==", "meta", "vertex"],
          ["==", "$type", "Point"],
          ["!=", "mode", "static"]
        ],
        paint: {
          "circle-radius": 5,
          "circle-color": "#10b981"
        }
      },
      // Midpoints
      {
        id: "gl-draw-polygon-midpoint",
        type: "circle",
        filter: ["all", ["==", "meta", "midpoint"], ["==", "$type", "Point"]],
        paint: {
          "circle-radius": 4,
          "circle-color": "#34d399"
        }
      }
    ];
  }

  /**
   * Binds toolbar button actions (Draw, Clear, Analyze, Empty State Draw).
   */
  bindToolbarEvents() {
    if (this.btnDraw) {
      this.btnDraw.addEventListener("click", () => {
        if (this.isDrawing) {
          this.cancelDraw();
        } else {
          this.startPolygonDraw();
        }
      });
    }

    if (this.btnEmptyStateDraw) {
      this.btnEmptyStateDraw.addEventListener("click", () => {
        this.startPolygonDraw();
      });
    }

    if (this.btnClear) {
      this.btnClear.addEventListener("click", () => {
        this.clear();
      });
    }

    if (this.btnAnalyze) {
      this.btnAnalyze.addEventListener("click", () => {
        if (this.currentGeometry && this.onAnalyzeClick) {
          this.onAnalyzeClick(this.currentGeometry);
        }
      });
    }
  }

  /**
   * Activates polygon drawing mode.
   */
  startPolygonDraw() {
    this.cancelDraw();
    if (this.draw) {
      this.draw.deleteAll();
    }
    this.currentGeometry = null;
    this.updateButtonStates(false);

    if (this.draw) {
      this.draw.changeMode("draw_polygon");
    }
    this.isDrawing = true;

    if (this.btnDraw) {
      this.btnDraw.classList.add("active");
    }
  }

  /**
   * Cancels active polygon drawing.
   */
  cancelDraw() {
    if (this.draw) {
      this.draw.changeMode("simple_select");
    }
    this.isDrawing = false;
    if (this.btnDraw) {
      this.btnDraw.classList.remove("active");
    }
  }

  /**
   * Handles draw.modechange event from MapboxDraw.
   */
  handleModeChange(e) {
    if (e.mode !== "draw_polygon") {
      this.isDrawing = false;
      if (this.btnDraw) {
        this.btnDraw.classList.remove("active");
      }
    }
  }

  /**
   * Handles draw.create event.
   */
  handleDrawCreate(e) {
    const feature = e.features && e.features[0];
    if (!feature) return;

    this.currentGeometry = feature.geometry;
    this.isDrawing = false;
    if (this.btnDraw) {
      this.btnDraw.classList.remove("active");
    }
    this.updateButtonStates(true);

    if (this.onPolygonComplete && typeof this.onPolygonComplete === "function") {
      this.onPolygonComplete(this.currentGeometry);
    }
  }

  /**
   * Handles draw.update event (vertex modifications).
   */
  handleDrawUpdate(e) {
    const feature = e.features && e.features[0];
    if (!feature) return;

    this.currentGeometry = feature.geometry;
    if (this.onPolygonComplete && typeof this.onPolygonComplete === "function") {
      this.onPolygonComplete(this.currentGeometry);
    }
  }

  /**
   * Updates disabled attributes and styles of Clear and Analyze buttons.
   * @param {boolean} hasPolygon
   */
  updateButtonStates(hasPolygon) {
    if (this.btnClear) {
      this.btnClear.disabled = !hasPolygon;
    }
    if (this.btnAnalyze) {
      this.btnAnalyze.disabled = !hasPolygon;
    }
  }

  /**
   * Completely clears drawn polygon and resets UI state.
   */
  clear() {
    this.cancelDraw();
    if (this.draw) {
      this.draw.deleteAll();
    }
    this.currentGeometry = null;
    this.updateButtonStates(false);

    if (this.onPolygonClear && typeof this.onPolygonClear === "function") {
      this.onPolygonClear();
    }
  }

  /**
   * Renders an external GeoJSON polygon boundary onto the canvas (e.g. from history recall).
   * @param {Object} geoJsonGeometry - GeoJSON Polygon geometry { type: "Polygon", coordinates: [...] }
   */
  renderPolygon(geoJsonGeometry) {
    this.clear();

    const feature = {
      id: "recalled-boundary-" + Date.now(),
      type: "Feature",
      properties: {},
      geometry: geoJsonGeometry
    };

    if (this.draw) {
      this.draw.add(feature);
    }
    this.currentGeometry = geoJsonGeometry;
    this.updateButtonStates(true);
  }

  /**
   * Returns currently active GeoJSON polygon geometry, if any.
   * @returns {Object|null}
   */
  getCurrentGeometry() {
    return this.currentGeometry;
  }
}
