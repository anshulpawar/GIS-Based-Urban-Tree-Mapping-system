/**
 * @file legend.js
 * @description Renders the Global Nature Watch styled NDVI vegetation density scale
 * and True-Color satellite layer controls inside the left panel's LEGEND tab.
 * Includes segmented mode switcher (NDVI Heatmap vs. True Color), layer opacity slider,
 * 4 discrete classification tiers, and satellite mission metadata.
 */

export class LegendControl {
  /**
   * @param {string} [containerId="tab-content-legend"] - Target DOM element ID
   * @param {Object} [options={}]
   * @param {Function} [options.onOpacityChange] - Callback receiving opacity (0.0 to 1.0)
   * @param {Function} [options.onVisibilityToggle] - Callback receiving boolean isVisible
   * @param {Function} [options.onModeChange] - Callback receiving mode ("ndvi" | "rgb")
   */
  constructor(containerId = "tab-content-legend", options = {}) {
    this.container = document.getElementById(containerId);
    this.onOpacityChange = options.onOpacityChange || null;
    this.onVisibilityToggle = options.onVisibilityToggle || null;
    this.onModeChange = options.onModeChange || null;

    this.currentOpacity = 80;
    this.isVisible = true;
    this.currentMode = "ndvi"; // "ndvi" | "rgb"
  }

