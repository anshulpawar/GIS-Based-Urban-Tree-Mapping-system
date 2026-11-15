/**
 * @file drawTool.js
 * @description Manages interactive polygon drawing tools (Leaflet Draw),
 * GeoJSON polygon extraction, validation, and rendering of recalled boundaries.
 */

/* global L */

export class DrawTool {
  /**
   * @param {L.Map} map - Leaflet map instance
   * @param {Function} [onPolygonComplete] - Callback receiving the GeoJSON polygon
   */
  constructor(map, onPolygonComplete = null) {
    this.map = map;
    this.onPolygonComplete = onPolygonComplete;
    this.drawnItems = new L.FeatureGroup();
    this.drawHandler = null;

    this.init();
  }

  /**
   * Configures Leaflet FeatureGroup and listens to drawing events.
   */
  init() {
    this.map.addLayer(this.drawnItems);

    // Initialize Leaflet Draw Control
    const drawControl = new L.Control.Draw({
      position: "topleft",
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: {
            color: "#10b981",
            fillColor: "#059669",
            fillOpacity: 0.25,
            weight: 2
          }
        },
        polyline: false,
        circle: false,
        rectangle: {
          shapeOptions: {
            color: "#06b6d4",
            fillColor: "#0891b2",
            fillOpacity: 0.25,
            weight: 2
          }
        },
        circlemarker: false,
        marker: false
      },
      edit: {
        featureGroup: this.drawnItems,
        remove: true
      }
    });

    this.map.addControl(drawControl);

    // Listen for created vector shapes
    this.map.on(L.Draw.Event.CREATED, (event) => {
      const layer = event.layer;
      this.clear();
      this.drawnItems.addLayer(layer);

      const geoJson = layer.toGeoJSON();
      if (this.onPolygonComplete && typeof this.onPolygonComplete === "function") {
        this.onPolygonComplete(geoJson.geometry);
      }
    });
  }

  /**
   * Programmatically triggers the polygon drawing tool.
   */
  startPolygonDraw() {
    if (this.drawHandler) {
      this.drawHandler.disable();
    }
    this.drawHandler = new L.Draw.Polygon(this.map, {
      shapeOptions: {
        color: "#10b981",
        fillColor: "#059669",
        fillOpacity: 0.3,
        weight: 2
      }
    });
    this.drawHandler.enable();
  }

  /**
   * Clears all drawn polygons from the map canvas.
   */
  clear() {
    if (this.drawHandler) {
      this.drawHandler.disable();
      this.drawHandler = null;
    }
    this.drawnItems.clearLayers();
  }

  /**
   * Renders a given GeoJSON polygon on the map (e.g. when recalling from history).
   * @param {Object} geoJsonGeometry - GeoJSON Polygon geometry
   */
  renderPolygon(geoJsonGeometry) {
    this.clear();
    const geoJsonLayer = L.geoJSON(geoJsonGeometry, {
      style: {
        color: "#06b6d4",
        fillColor: "#0891b2",
        fillOpacity: 0.25,
        weight: 2
      }
    });
    this.drawnItems.addLayer(geoJsonLayer);
  }
}

