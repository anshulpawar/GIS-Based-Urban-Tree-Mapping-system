/**
 * @file mapManager.js
 * @description Initializes and configures the core Leaflet map canvas,
 * base satellite/dark-mode tile layers, and viewport management.
 */

/* global L */

export class MapManager {
  /**
   * @param {string} containerId - DOM ID of the map element
   * @param {Object} [options={}] - Custom center [lat, lng] and zoom level
   */
  constructor(containerId = "map", options = {}) {
    this.containerId = containerId;
    this.defaultCenter = options.center || [12.9716, 77.5946]; // Default to urban study region (e.g. Bangalore)
    this.defaultZoom = options.zoom || 13;
    this.map = null;
    this.baseLayers = {};
  }

  /**
   * Initializes the Leaflet map with standard basemaps.
   * @returns {L.Map}
   */
  init() {
    this.map = L.map(this.containerId, {
      center: this.defaultCenter,
      zoom: this.defaultZoom,
      zoomControl: true
    });

    // Dark Basemap (optimized for high-contrast NDVI overlays)
    const darkCarto = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19
      }
    );

    // High-Resolution World Imagery
    const satelliteEsri = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Tiles &copy; Esri",
        maxZoom: 18
      }
    );

    // OpenStreetMap Standard
    const osmStandard = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        maxZoom: 19
      }
    );

    // Default to dark basemap
    darkCarto.addTo(this.map);

    this.baseLayers = {
      "CartoDB Dark": darkCarto,
      "Satellite (Esri)": satelliteEsri,
      "OpenStreetMap": osmStandard
    };

    L.control.layers(this.baseLayers, null, { position: "topright" }).addTo(this.map);

    return this.map;
  }

  /**
   * Smoothly pans and zooms the camera to fit GeoJSON coordinates.
   * @param {Array<Array<number>>} coordinates - [[[lng, lat], ...]]
   */
  fitToCoordinates(coordinates) {
    if (!this.map || !coordinates || coordinates.length === 0) return;

    // Convert GeoJSON [lng, lat] to Leaflet [lat, lng]
    const latLngs = coordinates[0].map(([lng, lat]) => [lat, lng]);
    const bounds = L.latLngBounds(latLngs);
    this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
  }

  /**
   * Returns the underlying Leaflet Map instance.
   * @returns {L.Map}
   */
  getMapInstance() {
    return this.map;
  }
}

