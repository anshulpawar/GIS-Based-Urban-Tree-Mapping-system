/**
 * @file legend.js
 * @description Renders the Global Nature Watch styled NDVI vegetation density scale
 * and Recent Satellite Capture preview controls inside the left panel's LEGEND tab.
 * Includes segmented mode switcher (NDVI Heatmap vs. Current Image), layer opacity slider,
 * 4 discrete classification tiers, optical satellite snapshot preview with metadata,
 * and high-resolution lightbox expansion.
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
    this.currentMode = "ndvi"; // "ndvi" | "preview"

    this.previewData = null; // { thumbUrl, acquisitionDate, satellite, areaName }
  }

  /**
   * Updates satellite capture preview data from an analysis run.
   * @param {Object} data - { thumbUrl, acquisitionDate, satellite, areaName }
   */
  setSatellitePreview(data) {
    this.previewData = data || null;
    if (this.currentMode === "preview") {
      this.renderPreviewPane();
    }
  }

  /**
   * Clears active satellite preview.
   */
  clearPreview() {
    this.previewData = null;
    if (this.currentMode === "preview") {
      this.renderPreviewPane();
    }
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
          <button id="btn-toggle-layer-visibility" class="btn-icon-subtle" title="Toggle layer visibility on map">
            <i id="layer-visibility-icon" class="fa-solid fa-eye"></i>
          </button>
        </div>

        <div class="legend-card-body">
          <!-- Segmented Mode Switcher: NDVI Heatmap vs. Current Image -->
          <div class="legend-mode-switcher-container">
            <div class="legend-mode-switcher">
              <button 
                id="btn-mode-ndvi" 
                class="legend-mode-btn ${this.currentMode === 'ndvi' ? 'active' : ''}" 
                data-mode="ndvi"
                title="View 4-Tier NDVI Vegetation Canopy Heatmap & Scale"
              >
                <i class="fa-solid fa-leaf"></i>
                <span>NDVI Heatmap</span>
              </button>
              <button 
                id="btn-mode-preview" 
                class="legend-mode-btn ${this.currentMode === 'preview' ? 'active' : ''}" 
                data-mode="preview"
                title="View High-Clarity Optical Satellite Capture"
              >
                <i class="fa-solid fa-image"></i>
                <span>Current Image</span>
              </button>
            </div>
          </div>

          <!-- Mode A: NDVI Content Pane -->
          <div id="legend-ndvi-content" style="display: ${this.currentMode === 'ndvi' ? 'block' : 'none'};">
            <!-- Opacity Slider -->
            <div id="legend-opacity-box" class="legend-opacity-box">
              <div class="opacity-header-row">
                <span>Overlay Opacity</span>
                <span id="opacity-val-badge" class="opacity-badge">${this.currentOpacity}%</span>
              </div>
              <input
                type="range"
                id="ndvi-opacity-slider"
                class="legend-opacity-slider"
                min="0"
                max="100"
                value="${this.currentOpacity}"
                title="Adjust NDVI overlay opacity"
              />
            </div>

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

          <!-- Mode B: Current Image (Recent Satellite Capture Preview Card) -->
          <div id="legend-preview-content" style="display: ${this.currentMode === 'preview' ? 'block' : 'none'};">
            <!-- Dynamically populated via renderPreviewPane() -->
          </div>
        </div>

        <div class="legend-card-footer">
          ESA COPERNICUS SENTINEL-2 L2A / GOOGLE EARTH ENGINE
        </div>
      </div>
    `;

    this.renderPreviewPane();
    this.bindEvents();
  }

  /**
   * Renders the Recent Satellite Capture Preview Card inside #legend-preview-content.
   */
  renderPreviewPane() {
    const previewContainer = document.getElementById("legend-preview-content");
    if (!previewContainer) return;

    if (!this.previewData || !this.previewData.thumbUrl) {
      // Empty state: prompt to analyze an AOI
      previewContainer.innerHTML = `
        <div class="preview-empty-state">
          <div class="preview-empty-icon">
            <i class="fa-solid fa-satellite"></i>
          </div>
          <div class="preview-empty-title">No Satellite Capture Ready</div>
          <p class="preview-empty-desc">
            Draw an Area of Interest on the map and click <strong>Analyze AOI Coverage</strong> to generate the optical satellite capture snapshot.
          </p>
        </div>
      `;
      return;
    }

    const { thumbUrl, acquisitionDate, satellite, areaName } = this.previewData;

    previewContainer.innerHTML = `
      <div class="satellite-preview-card">
        <div class="preview-card-header">
          <span class="preview-card-title">RECENT SATELLITE CAPTURE</span>
          <span class="preview-date-badge" title="Optical image acquisition date">
            <i class="fa-regular fa-calendar-check"></i> ${acquisitionDate || "Recent"}
          </span>
        </div>

        <!-- High-Clarity Image Frame with Loading Skeleton -->
        <div id="preview-image-wrapper" class="preview-image-wrapper">
          <div class="preview-spinner" id="preview-spinner">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Loading 640px Capture...</span>
          </div>
          <img 
            id="preview-img-element"
            class="preview-img" 
            src="${thumbUrl}" 
            alt="Sentinel-2 Optical Satellite Capture (${areaName || 'AOI'})"
            title="Click to view full-resolution snapshot"
          />
          <button id="btn-preview-expand" class="preview-expand-btn" title="View Fullscreen">
            <i class="fa-solid fa-expand"></i>
          </button>
        </div>

        <!-- Sensor & Composition Metadata Grid -->
        <div class="preview-meta-grid">
          <div class="preview-meta-cell">
            <span class="meta-label">Mission</span>
            <span class="meta-value highlight-cyan">${satellite || "Sentinel-2 L2A"}</span>
          </div>
          <div class="preview-meta-cell">
            <span class="meta-label">Ground Resolution</span>
            <span class="meta-value">10m Ground Cells</span>
          </div>
          <div class="preview-meta-cell">
            <span class="meta-label">Bands</span>
            <span class="meta-value">True-Color (B4, B3, B2)</span>
          </div>
          <div class="preview-meta-cell">
            <span class="meta-label">Screening</span>
            <span class="meta-value highlight-green"><i class="fa-solid fa-shield-halved"></i> SCL Cloud Mask</span>
          </div>
        </div>
      </div>
    `;

    // Hook up image load listener to hide loading spinner
    const imgEl = document.getElementById("preview-img-element");
    const spinnerEl = document.getElementById("preview-spinner");
    if (imgEl && spinnerEl) {
      if (imgEl.complete) {
        spinnerEl.style.display = "none";
      } else {
        imgEl.addEventListener("load", () => {
          spinnerEl.style.display = "none";
        });
        imgEl.addEventListener("error", () => {
          spinnerEl.innerHTML = `<span style="color:var(--accent-rose);font-size:11px;">Failed to load satellite thumbnail</span>`;
        });
      }
    }

    // Fullscreen lightbox handler
    const btnExpand = document.getElementById("btn-preview-expand");
    if (btnExpand && imgEl) {
      btnExpand.addEventListener("click", () => this.openLightbox(thumbUrl, acquisitionDate, areaName));
      imgEl.addEventListener("click", () => this.openLightbox(thumbUrl, acquisitionDate, areaName));
    }
  }

  /**
   * Opens a fullscreen lightbox preview of the static satellite capture.
   */
  openLightbox(url, date, name) {
    let modal = document.getElementById("satellite-preview-lightbox");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "satellite-preview-lightbox";
      modal.className = "preview-lightbox-overlay";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="preview-lightbox-content">
        <div class="lightbox-header">
          <div class="lightbox-title">
            <i class="fa-solid fa-satellite"></i>
            <span>${name || "Study Area"} • Sentinel-2 L2A Optical Capture (${date || ""})</span>
          </div>
          <button id="btn-close-lightbox" class="lightbox-close-btn" title="Close preview">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="lightbox-image-box">
          <img src="${url}" alt="Sentinel-2 High Resolution Capture" class="lightbox-img" />
        </div>
      </div>
    `;

    modal.style.display = "flex";

    const closeBtn = document.getElementById("btn-close-lightbox");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        modal.style.display = "none";
      });
    }

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.style.display = "none";
      }
    });
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
    const btnPreview = document.getElementById("btn-mode-preview");

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

    if (btnNdvi && btnPreview) {
      btnNdvi.addEventListener("click", () => {
        this.setMode("ndvi");
      });
      btnPreview.addEventListener("click", () => {
        this.setMode("preview");
      });
    }
  }

  /**
   * Sets the active display mode ("ndvi" | "preview") inside the sidebar.
   * Does NOT alter the main map canvas!
   * @param {'ndvi' | 'preview'} mode
   */
  setMode(mode) {
    if (mode !== "ndvi" && mode !== "preview") return;
    this.currentMode = mode;

    const btnNdvi = document.getElementById("btn-mode-ndvi");
    const btnPreview = document.getElementById("btn-mode-preview");
    const ndviContent = document.getElementById("legend-ndvi-content");
    const previewContent = document.getElementById("legend-preview-content");

    if (btnNdvi && btnPreview) {
      if (mode === "ndvi") {
        btnNdvi.classList.add("active");
        btnPreview.classList.remove("active");
      } else {
        btnPreview.classList.add("active");
        btnNdvi.classList.remove("active");
      }
    }

    if (ndviContent) ndviContent.style.display = mode === "ndvi" ? "block" : "none";
    if (previewContent) {
      previewContent.style.display = mode === "preview" ? "block" : "none";
      if (mode === "preview") {
        this.renderPreviewPane();
      }
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
