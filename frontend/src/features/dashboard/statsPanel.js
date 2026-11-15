/**
 * @file statsPanel.js
 * @description Manages rendering of primary GIS canopy metrics, including total area,
 * green-cover percentage, mean NDVI index, acquisition timestamp, and density tier breakdown.
 */

export class StatsPanel {
  /**
   * @param {string} [containerId="stats-container"] - Target element ID for the statistics panel
   */
  constructor(containerId = "stats-container") {
    this.container = document.getElementById(containerId);
  }

  /**
   * Updates panel with computed metrics from the backend.
   * @param {Object} data - Analysis response data
   */
  update(data) {
    if (!this.container || !data) return;

    this.container.style.display = "block";

    const breakdown = data.vegetation_breakdown || {
      dense_canopy_pct: 0,
      moderate_cover_pct: 0,
      sparse_or_built_pct: 0
    };

    this.container.innerHTML = `
      <div class="stats-panel-card glass-panel">
        <div class="panel-header">
          <div class="panel-header-title">
            <i class="fa-solid fa-chart-column"></i>
            <span class="panel-title">Canopy Statistics</span>
          </div>
          <span class="panel-date-badge">${data.acquisition_date || "Sentinel-2 L2A"}</span>
        </div>

        <div class="metrics-grid">
          <div class="metric-item">
            <div class="metric-label">Green Cover</div>
            <div class="metric-value highlight-green">${data.green_cover_percentage}%</div>
            <div class="metric-sub">NDVI &ge; 0.30 Threshold</div>
          </div>

          <div class="metric-item">
            <div class="metric-label">Mean NDVI</div>
            <div class="metric-value highlight-cyan">${data.mean_ndvi}</div>
            <div class="metric-sub">Range: -1.0 to +1.0</div>
          </div>

          <div class="metric-item">
            <div class="metric-label">Total Area</div>
            <div class="metric-value">${data.total_area_hectares} ha</div>
            <div class="metric-sub">${(data.total_area_hectares / 100).toFixed(2)} km²</div>
          </div>

          <div class="metric-item">
            <div class="metric-label">Surface Area</div>
            <div class="metric-value" style="font-size: 14px;">
              ${(data.total_area_sq_meters / 1000).toFixed(1)}k m²
            </div>
            <div class="metric-sub">Calculated Extent</div>
          </div>
        </div>

        <!-- Canopy Tier Distribution Bar -->
        <div class="breakdown-section">
          <div class="breakdown-header">
            <span>Canopy Tier Distribution</span>
            <span class="breakdown-caption">10m Optical Resolution</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-fill-dense" style="width: ${breakdown.dense_canopy_pct}%" title="Dense Canopy: ${breakdown.dense_canopy_pct}%"></div>
            <div class="progress-fill-moderate" style="width: ${breakdown.moderate_cover_pct}%" title="Moderate Cover: ${breakdown.moderate_cover_pct}%"></div>
            <div class="progress-fill-sparse" style="width: ${breakdown.sparse_or_built_pct}%" title="Sparse / Built: ${breakdown.sparse_or_built_pct}%"></div>
          </div>

          <div class="breakdown-legend">
            <span class="breakdown-legend-item text-dense">● Dense: ${breakdown.dense_canopy_pct}%</span>
            <span class="breakdown-legend-item text-moderate">● Mod: ${breakdown.moderate_cover_pct}%</span>
            <span class="breakdown-legend-item text-sparse">● Sparse: ${breakdown.sparse_or_built_pct}%</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Hides the statistics container.
   */
  clear() {
    if (this.container) {
      this.container.style.display = "none";
      this.container.innerHTML = "";
    }
  }
}
