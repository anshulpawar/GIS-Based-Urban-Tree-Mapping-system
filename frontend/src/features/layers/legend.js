/**
 * @file legend.js
 * @description Renders the vegetation density color ramp legend (Red to Dark Green)
 * and index value thresholds representing bare soil, grass, and dense tree canopies.
 */

export class LegendControl {
  /**
   * @param {string} containerId - Target HTML element ID for the legend
   */
  constructor(containerId = "legend-container") {
    this.container = document.getElementById(containerId);
  }

  /**
   * Renders the NDVI spectrum legend into the DOM container.
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="legend-panel">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8;">
          NDVI Canopy Density Scale
        </div>
        <div class="legend-bar"></div>
        <div class="legend-labels">
          <span>&lt; 0.2 (Built/Bare)</span>
          <span>0.35 (Shrub/Grass)</span>
          <span>&gt; 0.6 (Dense Canopy)</span>
        </div>
      </div>
    `;
  }
}

