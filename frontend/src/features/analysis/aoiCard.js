/**
 * @file aoiCard.js
 * @description Renders the interactive AOI Pre-Analysis Diagnostics Card in the left ANALYSIS panel.
 * Displays live geodesic measurements (area in ha/km², perimeter, centroid, S2 10m pixels),
 * validation status badges, guardrail alerts (self-intersections, size thresholds),
 * editable study area name, and primary analysis trigger.
 */

export class AoiCard {
  /**
   * @param {string} [containerId="aoi-card-container"]
   * @param {Object} [options={}]
   * @param {Function} [options.onAnalyzeClick]
   * @param {Function} [options.onClearClick]
   * @param {Function} [options.onNameChange]
   */
  constructor(containerId = "aoi-card-container", options = {}) {
    this.container = document.getElementById(containerId);
    this.onAnalyzeClick = options.onAnalyzeClick || null;
    this.onClearClick = options.onClearClick || null;
    this.onNameChange = options.onNameChange || null;

    this.currentData = null;
    this.isEditingName = false;
  }

  /**
   * Updates and re-renders the AOI diagnostics card.
   * @param {Object} data - { geometry, validation, metrics, studyAreaName, isAnalyzing }
   */
  render(data) {
    if (!this.container) return;

    if (!data || !data.geometry || !data.validation) {
      this.container.style.display = "none";
      this.container.innerHTML = "";
      this.currentData = null;
      return;
    }

    this.currentData = data;
    this.container.style.display = "block";

    const { validation, metrics, studyAreaName, isAnalyzing } = data;
    const isValid = Boolean(validation && validation.valid);
    const m = metrics || {};

    // Generate validation badge HTML
    let badgeHtml = "";
    if (isValid) {
      badgeHtml = `<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> READY FOR ANALYSIS</span>`;
    } else if (validation.status === "SELF_INTERSECTING") {
      badgeHtml = `<span class="badge badge-danger"><i class="fa-solid fa-circle-xmark"></i> SELF-INTERSECTING</span>`;
    } else if (validation.status === "TOO_SMALL") {
      badgeHtml = `<span class="badge badge-warning"><i class="fa-solid fa-triangle-exclamation"></i> TOO SMALL (&lt; 0.01 km²)</span>`;
    } else if (validation.status === "TOO_LARGE") {
      badgeHtml = `<span class="badge badge-danger"><i class="fa-solid fa-circle-xmark"></i> TOO LARGE (&gt; 250 km²)</span>`;
    } else {
      badgeHtml = `<span class="badge badge-warning"><i class="fa-solid fa-triangle-exclamation"></i> ${validation.status}</span>`;
    }

    // Generate guardrail warning banner
    const alertHtml = !isValid && validation.error
      ? `
        <div class="guardrail-alert ${validation.status === 'TOO_SMALL' ? 'alert-warning' : 'alert-danger'}">
          <i class="fa-solid ${validation.status === 'TOO_SMALL' ? 'fa-triangle-exclamation' : 'fa-circle-xmark'}"></i>
          <div>
            <strong>Guardrail Block:</strong> ${validation.error}
          </div>
        </div>
      `
      : "";

    this.container.innerHTML = `
      <div id="aoi-telemetry-card" class="aoi-diagnostics-card glass-panel">
        <!-- Card Header: Title & Validation Badge -->
        <div class="aoi-card-header">
          <div class="aoi-title-row">
            <span class="aoi-sublabel">ACTIVE AREA OF INTEREST</span>
            <div class="aoi-name-container">
              <input 
                type="text" 
                id="aoi-name-input" 
                class="aoi-title-input" 
                value="${this.escapeHtml(studyAreaName || 'Custom Study Area')}" 
                title="Click to rename study area"
              />
              <i class="fa-solid fa-pen aoi-edit-icon"></i>
            </div>
          </div>
          <div class="aoi-badge-slot">
            ${badgeHtml}
          </div>
        </div>

        ${alertHtml}

        <!-- 2x2 Geodesic Metrics Grid -->
        <div class="geodesic-grid">
          <div class="geodesic-cell">
            <div class="cell-label"><i class="fa-solid fa-vector-square"></i> Surface Area</div>
            <div class="cell-value highlight-green">${m.formattedAreaHa || "--"}</div>
            <div class="cell-subtext">${m.formattedAreaKm2 || ""} (${m.formattedAreaSqM || ""})</div>
          </div>

          <div class="geodesic-cell">
            <div class="cell-label"><i class="fa-solid fa-ruler-combined"></i> Perimeter</div>
            <div class="cell-value">${m.formattedPerimeter || "--"}</div>
            <div class="cell-subtext">${m.vertexCount || 0} boundary vertices</div>
          </div>

          <div class="geodesic-cell">
            <div class="cell-label"><i class="fa-solid fa-crosshairs"></i> AOI Centroid</div>
            <div class="cell-value centroid-text">${m.formattedCentroid || "--"}</div>
            <div class="cell-subtext">WGS-84 Ellipsoidal Lat/Lon</div>
          </div>

          <div class="geodesic-cell">
            <div class="cell-label"><i class="fa-solid fa-border-all"></i> Est. S2 Pixels</div>
            <div class="cell-value highlight-cyan">${m.formattedPixels || "--"}</div>
            <div class="cell-subtext">10m × 10m Ground Cells</div>
          </div>
        </div>

        <!-- Action Row -->
        <div class="aoi-actions-row">
          <button 
            id="btn-aoi-analyze" 
            class="btn-primary-action btn-aoi-analyze-cta" 
            ${!isValid || isAnalyzing ? "disabled" : ""}
          >
            ${
              isAnalyzing
                ? '<i class="fa-solid fa-spinner fa-spin"></i><span>Analyzing Sentinel-2...</span>'
                : '<i class="fa-solid fa-satellite-dish"></i><span>Analyze AOI Coverage</span>'
            }
          </button>
          <button id="btn-aoi-clear" class="btn-secondary-action compact" title="Clear boundary">
            <i class="fa-solid fa-trash-can"></i>
            <span>Clear</span>
          </button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  /**
   * Sets up internal button and input listeners.
   */
  bindEvents() {
    const btnAnalyze = document.getElementById("btn-aoi-analyze");
    const btnClear = document.getElementById("btn-aoi-clear");
    const nameInput = document.getElementById("aoi-name-input");

    if (btnAnalyze) {
      btnAnalyze.addEventListener("click", () => {
        if (this.currentData && this.currentData.validation && this.currentData.validation.valid && this.onAnalyzeClick) {
          this.onAnalyzeClick(this.currentData.geometry, {
            validation: this.currentData.validation,
            studyAreaName: nameInput ? nameInput.value.trim() : this.currentData.studyAreaName
          });
        }
      });
    }

    if (btnClear) {
      btnClear.addEventListener("click", () => {
        if (this.onClearClick) {
          this.onClearClick();
        }
      });
    }

    if (nameInput) {
      nameInput.addEventListener("change", () => {
        const newName = nameInput.value.trim();
        if (newName && this.onNameChange) {
          this.onNameChange(newName);
        }
      });

      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          nameInput.blur();
        }
      });
    }
  }

  /**
   * Utility to prevent XSS in text inputs.
   */
  escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Shows or hides the container.
   */
  setVisible(visible) {
    if (this.container) {
      this.container.style.display = visible ? "block" : "none";
    }
  }
}

