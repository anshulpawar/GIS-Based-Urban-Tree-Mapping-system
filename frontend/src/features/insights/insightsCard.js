/**
 * @file insightsCard.js
 * @description Renders rule-based environmental diagnostics, green-deficit warnings,
 * urban cooling capacity indicators, and targeted planting recommendations.
 */

export class InsightsCard {
  /**
   * @param {string} [containerId="insights-container"] - Target DOM element ID
   */
  constructor(containerId = "insights-container") {
    this.container = document.getElementById(containerId);
  }

  /**
   * Renders computed environmental insights report.
   * @param {Object} report - InsightReport payload
   */
  update(report) {
    if (!this.container || !report) return;

    this.container.style.display = "block";

    const recommendations = report.recommendations || [];

    const recsHtml = recommendations
      .map(
        (item) => `
        <div class="insight-alert severity-${item.severity || 'moderate'}">
          <div class="insight-title-row">
            <i class="fa-solid fa-lightbulb"></i>
            <span class="insight-title">${item.title}</span>
          </div>
          <div class="insight-desc">${item.description}</div>
          <div class="insight-action"><strong>Recommended Action:</strong> ${item.suggested_action}</div>
        </div>
      `
      )
      .join("");

    this.container.innerHTML = `
      <div class="insights-panel-card glass-panel">
        <div class="panel-header">
          <div class="panel-header-title">
            <i class="fa-solid fa-shield-heart"></i>
            <span class="panel-title">Ecological Diagnostics</span>
          </div>
          <span class="status-badge badge-health">Health: ${report.health_score ?? 70}/100</span>
        </div>

        <div class="health-summary-row">
          <div class="health-status-text">${report.overall_health_status || "Moderate Canopy Density"}</div>
          <div class="cooling-rating-text">
            Cooling Rating: <strong class="highlight-cyan">${report.cooling_capacity_index || "Moderate"}</strong>
          </div>
        </div>

        <div class="deficit-grid">
          <div class="metric-item deficit-item">
            <div class="metric-label">Green Deficit</div>
            <div class="deficit-val highlight-rose">
              ${report.green_deficit_hectares !== undefined ? report.green_deficit_hectares : "0.0"} ha
            </div>
            <div class="metric-sub">vs WHO 30% Guideline</div>
          </div>

          <div class="metric-item target-item">
            <div class="metric-label">Planting Target</div>
            <div class="target-val highlight-green">
              ~${(report.estimated_trees_needed || 0).toLocaleString()} trees
            </div>
            <div class="metric-sub">~400 trees / ha</div>
          </div>
        </div>

        <div class="recommendations-container">
          <div class="recommendations-header">Actionable Urban Interventions</div>
          <div class="recommendations-list">
            ${recsHtml || '<p class="no-recs-note">Current canopy meets local ecological standards.</p>'}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Hides the insights container.
   */
  clear() {
    if (this.container) {
      this.container.style.display = "none";
      this.container.innerHTML = "";
    }
  }
}
