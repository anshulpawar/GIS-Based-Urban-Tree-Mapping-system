/**
 * @file insightsCard.js
 * @description Renders rule-based environmental diagnostics, green-deficit warnings,
 * urban cooling capacity indicators, and targeted planting recommendations.
 */

export class InsightsCard {
  /**
   * @param {string} containerId - Target DOM element ID
   */
  constructor(containerId = "insights-panel-container") {
    this.container = document.getElementById(containerId);
    this.renderPlaceholder();
  }

  /**
   * Initial placeholder prior to polygon submission.
   */
  renderPlaceholder() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Environmental Insights</span>
      </div>
      <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
        Deterministic ecological rules evaluate urban heat island risk and tree canopy
        deficits once an AOI is analyzed.
      </p>
    `;
  }

  /**
   * Renders computed environmental insights report.
   * @param {Object} report - InsightReport payload
   */
  update(report) {
    if (!this.container || !report) return;

    const recommendations = report.recommendations || [];

    const recsHtml = recommendations
      .map((item) => `
        <div class="insight-alert severity-${item.severity}">
          <div class="insight-title">${item.title}</div>
          <div class="insight-desc">${item.description}</div>
          <div class="insight-action">💡 Action: ${item.suggested_action}</div>
        </div>
      `)
      .join("");

    this.container.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Ecological Diagnostics</span>
        <span class="status-badge" style="font-size: 11px;">Score: ${report.health_score}/100</span>
      </div>

      <div style="margin-bottom: 14px;">
        <div style="font-size: 15px; font-weight: 700; color: #f8fafc; margin-bottom: 4px;">
          ${report.overall_health_status}
        </div>
        <div style="font-size: 12px; color: #94a3b8;">
          Cooling Rating: <strong style="color: #38bdf8;">${report.cooling_capacity_index}</strong>
        </div>
      </div>

      <div style="display: flex; gap: 8px; margin-bottom: 14px;">
        <div class="metric-item" style="flex: 1; padding: 8px 12px;">
          <div class="metric-label" style="font-size: 10px;">Green Deficit</div>
          <div style="font-size: 16px; font-weight: 700; color: #f43f5e;">
            ${report.green_deficit_hectares} ha
          </div>
        </div>
        <div class="metric-item" style="flex: 1; padding: 8px 12px;">
          <div class="metric-label" style="font-size: 10px;">Planting Target</div>
          <div style="font-size: 16px; font-weight: 700; color: #10b981;">
            ~${report.estimated_trees_needed} trees
          </div>
        </div>
      </div>

      <div class="recommendations-list">
        ${recsHtml || '<p style="font-size: 12px; color: #94a3b8;">No immediate interventions needed.</p>'}
      </div>
    `;
  }
}

