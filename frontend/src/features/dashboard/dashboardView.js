/**
 * @file dashboardView.js
 * @description Manages the Analytics & Spatial History Dashboard view,
 * fetching live PostGIS analysis records from Supabase via FastAPI,
 * calculating summary KPI metrics, rendering the spatial history table,
 * and orchestrating 1-click map recall and deletion.
 */

import { fetchSavedAnalyses, deleteAnalysisById } from "../../api/apiClient.js";

export class DashboardView {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.containerId="history-table-container"] - Target table container ID
   * @param {Function} [options.onSelectRun] - Callback when user clicks a past run to recall on map
   * @param {Function} [options.onToast] - Optional callback to show search/feedback toast
   */
  constructor({ containerId = "history-table-container", onSelectRun = null, onToast = null } = {}) {
    this.containerEl = document.getElementById(containerId);
    this.onSelectRun = onSelectRun;
    this.onToast = onToast;
    this.analyses = [];
    this.isLoading = false;

    this.init();
  }

  /**
   * Initializes header buttons and binds listeners.
   */
  init() {
    const btnRefresh = document.getElementById("btn-dashboard-refresh");
    if (btnRefresh) {
      btnRefresh.addEventListener("click", () => {
        this.loadAnalyses();
      });
    }
  }

  /**
   * Fetches saved analyses from the backend and updates the UI.
   */
  async loadAnalyses() {
    if (this.isLoading) return;
    this.isLoading = true;

    // Show loading spinner
    if (this.containerEl) {
      this.containerEl.innerHTML = `
        <div class="dashboard-loading-state">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span>Loading saved analyses from Supabase PostGIS...</span>
        </div>
      `;
    }

    const btnRefresh = document.getElementById("btn-dashboard-refresh");
    if (btnRefresh) {
      btnRefresh.classList.add("loading");
      btnRefresh.disabled = true;
    }

    try {
      const records = await fetchSavedAnalyses(50);
      this.analyses = Array.isArray(records) ? records : [];
      this.updateKPICards(this.analyses);
      this.renderTable(this.analyses);
    } catch (err) {
      console.error("Dashboard: Failed to load saved analyses:", err);
      if (this.containerEl) {
        this.containerEl.innerHTML = `
          <div class="dashboard-error-state">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <p>Failed to load saved analyses from database: ${err.message}</p>
            <button id="btn-dashboard-retry" class="btn-secondary-action compact">
              <i class="fa-solid fa-rotate"></i>
              <span>Retry</span>
            </button>
          </div>
        `;
        const btnRetry = document.getElementById("btn-dashboard-retry");
        if (btnRetry) {
          btnRetry.addEventListener("click", () => this.loadAnalyses());
        }
      }
    } finally {
      this.isLoading = false;
      if (btnRefresh) {
        btnRefresh.classList.remove("loading");
        btnRefresh.disabled = false;
      }
    }
  }

  /**
   * Calculates and updates the 4 KPI summary cards.
   * @param {Array<Object>} runs - List of saved analysis records
   */
  updateKPICards(runs) {
    const totalRunsEl = document.getElementById("kpi-total-runs");
    const totalAreaEl = document.getElementById("kpi-total-area");
    const avgGreenEl = document.getElementById("kpi-avg-green");
    const priorityZoneEl = document.getElementById("kpi-priority-zone");

    if (!runs || runs.length === 0) {
      if (totalRunsEl) totalRunsEl.textContent = "0";
      if (totalAreaEl) totalAreaEl.textContent = "0 ha";
      if (avgGreenEl) avgGreenEl.textContent = "--%";
      if (priorityZoneEl) priorityZoneEl.textContent = "--";
      return;
    }

    const count = runs.length;
    const totalArea = runs.reduce((acc, r) => acc + (Number(r.total_area_hectares) || 0), 0);
    const totalGreen = runs.reduce((acc, r) => acc + (Number(r.green_cover_percentage) || 0), 0);
    const avgGreen = totalGreen / count;

    // Identify Priority Deficit Zone (lowest green cover percentage)
    let minCoverRun = runs[0];
    for (let i = 1; i < runs.length; i++) {
      const currentCover = Number(runs[i].green_cover_percentage) || 0;
      const minCover = Number(minCoverRun.green_cover_percentage) || 0;
      if (currentCover < minCover) {
        minCoverRun = runs[i];
      }
    }

    const minCoverVal = Number(minCoverRun.green_cover_percentage) || 0;
    const minZoneName = minCoverRun.area_name || "Zone";

    if (totalRunsEl) totalRunsEl.textContent = count.toString();
    if (totalAreaEl) totalAreaEl.textContent = `${totalArea.toFixed(1)} ha`;
    if (avgGreenEl) avgGreenEl.textContent = `${avgGreen.toFixed(1)}%`;
    if (priorityZoneEl) {
      priorityZoneEl.textContent = `${minZoneName} (${minCoverVal.toFixed(1)}%)`;
      priorityZoneEl.title = `Priority Deficit Zone: ${minZoneName} with ${minCoverVal.toFixed(1)}% canopy cover`;
    }
  }

  /**
   * Renders the interactive data table inside the dashboard.
   * @param {Array<Object>} runs - List of saved analysis records
   */
  renderTable(runs) {
    if (!this.containerEl) return;

    if (!runs || runs.length === 0) {
      this.containerEl.innerHTML = `
        <div class="dashboard-empty-state">
          <i class="fa-solid fa-layer-group"></i>
          <p>No saved analyses recorded yet in Supabase PostGIS.</p>
          <span class="empty-sub">
            Draw an Area of Interest on the map and click <strong>Analyze Area</strong> to run and record your first analysis.
          </span>
        </div>
      `;
      return;
    }

    const rowsHtml = runs
      .map((run) => {
        const dateObj = run.created_at ? new Date(run.created_at) : new Date();
        const dateStr = dateObj.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric"
        });
        const timeStr = dateObj.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit"
        });

        const green = Number(run.green_cover_percentage) || 0;
        let badgeClass = "healthy";
        let statusLabel = "Healthy (≥ 30%)";
        let statusIcon = '<i class="fa-solid fa-circle-check"></i>';

        if (green < 15.0) {
          badgeClass = "critical";
          statusLabel = "Deficit (< 15%)";
          statusIcon = '<i class="fa-solid fa-triangle-exclamation"></i>';
        } else if (green < 30.0) {
          badgeClass = "warning";
          statusLabel = "Moderate (15–30%)";
          statusIcon = '<i class="fa-solid fa-circle-exclamation"></i>';
        }

        const areaName = run.area_name || "Custom Selected Area";
        const totalArea = Number(run.total_area_hectares) || 0;
        const meanNdvi = Number(run.mean_ndvi) || 0;
        const satelliteDate = run.satellite_date_used || "Sentinel-2 L2A";

        return `
          <tr data-run-id="${run.id}" class="dashboard-table-row">
            <td class="col-area-name">
              <span class="aoi-name-text" title="${areaName}">${areaName}</span>
            </td>
            <td class="col-date">
              <div class="date-main">${dateStr}</div>
              <div class="date-sub" title="Satellite Scene Date: ${satelliteDate}">
                <i class="fa-solid fa-satellite"></i> ${satelliteDate} • ${timeStr}
              </div>
            </td>
            <td class="col-surface-area">
              <strong>${totalArea.toFixed(1)} ha</strong>
            </td>
            <td class="col-ndvi">
              <code class="ndvi-code">${meanNdvi.toFixed(2)}</code>
            </td>
            <td class="col-green-cover">
              <strong class="green-pct-val">${green.toFixed(1)}%</strong>
            </td>
            <td class="col-status">
              <span class="table-badge ${badgeClass}">${statusIcon} ${statusLabel}</span>
            </td>
            <td class="col-actions">
              <div class="table-actions-cell">
                <button class="btn-view-map" data-run-id="${run.id}" title="View and recall this analysis on the map">
                  <i class="fa-solid fa-map-location-dot"></i>
                  <span>View on Map</span>
                </button>
                <button class="btn-delete-analysis" data-run-id="${run.id}" title="Delete this analysis from Supabase PostGIS">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    this.containerEl.innerHTML = `
      <table class="history-data-table">
        <thead>
          <tr>
            <th>Area of Interest</th>
            <th>Date &amp; Scene</th>
            <th>Surface Area</th>
            <th>Mean NDVI</th>
            <th>Green Cover</th>
            <th>Canopy Status</th>
            <th style="text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;

    // Bind row and button clicks
    this.containerEl.querySelectorAll(".dashboard-table-row").forEach((row) => {
      const runId = row.getAttribute("data-run-id");
      const foundRun = this.analyses.find((r) => r.id === runId);

      // Entire row click (except action buttons) triggers map recall
      row.addEventListener("click", (e) => {
        if (e.target.closest(".btn-delete-analysis")) return;
        if (foundRun && this.onSelectRun) {
          this.onSelectRun(foundRun);
        }
      });

      // View on Map button
      const btnView = row.querySelector(".btn-view-map");
      if (btnView) {
        btnView.addEventListener("click", (e) => {
          e.stopPropagation();
          if (foundRun && this.onSelectRun) {
            this.onSelectRun(foundRun);
          }
        });
      }

      // Delete button
      const btnDelete = row.querySelector(".btn-delete-analysis");
      if (btnDelete) {
        btnDelete.addEventListener("click", async (e) => {
          e.stopPropagation();
          const areaLabel = foundRun ? foundRun.area_name || "this analysis" : "this analysis";
          const confirmed = window.confirm(
            `Are you sure you want to delete "${areaLabel}" from Supabase PostGIS?\n\nThis will permanently remove the saved polygon geometry and NDVI metrics.`
          );
          if (!confirmed) return;

          btnDelete.disabled = true;
          btnDelete.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

          try {
            await deleteAnalysisById(runId);
            if (typeof this.onToast === "function") {
              this.onToast(`Deleted "${areaLabel}" from PostGIS.`, "info");
            }
            await this.loadAnalyses();
          } catch (delErr) {
            console.error("Failed to delete analysis:", delErr);
            alert(`Failed to delete analysis: ${delErr.message}`);
            btnDelete.disabled = false;
            btnDelete.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
          }
        });
      }
    });
  }
}

