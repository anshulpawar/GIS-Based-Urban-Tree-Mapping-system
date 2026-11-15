/**
 * @file historyDrawer.js
 * @description Manages the Analytics & History Dashboard view,
 * calculating summary KPI metrics, rendering PostGIS spatial history runs,
 * and handling click-to-recall map bounds and polygon interactions.
 */

export class HistoryDrawer {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.containerId="history-table-container"] - Target table container ID
   * @param {Function} [options.onSelectRun] - Callback when user clicks a past run to recall on map
   */
  constructor({ containerId = "history-table-container", onSelectRun = null } = {}) {
    this.containerEl = document.getElementById(containerId);
    this.onSelectRun = onSelectRun;
    this.runs = [];

    // Fallback sample data representing saved Supabase PostGIS runs
    this.defaultSampleRuns = [
      {
        id: "run-bmsitm-urban-forest",
        run_label: "BMSIT&M Campus & Urban Canopy Corridor",
        created_at: "2026-11-14T10:15:00Z",
        total_area_hectares: 34.6,
        mean_ndvi: 0.58,
        green_cover_percentage: 72.4,
        health_status: "Healthy Canopy",
        geometry: {
          type: "Polygon",
          coordinates: [[
            [77.564, 13.131],
            [77.573, 13.131],
            [77.573, 13.137],
            [77.564, 13.137],
            [77.564, 13.131]
          ]]
        }
      },
      {
        id: "run-bokaro-steel-city",
        run_label: "Bokaro Sector IV Urban Park Zone",
        created_at: "2026-11-12T16:30:00Z",
        total_area_hectares: 68.2,
        mean_ndvi: 0.44,
        green_cover_percentage: 54.8,
        health_status: "Moderate Cover",
        geometry: {
          type: "Polygon",
          coordinates: [[
            [86.145, 23.665],
            [86.160, 23.665],
            [86.160, 23.675],
            [86.145, 23.675],
            [86.145, 23.665]
          ]]
        }
      },
      {
        id: "run-central-urban-industrial",
        run_label: "Industrial Logistics & Transportation Hub",
        created_at: "2026-11-10T09:00:00Z",
        total_area_hectares: 92.4,
        mean_ndvi: 0.16,
        green_cover_percentage: 14.2,
        health_status: "Critical Deficit",
        geometry: {
          type: "Polygon",
          coordinates: [[
            [77.585, 12.920],
            [77.605, 12.920],
            [77.605, 12.935],
            [77.585, 12.935],
            [77.585, 12.920]
          ]]
        }
      }
    ];

    this.init();
  }

  /**
   * Initializes the dashboard with initial sample/loaded runs.
   */
  init() {
    this.renderItems(this.defaultSampleRuns);
  }

  /**
   * Updates KPI metrics and renders historical table rows.
   * @param {Array<Object>} runs - List of historical run records
   */
  renderItems(runs) {
    this.runs = runs && runs.length > 0 ? runs : this.defaultSampleRuns;
    this.updateKPICards(this.runs);
    this.renderTable(this.runs);
  }

  /**
   * Calculates and updates the 4 KPI summary cards.
   * @param {Array<Object>} runs
   */
  updateKPICards(runs) {
    const totalRunsEl = document.getElementById("kpi-total-runs");
    const avgGreenEl = document.getElementById("kpi-avg-green");
    const avgNdviEl = document.getElementById("kpi-avg-ndvi");
    const totalAreaEl = document.getElementById("kpi-total-area");

    if (!runs || runs.length === 0) {
      if (totalRunsEl) totalRunsEl.textContent = "0";
      if (avgGreenEl) avgGreenEl.textContent = "0%";
      if (avgNdviEl) avgNdviEl.textContent = "0.00";
      if (totalAreaEl) totalAreaEl.textContent = "0 ha";
      return;
    }

    const count = runs.length;
    const totalGreen = runs.reduce((acc, r) => acc + (r.green_cover_percentage || 0), 0);
    const totalNdvi = runs.reduce((acc, r) => acc + (r.mean_ndvi || 0), 0);
    const totalArea = runs.reduce((acc, r) => acc + (r.total_area_hectares || 0), 0);

    if (totalRunsEl) totalRunsEl.textContent = count.toString();
    if (avgGreenEl) avgGreenEl.textContent = `${(totalGreen / count).toFixed(1)}%`;
    if (avgNdviEl) avgNdviEl.textContent = (totalNdvi / count).toFixed(2);
    if (totalAreaEl) totalAreaEl.textContent = `${totalArea.toFixed(1)} ha`;
  }

  /**
   * Renders the interactive data table inside the dashboard.
   * @param {Array<Object>} runs
   */
  renderTable(runs) {
    if (!this.containerEl) return;

    if (!runs || runs.length === 0) {
      this.containerEl.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
          No saved analyses recorded yet. Run a polygon analysis on the map to save runs.
        </div>
      `;
      return;
    }

    const rowsHtml = runs
      .map((run) => {
        const dateStr = new Date(run.created_at).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric"
        });

        let badgeClass = "healthy";
        const green = run.green_cover_percentage || 0;
        if (green < 20) {
          badgeClass = "critical";
        } else if (green < 40) {
          badgeClass = "warning";
        }

        const healthLabel = run.health_status || (green >= 40 ? "Optimal" : green >= 20 ? "Moderate" : "Deficit");

        return `
          <tr data-run-id="${run.id}">
            <td style="font-weight: 700; color: #fff;">${run.run_label || "Analysis Zone"}</td>
            <td style="color: var(--text-muted);">${dateStr}</td>
            <td><strong>${(run.total_area_hectares || 0).toFixed(1)} ha</strong></td>
            <td><code style="color: var(--accent-cyan); font-weight: 700;">${(run.mean_ndvi || 0).toFixed(2)}</code></td>
            <td style="font-weight: 700; color: #bef264;">${(run.green_cover_percentage || 0).toFixed(1)}%</td>
            <td>
              <span class="table-badge ${badgeClass}">${healthLabel}</span>
            </td>
            <td style="text-align: right;">
              <button class="btn-recall-run" data-run-id="${run.id}" title="Fly map to this polygon">
                <i class="fa-solid fa-location-crosshairs"></i>
                <span>Explore on Map</span>
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

    this.containerEl.innerHTML = `
      <table class="history-data-table">
        <thead>
          <tr>
            <th>Area of Interest (AOI)</th>
            <th>Date Analyzed</th>
            <th>Surface Area</th>
            <th>Mean NDVI</th>
            <th>Green Cover</th>
            <th>Canopy Status</th>
            <th style="text-align: right;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;

    // Bind row and button clicks to recall polygon on map
    this.containerEl.querySelectorAll("tr[data-run-id]").forEach((row) => {
      row.addEventListener("click", (e) => {
        const runId = row.getAttribute("data-run-id");
        const foundRun = this.runs.find((r) => r.id === runId);
        if (foundRun && this.onSelectRun) {
          this.onSelectRun(runId, foundRun);
        }
      });
    });
  }
}