  /**
   * Renders the complete legend and layer controls module into the target tab.
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="legend-card-module">
        <div class="legend-card-header">
          <span class="legend-layer-title">SENTINEL-2 L2A (10M OPTICAL)</span>
          <button id="btn-toggle-layer-visibility" class="btn-icon-subtle" title="Toggle layer visibility">
            <i id="layer-visibility-icon" class="fa-solid fa-eye"></i>
          </button>
        </div>

        <div class="legend-card-body">
          <!-- Dual Layer Mode Switcher -->
          <div class="legend-mode-switcher-container">
            <div class="legend-mode-switcher">
              <button 
                id="btn-mode-ndvi" 
                class="legend-mode-btn ${this.currentMode === 'ndvi' ? 'active' : ''}" 
                data-mode="ndvi"
                title="View 4-Tier NDVI Vegetation Canopy Heatmap"
              >
                <i class="fa-solid fa-leaf"></i>
                <span>NDVI Heatmap</span>
              </button>
              <button 
                id="btn-mode-rgb" 
                class="legend-mode-btn ${this.currentMode === 'rgb' ? 'active' : ''}" 
                data-mode="rgb"
                title="View True-Color Sentinel-2 Optical Satellite Imagery"
              >
                <i class="fa-solid fa-satellite"></i>
                <span>True Color</span>
              </button>
            </div>
          </div>

          <!-- Opacity Slider -->
          <div class="legend-opacity-box">
            <div class="opacity-header-row">
              <span id="opacity-label-text">${this.currentMode === 'rgb' ? 'Satellite Opacity' : 'Overlay Opacity'}</span>
              <span id="opacity-val-badge" class="opacity-badge">${this.currentOpacity}%</span>
            </div>
            <input
              type="range"
              id="ndvi-opacity-slider"
              class="legend-opacity-slider"
              min="0"
              max="100"
              value="${this.currentOpacity}"
              title="Adjust layer opacity"
            />
          </div>

          <!-- Mode A: NDVI Content Pane -->
          <div id="legend-ndvi-content" style="display: ${this.currentMode === 'ndvi' ? 'block' : 'none'};">
            <!-- Continuous Gradient Ramp -->
            <div class="legend-ramp-bar" title="NDVI Spectral Ramp: -1.0 to +1.0"></div>

            <!-- 4 Discrete Classification Tiers -->
            <div class="legend-tiers-list">
              <div class="legend-tier-row">
                <div class="legend-tier-left">
                  <span class="tier-swatch dense" style="background-color: #1a9850;"></span>
                  <span>Dense Canopy / Forest</span>
                </div>
                <span class="tier-range">&ge; 0.60</span>
              </div>

              <div class="legend-tier-row">
                <div class="legend-tier-left">
                  <span class="tier-swatch moderate" style="background-color: #66bd63;"></span>
                  <span>Moderate Vegetation</span>
                </div>
                <span class="tier-range">0.40 &ndash; 0.60</span>
              </div>

              <div class="legend-tier-row">
                <div class="legend-tier-left">
                  <span class="tier-swatch sparse" style="background-color: #fdae61;"></span>
                  <span>Sparse Vegetation / Scrub</span>
                </div>
                <span class="tier-range">0.20 &ndash; 0.40</span>
              </div>

              <div class="legend-tier-row">
                <div class="legend-tier-left">
                  <span class="tier-swatch bare" style="background-color: #d73027;"></span>
                  <span>Non-Vegetated / Built-up / Water</span>
                </div>
                <span class="tier-range">&lt; 0.20</span>
              </div>
            </div>
          </div>

          <!-- Mode B: True-Color RGB Content Pane -->
          <div id="legend-rgb-content" style="display: ${this.currentMode === 'rgb' ? 'block' : 'none'};">
            <div class="legend-rgb-card">
              <div class="rgb-card-title">
                <i class="fa-solid fa-camera"></i>
                <span>Natural Color Composite</span>
              </div>
              <p class="rgb-card-description">
                10m ground optical composite rendered from Sentinel-2 L2A Surface Reflectance:
                <strong>Red (B4)</strong>, <strong>Green (B3)</strong>, and <strong>Blue (B2)</strong>.
              </p>
              <div class="rgb-card-tags">
                <span class="rgb-tag"><i class="fa-solid fa-shield-halved"></i> SCL Cloud-Masked</span>
                <span class="rgb-tag"><i class="fa-solid fa-crop"></i> Clipped to AOI</span>
              </div>
            </div>
          </div>
        </div>

        <div class="legend-card-footer">
          ESA COPERNICUS SENTINEL-2 L2A / GOOGLE EARTH ENGINE
        </div>
      </div>
    `;

    this.bindEvents();
  }

  /**
   * Binds slider change, visibility toggle, and mode switcher listeners.
   */
  bindEvents() {
    const opacitySlider = document.getElementById("ndvi-opacity-slider");
    const opacityBadge = document.getElementById("opacity-val-badge");
    const visibilityBtn = document.getElementById("btn-toggle-layer-visibility");
    const visibilityIcon = document.getElementById("layer-visibility-icon");
    const btnNdvi = document.getElementById("btn-mode-ndvi");
    const btnRgb = document.getElementById("btn-mode-rgb");

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

    if (btnNdvi && btnRgb) {
      btnNdvi.addEventListener("click", () => {
        this.setMode("ndvi");
      });
      btnRgb.addEventListener("click", () => {
        this.setMode("rgb");
      });
    }
  }

  /**
   * Sets the active display mode ("ndvi" | "rgb") and updates UI.
   * @param {'ndvi' | 'rgb'} mode
   */
  setMode(mode) {
    if (mode !== "ndvi" && mode !== "rgb") return;
    this.currentMode = mode;

    const btnNdvi = document.getElementById("btn-mode-ndvi");
    const btnRgb = document.getElementById("btn-mode-rgb");
    const ndviContent = document.getElementById("legend-ndvi-content");
    const rgbContent = document.getElementById("legend-rgb-content");
    const opacityLabel = document.getElementById("opacity-label-text");

    if (btnNdvi && btnRgb) {
      if (mode === "ndvi") {
        btnNdvi.classList.add("active");
        btnRgb.classList.remove("active");
      } else {
        btnRgb.classList.add("active");
        btnNdvi.classList.remove("active");
      }
    }

    if (ndviContent) ndviContent.style.display = mode === "ndvi" ? "block" : "none";
    if (rgbContent) rgbContent.style.display = mode === "rgb" ? "block" : "none";
    if (opacityLabel) opacityLabel.textContent = mode === "rgb" ? "Satellite Opacity" : "Overlay Opacity";

    if (this.onModeChange && typeof this.onModeChange === "function") {
      this.onModeChange(mode);
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
