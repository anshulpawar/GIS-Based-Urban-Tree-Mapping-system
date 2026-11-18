/**
 * @file legend.js
 * @description Renders the Global Nature Watch styled NDVI vegetation density scale,
 * interactive 4-tier canopy class isolation spotlights, layer opacity controls,
 * and custom-date Sentinel-2 temporal comparison analysis inside the left panel's LEGEND tab.
 */

export class LegendControl {
  /**
   * @param {string} [containerId="tab-content-legend"] - Target DOM element ID
   * @param {Object} [options={}]
   * @param {Function} [options.onOpacityChange] - Callback receiving opacity (0.0 to 1.0)
   * @param {Function} [options.onVisibilityToggle] - Callback receiving boolean isVisible
   * @param {Function} [options.onSpotlightChange] - Callback receiving classKey ('dense'|'moderate'|'sparse'|'deficit'|null)
   * @param {Function} [options.onResetToFull] - Callback to restore full 4-tier heatmap
   * @param {Function} [options.onCompareRequest] - Callback receiving (historicalDate) -> Promise<CompareResponse>
   * @param {Function} [options.onCompareLayerChange] - Callback receiving (mode, tileUrl)
   */
  constructor(containerId = "tab-content-legend", options = {}) {
    this.container = document.getElementById(containerId);
    this.onOpacityChange = options.onOpacityChange || null;
    this.onVisibilityToggle = options.onVisibilityToggle || null;
    this.onSpotlightChange = options.onSpotlightChange || null;
    this.onResetToFull = options.onResetToFull || null;
    this.onCompareRequest = options.onCompareRequest || null;
    this.onCompareLayerChange = options.onCompareLayerChange || null;

    this.currentOpacity = 80;
    this.isVisible = true;
    this.activeSpotlight = null; // null | 'dense' | 'moderate' | 'sparse' | 'deficit'
    this.analysisData = null;
    this.currentGeometry = null;
    this.compareData = null;
    this.activeCompareLayer = "current"; // 'current' | 'historical' | 'delta'
    this.isComparing = false;
  }

  /**
   * Updates analysis data when an AOI calculation completes.
   * @param {Object} data - Analysis response object
   * @param {Object} geometry - GeoJSON geometry
   */
  setAnalysisData(data, geometry) {
    this.analysisData = data || null;
    this.currentGeometry = geometry || null;
    this.updateTierPercentages();
    this.setDefaultCompareDate();

    // Enable compare button if active
    const btnCompare = document.getElementById("btn-run-temporal-compare");
    if (btnCompare) {
      btnCompare.disabled = false;
      btnCompare.title = "Run Sentinel-2 Band Comparison";
    }
  }

  /**
   * Clears analysis and comparison state when an AOI is removed.
   */
  clearAnalysisData() {
    this.analysisData = null;
    this.currentGeometry = null;
    this.compareData = null;
    this.activeSpotlight = null;
    this.activeCompareLayer = "current";
    this._compareCurrentUrl = null;
    this._compareHistUrl = null;
    this._compareChangeUrl = null;

    this.resetSpotlightUI();
    this.resetTierPercentages();

    const resultsContainer = document.getElementById("temporal-results-container");
    if (resultsContainer) {
      resultsContainer.style.display = "none";
      resultsContainer.innerHTML = "";
    }

    const btnCompare = document.getElementById("btn-run-temporal-compare");
    if (btnCompare) {
      btnCompare.disabled = true;
      btnCompare.title = "Draw and analyze an AOI first";
    }
  }

  /**
   * Backward-compatible stub for satellite preview calls.
   */
  setSatellitePreview(_data) {}
  clearPreview() {}

