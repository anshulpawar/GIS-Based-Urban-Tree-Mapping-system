/**
 * @file statsPanel.js
 * @description Manages rendering of primary GIS canopy metrics, including total area,
 * green-cover percentage, mean NDVI index, acquisition timestamp, and density tier breakdown.
 */

export class StatsPanel {
  /**
   * @param {string} containerId - Target element ID for the statistics panel
   */
  constructor(containerId = "stats-panel-container") {
    this.container = document.getElementById(containerId);
    this.renderPlaceholder();
  }

  /**
   * Renders the initial state prompting the user to draw an AOI polygon.
   */
  renderPlaceholder() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Canopy Statistics</span>
        <span style="font-size: 11px; color: #94a3b8;">Waiting for AOI</span>
      </div>
      <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
        Draw a polygon on the map or select a past run from history to compute real-time
        Sentinel-2 vegetation coverage and mean NDVI.
      </p>
    `;
  }

  /**
   * Updates panel with computed metrics from the backend.
   * @param {Object} data - Analysis response data
   */
  update(data) {
    if (!this.container || !data) return;

    const breakdown = data.vegetation_breakdown || {
      dense_canopy_pct: 0,
      moderate_cover_pct: 0,
      sparse_or_built_pct: 0
    };

    this.container.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">${data.run_label || "Analysis Metrics"}</span>
        <span style="font-size: 11px; color: #38bdf8;">${data.acquisition_date || "Live"}</span>
      </div>

      <div class="metrics-grid">
        <div class="metric-item">
          <div class="metric-label">Green Cover</div>
          <div class="metric-value highlight-green">${data.green_cover_percentage}%</div>
        </div>

        <div class="metric-item">
          <div class="metric-label">Mean NDVI</div>
          <div class="metric-value">${data.mean_ndvi}</div>
        </div>

        <div class="metric-item">
          <div class="metric-label">Total Area</div>
          <div class="metric-value">${data.total_area_hectares} ha</div>
        </div>

        <div class="metric-item">
          <div class="metric-label">Surface Area</div>
          <div class="metric-value" style="font-size: 15px;">
            ${(data.total_area_sq_meters / 1000).toFixed(1)}k m²
          </div>
        </div>
      </div>

      <div class="breakdown-section">
        <div class="breakdown-row">
          <span>Canopy Tier Distribution</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-fill-dense" style="width: ${breakdown.dense_canopy_pct}%" title="Dense Canopy: ${breakdown.dense_canopy_pct}%"></div>
          <div class="progress-fill-moderate" style="width: ${breakdown.moderate_cover_pct}%" title="Moderate Cover: ${breakdown.moderate_cover_pct}%"></div>
          <div class="progress-fill-sparse" style="width: ${breakdown.sparse_or_built_pct}%" title="Sparse / Built: ${breakdown.sparse_or_built_pct}%"></div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8;">
          <span style="color: #6ee7b7;">● Dense: ${breakdown.dense_canopy_pct}%</span>
          <span style="color: #bef264;">● Mod: ${breakdown.moderate_cover_pct}%</span>
          <span style="color: #fca5a5;">● Sparse: ${breakdown.sparse_or_built_pct}%</span>
        </div>
      </div>
    `;
  }
}

