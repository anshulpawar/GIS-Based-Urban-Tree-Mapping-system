/**
 * @file legend.js
 * @description Renders the Global Nature Watch styled NDVI vegetation density scale
 * inside the left panel's LEGEND tab, complete with layer header, opacity slider,
 * 4 classification tiers, and satellite source footer.
 */

export class LegendControl {
  /**
   * @param {string} [containerId="tab-content-legend"] - Target DOM element ID
   * @param {Object} [options={}]
   * @param {Function} [options.onOpacityChange] - Callback receiving opacity (0.0 to 1.0)
   * @param {Function} [options.onVisibilityToggle] - Callback receiving boolean isVisible
   */
  constructor(containerId = "tab-content-legend", options = {}) {
    this.container = document.getElementById(containerId);
    this.onOpacityChange = options.onOpacityChange || null;
    this.onVisibilityToggle = options.onVisibilityToggle || null;
    this.currentOpacity = 80;
    this.isVisible = true;
  }

  /**
   * Renders the complete NDVI legend module into the target tab.
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="legend-card-module">
        <div class="legend-card-header">
          <span class="legend-layer-title">SENTINEL-2 10M NDVI (GLOBAL)</span>
          <button id="btn-toggle-layer-visibility" class="btn-icon-subtle" title="Toggle layer visibility">
            <i id="layer-visibility-icon" class="fa-solid fa-eye"></i>
          </button>
        </div>

        <div class="legend-card-body">
          <!-- Opacity Slider -->
          <div class="legend-opacity-box">
            <div class="opacity-header-row">
              <span>Layer Opacity</span>
              <span id="opacity-val-badge" class="opacity-badge">${this.currentOpacity}%</span>
            </div>
            <input
              type="range"
              id="ndvi-opacity-slider"
              class="legend-opacity-slider"
              min="0"
              max="100"
              value="${this.currentOpacity}"
              title="Adjust Sentinel-2 NDVI overlay opacity"
            />
          </div>

          <!-- Continuous Gradient Ramp -->
          <div class="legend-ramp-bar" title="NDVI Spectral Ramp: -1.0 to +1.0"></div>

          <!-- 4 Classification Tiers -->
          <div class="legend-tiers-list">
            <div class="legend-tier-row">
              <div class="legend-tier-left">
                <span class="tier-swatch dense"></span>
                <span>Dense Canopy / Forest</span>
              </div>
              <span class="tier-range">&gt; 0.50</span>
            </div>

            <div class="legend-tier-row">
              <div class="legend-tier-left">
                <span class="tier-swatch moderate"></span>
                <span>Moderate Vegetation</span>
              </div>
              <span class="tier-range">0.25 &ndash; 0.50</span>
            </div>

            <div class="legend-tier-row">
              <div class="legend-tier-left">
                <span class="tier-swatch sparse"></span>
                <span>Sparse Vegetation / Scrub</span>
              </div>
              <span class="tier-range">0.10 &ndash; 0.25</span>
            </div>

            <div class="legend-tier-row">
              <div class="legend-tier-left">
                <span class="tier-swatch bare"></span>
                <span>Non-Vegetated / Built-up / Water</span>
              </div>
              <span class="tier-range">&lt; 0.10</span>
            </div>
          </div>
        </div>

        <div class="legend-card-footer">
          GOOGLE SATELLITE IMAGERY / SENTINEL-2 L2A (GLOBAL)
        </div>
      </div>
    `;

    this.bindEvents();
  }

  /**
   * Binds slider change and visibility toggle listeners.
   */
  bindEvents() {
    const opacitySlider = document.getElementById("ndvi-opacity-slider");
    const opacityBadge = document.getElementById("opacity-val-badge");
    const visibilityBtn = document.getElementById("btn-toggle-layer-visibility");
    const visibilityIcon = document.getElementById("layer-visibility-icon");

    if (opacitySlider && opacityBadge) {
      opacitySlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        this.currentOpacity = val;
        opacityBadge.textContent = `${val}%`;

        if (this.onOpacityChange && typeof this.onOpacityChange === "function") {
          this.onOpacityChange(val / 100.0);
        }
      });
    }

    if (visibilityBtn && visibilityIcon) {
      visibilityBtn.addEventListener("click", () => {
        this.isVisible = !this.isVisible;
        visibilityIcon.className = this.isVisible ? "fa-solid fa-eye" : "fa-solid fa-eye-slash";
        visibilityBtn.style.color = this.isVisible ? "var(--text-muted)" : "var(--accent-rose)";

        if (this.onVisibilityToggle && typeof this.onVisibilityToggle === "function") {
          this.onVisibilityToggle(this.isVisible);
        }
      });
    }
  }

  /**
   * Sets opacity value programmatically.
   * @param {number} opacity - 0.0 to 1.0
   */
  setOpacity(opacity) {
    const pct = Math.round(opacity * 100);
    this.currentOpacity = pct;
    const slider = document.getElementById("ndvi-opacity-slider");
    const badge = document.getElementById("opacity-val-badge");
    if (slider) slider.value = pct;
    if (badge) badge.textContent = `${pct}%`;
  }
}