  /**
   * Renders the complete legend, spotlight controls, and temporal comparison module.
   */
  render() {
    if (!this.container) return;

    // Calculate default 1-year ago date for initial input value
    const defaultDate = this.getPastDateString(1);

    this.container.innerHTML = `
      <div class="legend-card-module">
        <div class="legend-card-header">
          <span class="legend-layer-title">SENTINEL-2 L2A (10M NDVI)</span>
          <button id="btn-toggle-layer-visibility" class="btn-icon-subtle" title="Toggle layer visibility on map">
            <i id="layer-visibility-icon" class="fa-solid fa-eye"></i>
          </button>
        </div>

        <div class="legend-card-body" id="legend-ndvi-content">
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

          <!-- Active Spotlight Status Banner -->
          <div id="spotlight-active-banner" class="spotlight-banner" style="display: none;">
            <div class="spotlight-banner-info">
              <i class="fa-solid fa-crosshairs"></i>
              <span>Spotlight: <strong id="spotlight-tier-name">Dense Canopy</strong></span>
            </div>
            <button id="btn-reset-spotlight" class="btn-reset-spotlight" title="Restore Full 4-Tier Map">
              <i class="fa-solid fa-rotate-left"></i> Show All
            </button>
          </div>

          <!-- 4 Discrete Classification Tiers (Interactive Spotlight) -->
          <div class="legend-tiers-list" id="legend-tiers-list">
            <div class="legend-tier-row spotlightable" data-tier="dense" title="Click to isolate Dense Canopy on map">
              <div class="legend-tier-left">
                <span class="tier-swatch dense" style="background-color: #1a9850;"></span>
                <span class="tier-label">Dense Canopy / Forest</span>
              </div>
              <div class="legend-tier-right">
                <span class="tier-pct" id="tier-pct-dense">--</span>
                <span class="tier-range">&ge; 0.60</span>
              </div>
            </div>

            <div class="legend-tier-row spotlightable" data-tier="moderate" title="Click to isolate Moderate Vegetation on map">
              <div class="legend-tier-left">
                <span class="tier-swatch moderate" style="background-color: #66bd63;"></span>
                <span class="tier-label">Moderate Vegetation</span>
              </div>
              <div class="legend-tier-right">
                <span class="tier-pct" id="tier-pct-moderate">--</span>
                <span class="tier-range">0.40 &ndash; 0.60</span>
              </div>
            </div>

            <div class="legend-tier-row spotlightable" data-tier="sparse" title="Click to isolate Sparse Vegetation on map">
              <div class="legend-tier-left">
                <span class="tier-swatch sparse" style="background-color: #fdae61;"></span>
                <span class="tier-label">Sparse Vegetation / Scrub</span>
              </div>
              <div class="legend-tier-right">
                <span class="tier-pct" id="tier-pct-sparse">--</span>
                <span class="tier-range">0.20 &ndash; 0.40</span>
              </div>
            </div>

            <div class="legend-tier-row spotlightable" data-tier="deficit" title="Click to isolate Non-Vegetated / Built-up on map">
              <div class="legend-tier-left">
                <span class="tier-swatch bare" style="background-color: #d73027;"></span>
                <span class="tier-label">Non-Vegetated / Built-up</span>
              </div>
              <div class="legend-tier-right">
                <span class="tier-pct" id="tier-pct-deficit">--</span>
                <span class="tier-range">&lt; 0.20</span>
              </div>
            </div>
          </div>
        </div>

        <div class="legend-card-footer">
          ESA COPERNICUS SENTINEL-2 L2A / GOOGLE EARTH ENGINE
        </div>
      </div>

      <!-- Card 2: Sentinel-2 Temporal Comparison Module -->
      <div class="legend-card-module temporal-card-module" id="legend-temporal-module">
        <div class="legend-card-header">
          <div class="temporal-module-title">
            <i class="fa-regular fa-clock"></i>
            <span>TEMPORAL COMPARISON</span>
          </div>
          <span class="temporal-status-pill">Sentinel-2</span>
        </div>

        <div class="legend-card-body">
          <p class="temporal-module-desc">
            Compare current canopy density against historical satellite acquisition.
          </p>

          <div class="temporal-date-selection">
            <label for="input-compare-date" class="temporal-label">Historical Baseline Date</label>
            <div class="temporal-date-row">
              <input 
                type="date" 
                id="input-compare-date" 
                class="temporal-date-input" 
                value="${defaultDate}"
                min="2015-07-01"
                max="${new Date().toISOString().split('T')[0]}"
              />
              <button 
                id="btn-run-temporal-compare" 
                class="btn-run-compare" 
                ${this.analysisData ? "" : "disabled"}
                title="${this.analysisData ? 'Run Sentinel-2 Band Comparison' : 'Draw and analyze an AOI first'}"
              >
                <i class="fa-solid fa-play"></i> Compare
              </button>
            </div>
            <div class="temporal-quick-chips">
              <button type="button" class="temporal-chip" data-years="1">-1 Year</button>
              <button type="button" class="temporal-chip" data-years="5">-5 Years</button>
              <button type="button" class="temporal-chip" data-years="10">-10 Years</button>
            </div>
          </div>

          <!-- Dynamic Results Container -->
          <div id="temporal-results-container" class="temporal-results-container" style="display: none;"></div>
        </div>
      </div>
    `;

    this.bindEvents();
    if (this.analysisData) {
      this.updateTierPercentages();
    }
  }

