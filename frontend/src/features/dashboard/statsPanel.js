/**
 * @file statsPanel.js
 * @description Manages rendering of primary GIS canopy metrics, including total area,
 * green-cover percentage, mean NDVI index, acquisition timestamp, 4-tier density breakdown,
 * and optical ground cell resolution.
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

    // Extract 4-tier statistics (prefer data.stats, fallback to data.vegetation_breakdown)
    const stats = data.stats || {};
    const breakdown = data.vegetation_breakdown || {};

    const densePct = stats.dense_pct ?? breakdown.dense_canopy_pct ?? 0;
    const moderatePct = stats.moderate_pct ?? breakdown.moderate_cover_pct ?? 0;
    const sparsePct = stats.sparse_pct ?? (breakdown.sparse_or_built_pct ? Math.round(breakdown.sparse_or_built_pct / 2) : 0);
    const nonVegPct = stats.non_veg_pct ?? (breakdown.sparse_or_built_pct ? Math.round(breakdown.sparse_or_built_pct / 2) : 0);
    const greenPct = stats.green_cover_pct ?? data.green_cover_percentage ?? 0;
    const meanNdvi = stats.mean_ndvi ?? data.mean_ndvi ?? 0;

    const satelliteLabel = data.satellite || "Sentinel-2 L2A (10m)";
    const acqDate = data.acquisition_date || "Recent Optical";
    const pixelCount = stats.pixel_count || Math.round((data.total_area_sq_meters || 0) / 100);

    this.container.innerHTML = `
      <div class="stats-panel-card glass-panel">
        <div class="panel-header">
          <div class="panel-header-title">
            <i class="fa-solid fa-chart-column"></i>
            <span class="panel-title">Canopy Statistics</span>
          </div>
          <span class="panel-date-badge" title="Sentinel-2 Scene Acquisition Date">
            <i class="fa-regular fa-calendar-check"></i> ${acqDate}
          </span>
        </div>

        <div class="satellite-mission-chip">
          <i class="fa-solid fa-satellite"></i>
          <span>${satelliteLabel}</span>
          ${pixelCount ? `<span class="pixel-count-tag">• ${pixelCount.toLocaleString()} Ground Pixels</span>` : ""}
        </div>

        <div class="metrics-grid">
          <div class="metric-item">
            <div class="metric-label">Green Cover</div>
            <div class="metric-value highlight-green">${greenPct}%</div>
            <div class="metric-sub">NDVI &ge; 0.20 Canopy</div>
          </div>

          <div class="metric-item">
            <div class="metric-label">Mean NDVI</div>
            <div class="metric-value highlight-cyan">${meanNdvi}</div>
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

        <!-- 4-Tier Canopy Distribution Bar -->
        <div class="breakdown-section">
          <div class="breakdown-header">
            <span>Canopy Tier Distribution</span>
            <span class="breakdown-caption">10m Optical Resolution</span>
          </div>

          <div class="progress-bar-bg">
            <div class="progress-fill-dense" style="width: ${densePct}%; background-color: #1a9850;" title="Dense Canopy: ${densePct}%"></div>
            <div class="progress-fill-moderate" style="width: ${moderatePct}%; background-color: #66bd63;" title="Moderate Cover: ${moderatePct}%"></div>
            <div class="progress-fill-sparse" style="width: ${sparsePct}%; background-color: #fdae61;" title="Sparse Scrub: ${sparsePct}%"></div>
            <div class="progress-fill-nonveg" style="width: ${nonVegPct}%; background-color: #d73027;" title="Non-Veg / Built-up: ${nonVegPct}%"></div>
          </div>

          <div class="breakdown-legend-4tier">
            <span class="breakdown-legend-item"><span class="dot-swatch" style="background:#1a9850;"></span> Dense: ${densePct}%</span>
            <span class="breakdown-legend-item"><span class="dot-swatch" style="background:#66bd63;"></span> Mod: ${moderatePct}%</span>
            <span class="breakdown-legend-item"><span class="dot-swatch" style="background:#fdae61;"></span> Sparse: ${sparsePct}%</span>
            <span class="breakdown-legend-item"><span class="dot-swatch" style="background:#d73027;"></span> Non-Veg: ${nonVegPct}%</span>
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