  /**
   * Binds slider change, visibility toggle, spotlight clicks, and temporal comparison events.
   */
  bindEvents() {
    // Opacity Slider
    const opacitySlider = document.getElementById("ndvi-opacity-slider");
    const opacityBadge = document.getElementById("opacity-val-badge");
    if (opacitySlider && opacityBadge) {
      opacitySlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        this.currentOpacity = val;
        opacityBadge.textContent = `${val}%`;

        if (!this.analysisData || !this.analysisData.ndvi_tile_url || !this.currentGeometry) {
          return;
        }

        if (this.onOpacityChange && typeof this.onOpacityChange === "function") {
          this.onOpacityChange(val / 100.0);
        }
      });
    }

    // Visibility Toggle
    const visibilityBtn = document.getElementById("btn-toggle-layer-visibility");
    const visibilityIcon = document.getElementById("layer-visibility-icon");
    if (visibilityBtn && visibilityIcon) {
      visibilityBtn.addEventListener("click", () => {
        if (!this.analysisData || !this.analysisData.ndvi_tile_url || !this.currentGeometry) {
          return;
        }

        this.isVisible = !this.isVisible;
        visibilityIcon.className = this.isVisible ? "fa-solid fa-eye" : "fa-solid fa-eye-slash";
        visibilityBtn.style.color = this.isVisible ? "var(--text-muted)" : "var(--accent-rose)";

        if (this.onVisibilityToggle && typeof this.onVisibilityToggle === "function") {
          this.onVisibilityToggle(this.isVisible);
        }
      });
    }

    // Spotlight Tier Clicks
    const tierRows = document.querySelectorAll(".legend-tier-row.spotlightable");
    tierRows.forEach((row) => {
      row.addEventListener("click", () => {
        const tierKey = row.dataset.tier;
        this.handleTierSpotlightClick(tierKey);
      });
    });

    // Reset Spotlight Button
    const btnResetSpotlight = document.getElementById("btn-reset-spotlight");
    if (btnResetSpotlight) {
      btnResetSpotlight.addEventListener("click", () => {
        this.handleResetSpotlight();
      });
    }

    // Temporal Comparison Quick Chips (-1 Year, -5 Years, -10 Years)
    const chips = document.querySelectorAll(".temporal-chip");
    const dateInput = document.getElementById("input-compare-date");
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const years = parseInt(chip.dataset.years, 10);
        if (dateInput && !isNaN(years)) {
          dateInput.value = this.getPastDateString(years);
        }
      });
    });

    // Temporal Comparison Action Button
    const btnRunCompare = document.getElementById("btn-run-temporal-compare");
    if (btnRunCompare) {
      btnRunCompare.addEventListener("click", () => {
        this.executeTemporalComparison();
      });
    }
  }

  /**
   * Handles clicking on a tier row to spotlight or reset.
   * @param {string} tierKey
   */
  handleTierSpotlightClick(tierKey) {
    if (!this.analysisData || !this.analysisData.ndvi_tile_url || !this.currentGeometry) {
      return;
    }

    let newlyActive = null;
    if (this.onSpotlightChange && typeof this.onSpotlightChange === "function") {
      newlyActive = this.onSpotlightChange(tierKey);
    } else {
      newlyActive = this.activeSpotlight === tierKey ? null : tierKey;
    }

    this.activeSpotlight = newlyActive;
    this.updateSpotlightUI(newlyActive);
  }

  /**
   * Restores full 4-tier heatmap.
   */
  handleResetSpotlight() {
    this.activeSpotlight = null;
    this.resetSpotlightUI();
    if (!this.analysisData || !this.analysisData.ndvi_tile_url || !this.currentGeometry) {
      return;
    }
    if (this.onResetToFull && typeof this.onResetToFull === "function") {
      this.onResetToFull();
    }
  }

  /**
   * Updates visual highlight state on tier rows and spotlight banner.
   * @param {string|null} activeKey
   */
  updateSpotlightUI(activeKey) {
    const banner = document.getElementById("spotlight-active-banner");
    const tierNameEl = document.getElementById("spotlight-tier-name");
    const tierRows = document.querySelectorAll(".legend-tier-row.spotlightable");

    const tierLabels = {
      dense: "Dense Canopy / Forest",
      moderate: "Moderate Vegetation",
      sparse: "Sparse Vegetation / Scrub",
      deficit: "Non-Vegetated / Built-up"
    };

    tierRows.forEach((row) => {
      if (row.dataset.tier === activeKey) {
        row.classList.add("active-spotlight");
      } else {
        row.classList.remove("active-spotlight");
      }
    });

    if (activeKey && banner && tierNameEl) {
      tierNameEl.textContent = tierLabels[activeKey] || activeKey;
      banner.style.display = "flex";
    } else if (banner) {
      banner.style.display = "none";
    }
  }

  /**
   * Clears spotlight visual styling.
   */
  resetSpotlightUI() {
    const banner = document.getElementById("spotlight-active-banner");
    const tierRows = document.querySelectorAll(".legend-tier-row.spotlightable");

    tierRows.forEach((row) => row.classList.remove("active-spotlight"));
    if (banner) banner.style.display = "none";
  }

  /**
   * Executes custom-date temporal comparison against Google Earth Engine backend.
   */
  async executeTemporalComparison() {
    if (this.isComparing) return;

    if (!this.analysisData || !this.analysisData.ndvi_tile_url || !this.currentGeometry) {
      alert("Please draw and analyze an Area of Interest first.");
      return;
    }

    const dateInput = document.getElementById("input-compare-date");
    const btnCompare = document.getElementById("btn-run-temporal-compare");
    const resultsContainer = document.getElementById("temporal-results-container");

    const historicalDate = dateInput ? dateInput.value : this.getPastDateString(1);

    if (!historicalDate) {
      alert("Please select a historical date to compare against.");
      return;
    }

    if (!this.onCompareRequest || typeof this.onCompareRequest !== "function") {
      console.warn("No onCompareRequest callback registered.");
      return;
    }

    this.isComparing = true;
    if (btnCompare) {
      btnCompare.disabled = true;
      btnCompare.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Analyzing...</span>';
    }

    if (resultsContainer) {
      resultsContainer.style.display = "block";
      resultsContainer.innerHTML = `
        <div class="temporal-loading-state">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span>Retrieving Sentinel-2 baseline for ${historicalDate}...</span>
        </div>
      `;
    }

    try {
      const response = await this.onCompareRequest(historicalDate);
      this.compareData = response;
      this.renderComparisonResults(response);
    } catch (err) {
      console.error("Temporal comparison error:", err);
      if (resultsContainer) {
        resultsContainer.innerHTML = `
          <div class="temporal-error-state">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>${err.message || "Failed to compute temporal comparison."}</span>
          </div>
        `;
      }
    } finally {
      this.isComparing = false;
      if (btnCompare) {
        btnCompare.disabled = false;
        btnCompare.innerHTML = '<i class="fa-solid fa-play"></i><span>Compare</span>';
      }
    }
  }

  /**
   * Renders the comparison results card inside the temporal module.
   * @param {Object} res - CompareResponse
   */
  renderComparisonResults(res) {
    const resultsContainer = document.getElementById("temporal-results-container");
    if (!resultsContainer || !res) return;

    const meanDelta = typeof res.mean_delta_ndvi === "number" ? res.mean_delta_ndvi : 0.0;
    const deltaFormatted = (meanDelta >= 0 ? "+" : "") + meanDelta.toFixed(3);
    const deltaClass = meanDelta > 0.02 ? "delta-pos" : meanDelta < -0.02 ? "delta-neg" : "delta-neutral";

    const gainPct = typeof res.gain_pct === "number" ? res.gain_pct.toFixed(1) : "0.0";
    const stablePct = typeof res.stable_pct === "number" ? res.stable_pct.toFixed(1) : "0.0";
    const lossPct = typeof res.loss_pct === "number" ? res.loss_pct.toFixed(1) : "0.0";

    const histDate = res.historical_acquisition_date || res.historical_date || "Historical";
    const currDate = res.current_acquisition_date || res.current_date || "Current";

    resultsContainer.style.display = "block";
    resultsContainer.innerHTML = `
      <div class="delta-result-card">
        <div class="delta-result-header">
          <div class="delta-title-col">
            <span class="delta-sublabel">Canopy Change Summary</span>
            <span class="delta-date-range">${histDate} &rarr; ${currDate}</span>
          </div>
          <span class="delta-badge ${deltaClass}">
            <i class="fa-solid ${meanDelta >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i>
            ${deltaFormatted} &Delta;NDVI
          </span>
        </div>

        <!-- 3-Segment Gain / Stable / Loss Distribution Bar -->
        <div class="delta-bar-container" title="Green Cover Distribution: Gain (Green), Stable (Muted), Loss (Red)">
          <div class="delta-bar-fill gain" style="width: ${gainPct}%;"></div>
          <div class="delta-bar-fill stable" style="width: ${stablePct}%;"></div>
          <div class="delta-bar-fill loss" style="width: ${lossPct}%;"></div>
        </div>

        <div class="delta-stats-row">
          <span class="stat-gain"><i class="fa-solid fa-circle" style="color: #22c55e;"></i> ${gainPct}% Gain</span>
          <span class="stat-stable"><i class="fa-solid fa-circle" style="color: #64748b;"></i> ${stablePct}% Stable</span>
          <span class="stat-loss"><i class="fa-solid fa-circle" style="color: #ef4444;"></i> ${lossPct}% Loss</span>
        </div>

        <!-- Map Layer Switcher -->
        <div class="compare-layer-switcher">
          <button 
            type="button" 
            class="btn-compare-layer ${this.activeCompareLayer === 'current' ? 'active' : ''}" 
            id="btn-layer-current"
            data-mode="current"
            title="Display current NDVI canopy map"
          >
            Current
          </button>
          <button 
            type="button" 
            class="btn-compare-layer ${this.activeCompareLayer === 'historical' ? 'active' : ''}" 
            id="btn-layer-historical"
            data-mode="historical"
            title="Display historical baseline NDVI map"
          >
            Historical
          </button>
          <button 
            type="button" 
            class="btn-compare-layer ${this.activeCompareLayer === 'delta' ? 'active' : ''}" 
            id="btn-layer-delta"
            data-mode="delta"
            title="Display diverging Delta NDVI change map (Green=Gain, Red=Loss)"
          >
            &Delta; Map
          </button>
        </div>
      </div>
    `;

    // Store resolved URLs as instance state for layer switcher
    this._compareCurrentUrl = res.current_tile_url || (this.analysisData && this.analysisData.ndvi_tile_url) || null;
    this._compareHistUrl = res.historical_tile_url || null;
    this._compareChangeUrl = res.change_tile_url || res.delta_tile_url || null;

    // Bind layer switcher button events
    const btnCurr = document.getElementById("btn-layer-current");
    const btnHist = document.getElementById("btn-layer-historical");
    const btnDelta = document.getElementById("btn-layer-delta");

    const handleSwitch = (mode) => {
      if (!this.analysisData || !this.analysisData.ndvi_tile_url || !this.currentGeometry) {
        return;
      }
      this.activeCompareLayer = mode;
      [btnCurr, btnHist, btnDelta].forEach((btn) => {
        if (btn) btn.classList.toggle("active", btn.dataset.mode === mode);
      });

      let tileUrl = null;
      if (mode === "current") tileUrl = this._compareCurrentUrl;
      else if (mode === "historical") tileUrl = this._compareHistUrl;
      else if (mode === "delta") tileUrl = this._compareChangeUrl;

      if (this.onCompareLayerChange && typeof this.onCompareLayerChange === "function") {
        this.onCompareLayerChange(mode, tileUrl);
      }
    };

    if (btnCurr) {
      btnCurr.addEventListener("click", () => handleSwitch("current"));
    }

    if (btnHist) {
      btnHist.addEventListener("click", () => handleSwitch("historical"));
    }

    if (btnDelta) {
      btnDelta.addEventListener("click", () => handleSwitch("delta"));
    }

    // Auto-activate Δ Map immediately after results load
    handleSwitch("delta");
  }

  /**
   * Updates tier percentage labels if breakdown is present in analysisData.
   */
  updateTierPercentages() {
    if (!this.analysisData) return;

    const stats = this.analysisData.stats || {};
    const breakdown = this.analysisData.vegetation_breakdown || {};

    const denseVal = stats.dense_pct ?? breakdown.dense_canopy_pct ?? null;
    const modVal = stats.moderate_pct ?? breakdown.moderate_cover_pct ?? null;
    const sparseVal = stats.sparse_pct ?? null;
    const deficitVal = stats.non_veg_pct ?? breakdown.sparse_or_built_pct ?? null;

    const elDense = document.getElementById("tier-pct-dense");
    const elMod = document.getElementById("tier-pct-moderate");
    const elSparse = document.getElementById("tier-pct-sparse");
    const elDeficit = document.getElementById("tier-pct-deficit");

    if (elDense && denseVal !== null) elDense.textContent = `${parseFloat(denseVal).toFixed(1)}%`;
    if (elMod && modVal !== null) elMod.textContent = `${parseFloat(modVal).toFixed(1)}%`;
    if (elSparse && sparseVal !== null) elSparse.textContent = `${parseFloat(sparseVal).toFixed(1)}%`;
    if (elDeficit && deficitVal !== null) elDeficit.textContent = `${parseFloat(deficitVal).toFixed(1)}%`;
  }

  /**
   * Resets tier percentage labels to '--'.
   */
  resetTierPercentages() {
    ["tier-pct-dense", "tier-pct-moderate", "tier-pct-sparse", "tier-pct-deficit"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = "--";
    });
  }

  /**
   * Sets default historical date in the date input.
   */
  setDefaultCompareDate() {
    const input = document.getElementById("input-compare-date");
    if (!input) return;

    let baseDate = new Date();
    if (this.analysisData && this.analysisData.acquisition_date) {
      const parsed = new Date(this.analysisData.acquisition_date.substring(0, 10));
      if (!isNaN(parsed.getTime())) {
        baseDate = parsed;
      }
    }

    baseDate.setFullYear(baseDate.getFullYear() - 1);
    const dateStr = baseDate.toISOString().split("T")[0];
    input.value = dateStr < "2015-07-01" ? "2015-07-01" : dateStr;
  }

  /**
   * Helper returning YYYY-MM-DD string N years in the past, clamped to Sentinel-2 archive minimum (2015-07-01).
   * @param {number} years
   * @returns {string}
   */
  getPastDateString(years = 1) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    const dateStr = d.toISOString().split("T")[0];
    return dateStr < "2015-07-01" ? "2015-07-01" : dateStr;
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
