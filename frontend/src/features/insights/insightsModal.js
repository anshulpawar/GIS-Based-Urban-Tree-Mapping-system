/**
 * @file insightsModal.js
 * @description Dedicated AI Environmental Insights & Action Plan Modal controller.
 * Displays Gemini 3.8 Flash / Rule-Based diagnostics grounded strictly in Sentinel-2 NDVI telemetry.
 */

import { generateAiInsights } from "../../api/apiClient.js";

export class InsightsModal {
  constructor(modalId = "insights-modal") {
    this.modalEl = document.getElementById(modalId);
    this.currentTelemetry = null;
    this.isLoading = false;
    this.insightsCache = new Map();

    // Sub-elements
    this.btnClose = document.getElementById("btn-close-insights");
    this.btnDismiss = document.getElementById("btn-dismiss-insights");
    this.btnRegenerate = document.getElementById("btn-regenerate-insights");
    this.btnCopy = document.getElementById("btn-copy-insights");

    // Chips
    this.chipAreaName = document.getElementById("ins-chip-area-name");
    this.chipTotalArea = document.getElementById("ins-chip-total-area");
    this.chipGreenPct = document.getElementById("ins-chip-green-pct");
    this.chipMeanNdvi = document.getElementById("ins-chip-mean-ndvi");
    this.chipDate = document.getElementById("ins-chip-date");

    // View panels
    this.loadingView = document.getElementById("insights-loading");
    this.contentView = document.getElementById("insights-content");

    // Detail targets
    this.sourceBadge = document.getElementById("ins-source-badge");
    this.sourceText = document.getElementById("ins-source-text");
    this.healthScore = document.getElementById("ins-health-score");
    this.healthStatus = document.getElementById("ins-health-status");
    this.coolingBadge = document.getElementById("ins-cooling-badge");
    this.summaryText = document.getElementById("ins-summary-text");
    this.deficitHa = document.getElementById("ins-deficit-ha");
    this.treesNeeded = document.getElementById("ins-trees-needed");
    this.recsList = document.getElementById("ins-recommendations-list");
    this.floraList = document.getElementById("ins-flora-list");
    this.markdownReport = document.getElementById("ins-markdown-report");

    this.currentResponse = null;

    this._bindEvents();
  }

  _bindEvents() {
    if (this.btnClose) {
      this.btnClose.addEventListener("click", () => this.close());
    }
    if (this.btnDismiss) {
      this.btnDismiss.addEventListener("click", () => this.close());
    }
    if (this.btnRegenerate) {
      this.btnRegenerate.addEventListener("click", () => {
        if (!this.isLoading && this.currentTelemetry) {
          this.fetchInsights({ forceRegenerate: true });
        }
      });
    }
    if (this.btnCopy) {
      this.btnCopy.addEventListener("click", () => this.copyReportToClipboard());
    }

    // Close on backdrop click
    if (this.modalEl) {
      this.modalEl.addEventListener("click", (evt) => {
        if (evt.target === this.modalEl) {
          this.close();
        }
      });
    }

    // Close on Escape key
    document.addEventListener("keydown", (evt) => {
      if (evt.key === "Escape" && this.isOpen()) {
        this.close();
      }
    });
  }

  isOpen() {
    return this.modalEl && this.modalEl.style.display !== "none";
  }

  _getCacheKey(t) {
    if (!t) return null;
    const id = t.analysis_id || t.id;
    if (id) return `id:${id}`;
    const areaName = t.area_name || t.run_label || t.studyAreaName || "";
    const meanNdvi = Number(t.mean_ndvi || (t.stats && t.stats.mean_ndvi) || 0).toFixed(4);
    const date = (t.satellite_date_used || t.acquisition_date || "").toString().slice(0, 10);
    return `geom:${areaName}:${meanNdvi}:${date}`;
  }

  /**
   * Opens the modal and triggers insights generation for the current telemetry payload.
   * Reuses cached insights if available unless explicitly regenerated.
   * @param {Object} telemetry - Telemetry metrics from analysis or history recall
   */
  open(telemetry) {
    if (!this.modalEl || !telemetry) return;

    this.currentTelemetry = telemetry;
    this._renderTelemetryChips(telemetry);

    this.modalEl.style.display = "flex";

    const cacheKey = this._getCacheKey(telemetry);
    if (telemetry._cachedInsights) {
      if (cacheKey) this.insightsCache.set(cacheKey, telemetry._cachedInsights);
      this._renderContent(telemetry._cachedInsights);
      if (this.loadingView) this.loadingView.style.display = "none";
      if (this.contentView) this.contentView.style.display = "block";
      return;
    }
    if (cacheKey && this.insightsCache.has(cacheKey)) {
      this._renderContent(this.insightsCache.get(cacheKey));
      if (this.loadingView) this.loadingView.style.display = "none";
      if (this.contentView) this.contentView.style.display = "block";
      return;
    }

    this.fetchInsights({ forceRegenerate: false });
  }

  close() {
    if (this.modalEl) {
      this.modalEl.style.display = "none";
    }
  }

  _renderTelemetryChips(telemetry) {
    const stats = telemetry.stats || {};
    const areaName = telemetry.area_name || telemetry.run_label || telemetry.studyAreaName || "Custom Selected Area";
    const totalHa = Number(telemetry.total_area_hectares || stats.area_ha || 0).toFixed(1);
    const greenPct = Number(telemetry.green_cover_percentage || stats.green_cover_pct || 0).toFixed(1);
    const meanNdvi = Number(telemetry.mean_ndvi || stats.mean_ndvi || 0).toFixed(3);
    const satDate = (telemetry.satellite_date_used || telemetry.acquisition_date || "Sentinel-2").toString().split("T")[0];

    if (this.chipAreaName) this.chipAreaName.textContent = areaName;
    if (this.chipTotalArea) this.chipTotalArea.textContent = `${totalHa} ha`;
    if (this.chipGreenPct) this.chipGreenPct.textContent = `${greenPct}% Green`;
    if (this.chipMeanNdvi) this.chipMeanNdvi.textContent = `NDVI ${meanNdvi}`;
    if (this.chipDate) this.chipDate.textContent = satDate;
  }

  /**
   * Fetches insights from the backend endpoint POST /api/insights.
   * @param {Object} [options] - Options dictionary
   * @param {boolean} [options.forceRegenerate=false] - If true, bypasses Supabase/memory cache and queries LLM
   */
  async fetchInsights(options = {}) {
    if (!this.currentTelemetry) return;

    const forceRegenerate = Boolean(options.forceRegenerate);
    const cacheKey = this._getCacheKey(this.currentTelemetry);

    if (!forceRegenerate && cacheKey && this.insightsCache.has(cacheKey)) {
      this._renderContent(this.insightsCache.get(cacheKey));
      return;
    }

    this.isLoading = true;
    if (this.loadingView) this.loadingView.style.display = "flex";
    if (this.contentView) this.contentView.style.display = "none";
    if (this.btnRegenerate) {
      this.btnRegenerate.disabled = true;
      this.btnRegenerate.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Synthesizing...</span>';
    }

    const t = this.currentTelemetry;
    const stats = t.stats || {};
    const payload = {
      area_name: t.area_name || t.run_label || t.studyAreaName || "Custom Selected Area",
      total_area_hectares: Number(t.total_area_hectares || stats.area_ha || 1.0),
      green_cover_percentage: Number(t.green_cover_percentage || stats.green_cover_pct || 0.0),
      green_cover_hectares: t.green_cover_hectares ? Number(t.green_cover_hectares) : null,
      mean_ndvi: Number(t.mean_ndvi || stats.mean_ndvi || 0.0),
      dense_pct: Number(t.dense_pct != null ? t.dense_pct : stats.dense_pct || 0.0),
      moderate_pct: Number(t.moderate_pct != null ? t.moderate_pct : stats.moderate_pct || 0.0),
      sparse_pct: Number(t.sparse_pct != null ? t.sparse_pct : stats.sparse_pct || 0.0),
      deficit_pct: Number(t.deficit_pct != null ? t.deficit_pct : stats.non_veg_pct || 0.0),
      satellite_date_used: (t.satellite_date_used || t.acquisition_date || "").toString().slice(0, 10) || null,
      delta_ndvi: t.mean_delta_ndvi != null ? Number(t.mean_delta_ndvi) : null,
      historical_date: t.historical_date || null,
      analysis_id: t.analysis_id || t.id || null,
      force_regenerate: forceRegenerate
    };

    try {
      const response = await generateAiInsights(payload);
      if (cacheKey) {
        this.insightsCache.set(cacheKey, response);
      }
      this.currentTelemetry._cachedInsights = response;
      this._renderContent(response);
    } catch (err) {
      console.error("AI Insights fetch failed:", err);
      this._renderError(err);
    } finally {
      this.isLoading = false;
      if (this.loadingView) this.loadingView.style.display = "none";
      if (this.contentView) this.contentView.style.display = "block";
      if (this.btnRegenerate) {
        this.btnRegenerate.disabled = false;
        this.btnRegenerate.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i><span>Regenerate</span>';
      }
    }
  }

  _renderContent(res) {
    // 1. Source Badge
    if (this.sourceBadge) {
      if (res.source === "gemini") {
        this.sourceBadge.className = "source-badge badge-gemini";
        const modelLabel = res.model_used ? `Gemini AI (${res.model_used})` : "Gemini 3.8 Flash";
        this.sourceBadge.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i><span>${modelLabel}</span>`;
        this.sourceBadge.title = "Synthesized dynamically via Google Gemini AI using verified Sentinel-2 NDVI telemetry";
      } else if (res.source === "groq") {
        this.sourceBadge.className = "source-badge badge-groq";
        const modelLabel = res.model_used ? `Groq AI (${res.model_used})` : "Groq AI";
        this.sourceBadge.innerHTML = `<i class="fa-solid fa-bolt"></i><span>${modelLabel}</span>`;
        this.sourceBadge.title = "Synthesized dynamically via Groq LPU inference using verified Sentinel-2 NDVI telemetry";
      } else {
        this.sourceBadge.className = "source-badge badge-fallback";
        this.sourceBadge.innerHTML = '<i class="fa-solid fa-calculator"></i><span>Deterministic Rule Engine (Fallback)</span>';
        this.sourceBadge.title = "Evaluated via municipal urban forestry benchmarks (WHO 30% standard) - AI models offline or unavailable";
      }
    }

    // 2. Health Score & Status
    if (this.healthScore) {
      this.healthScore.textContent = `${res.health_score ?? 70}/100`;
    }
    if (this.healthStatus) {
      this.healthStatus.textContent = res.overall_health_status || "Canopy Health Assessment";
    }

    // 3. Cooling Rating Pill
    if (this.coolingBadge) {
      const cooling = res.cooling_capacity_index || "Moderate";
      this.coolingBadge.textContent = `Cooling: ${cooling}`;
      this.coolingBadge.className = `cooling-pill cooling-${cooling.toLowerCase().split(" ")[0]}`;
    }

    // 4. Executive Summary
    if (this.summaryText) {
      this.summaryText.textContent = res.summary || "Evaluation completed.";
    }

    // 5. Deficit & Target
    if (this.deficitHa) {
      const haVal = res.green_deficit_hectares != null ? Number(res.green_deficit_hectares).toFixed(1) : "0.0";
      this.deficitHa.textContent = `${haVal} ha`;
    }
    if (this.treesNeeded) {
      const treesVal = (res.estimated_trees_needed || 0).toLocaleString();
      this.treesNeeded.textContent = `~${treesVal} trees`;
    }

    // 6. Actionable Recommendations
    if (this.recsList) {
      const recs = res.recommendations || [];
      if (!recs.length) {
        this.recsList.innerHTML = '<p class="ins-empty-note">No critical interventions required; canopy meets municipal guidelines.</p>';
      } else {
        this.recsList.innerHTML = recs.map((rec) => {
          const sev = (rec.severity || "moderate").toLowerCase();
          const sevIcon = sev === "critical"
            ? "fa-triangle-exclamation"
            : sev === "warning"
            ? "fa-circle-exclamation"
            : sev === "healthy"
            ? "fa-circle-check"
            : "fa-circle-info";

          return `
            <div class="ins-rec-card severity-${sev}">
              <div class="ins-rec-header">
                <div class="ins-rec-title-group">
                  <i class="fa-solid ${sevIcon} ins-rec-icon"></i>
                  <strong class="ins-rec-title">${this._escape(rec.title)}</strong>
                </div>
                <span class="ins-sev-badge sev-${sev}">${sev.toUpperCase()}</span>
              </div>
              <p class="ins-rec-desc">${this._escape(rec.description)}</p>
              <div class="ins-rec-action">
                <span class="ins-action-label"><i class="fa-solid fa-arrow-turn-up"></i> Suggested Action:</span>
                <span class="ins-action-text">${this._escape(rec.suggested_action)}</span>
              </div>
            </div>
          `;
        }).join("");
      }
    }

    // 7. Recommended Flora & Planting Suitability
    if (this.floraList) {
      const flora = res.planting_recommendations || [];
      if (!flora.length) {
        this.floraList.innerHTML = '<p class="ins-empty-note">No tailored flora recommendations available.</p>';
      } else {
        this.floraList.innerHTML = flora.map((item) => {
          const typeName = item.plant_type || "Recommended Planting Group";
          const lowerType = typeName.toLowerCase();
          const iconClass = lowerType.includes("street") || lowerType.includes("avenue")
            ? "fa-road"
            : lowerType.includes("understory") || lowerType.includes("shrub")
            ? "fa-leaf"
            : lowerType.includes("bioswale") || lowerType.includes("groundcover") || lowerType.includes("drainage")
            ? "fa-droplet"
            : "fa-tree";

          const speciesChips = (item.species_examples || []).map(
            (sp) => `<span class="flora-species-chip">${this._escape(sp)}</span>`
          ).join("");

          return `
            <div class="ins-flora-card">
              <div class="ins-flora-header">
                <div class="ins-flora-title-group">
                  <i class="fa-solid ${iconClass} ins-flora-icon"></i>
                  <span class="ins-flora-type">${this._escape(typeName)}</span>
                </div>
              </div>
              ${speciesChips ? `<div class="ins-flora-species-row">${speciesChips}</div>` : ""}
              <div class="ins-flora-detail-row">
                <span class="flora-label"><i class="fa-solid fa-circle-check"></i> Why Suited:</span>
                <span class="flora-val">${this._escape(item.why_suited_for_area)}</span>
              </div>
              <div class="ins-flora-detail-row">
                <span class="flora-label"><i class="fa-solid fa-seedling"></i> Area Benefits:</span>
                <span class="flora-val">${this._escape(item.area_benefits)}</span>
              </div>
            </div>
          `;
        }).join("");
      }
    }

    // 8. Full Markdown / Narrative Report
    if (this.markdownReport) {
      this.markdownReport.innerHTML = this._renderMarkdown(res.markdown || "");
    }

    this.currentResponse = res;
  }

  /**
   * Formats and copies the complete synthesized insights report to clipboard with user feedback.
   */
  async copyReportToClipboard() {
    if (!this.currentResponse || !this.currentTelemetry) return;

    const res = this.currentResponse;
    const t = this.currentTelemetry;
    const stats = t.stats || {};
    const areaName = t.area_name || t.run_label || t.studyAreaName || "Custom Selected Area";
    const totalHa = Number(t.total_area_hectares || stats.area_ha || 0).toFixed(1);
    const greenPct = Number(t.green_cover_percentage || stats.green_cover_pct || 0).toFixed(1);
    const meanNdvi = Number(t.mean_ndvi || stats.mean_ndvi || 0).toFixed(3);
    const satDate = (t.satellite_date_used || t.acquisition_date || "Sentinel-2").toString().split("T")[0];

    const recs = (res.recommendations || []).map((r, idx) => (
      `### ${idx + 1}. ${r.title} [${(r.severity || "MODERATE").toUpperCase()}]\n` +
      `- **Diagnosis**: ${r.description}\n` +
      `- **Suggested Action**: ${r.suggested_action}`
    )).join("\n\n");

    const flora = (res.planting_recommendations || []).map((f) => (
      `### ${f.plant_type}\n` +
      `- **Recommended Species**: ${(f.species_examples || []).join(", ")}\n` +
      `- **Site & Soil Suitability**: ${f.why_suited_for_area}\n` +
      `- **Targeted Ecological Benefits**: ${f.area_benefits}`
    )).join("\n\n");

    const fullMarkdown = [
      `# AI Urban Canopy Insights & Action Plan: ${areaName}`,
      ``,
      `> Generated via ${res.source === "gemini" ? "Google Gemini AI (" + res.model_used + ")" : res.source === "groq" ? "Groq AI (" + res.model_used + ")" : "Deterministic Urban Forestry Rule Engine"} grounded in Copernicus Sentinel-2 multispectral NDVI telemetry.`,
      ``,
      `## Telemetry & Municipal Canopy Diagnostics`,
      `- **Study Area**: ${areaName}`,
      `- **Sentinel-2 Date**: ${satDate}`,
      `- **Total Surface Area**: ${totalHa} ha`,
      `- **Green Vegetation Cover**: ${greenPct}%`,
      `- **Mean NDVI**: ${meanNdvi}`,
      `- **Canopy Health Score**: ${res.health_score}/100 (${res.overall_health_status})`,
      `- **Urban Cooling Rating**: ${res.cooling_capacity_index || "Moderate"}`,
      `- **Green Deficit (vs WHO 30%)**: ${res.green_deficit_hectares != null ? Number(res.green_deficit_hectares).toFixed(1) : "0.0"} ha`,
      `- **Target Infill Planting**: ~${(res.estimated_trees_needed || 0).toLocaleString()} native trees`,
      ``,
      `## Executive Summary`,
      res.summary || "Evaluation completed.",
      ``,
      `## Priority Urban Forestry Interventions`,
      recs || "No critical interventions required.",
      ``,
      `## Recommended Flora & Planting Suitability`,
      `*Species suitability guidance is horticultural and urban forestry planning support based on geographic context and Copernicus Sentinel-2 NDVI metrics.*`,
      ``,
      flora || "No tailored flora data available.",
      ``,
      `## Detailed Scientific Synthesis Report`,
      res.markdown || "",
      ``,
      `---`,
      `*Urban Tree Mapping Platform - Sentinel-2 Multispectral Urban Forestry Analytics*`
    ].join("\n");

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(fullMarkdown);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = fullMarkdown;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      if (this.btnCopy) {
        const origHtml = this.btnCopy.innerHTML;
        this.btnCopy.innerHTML = '<i class="fa-solid fa-check"></i><span>Copied!</span>';
        this.btnCopy.classList.add("btn-copied");
        setTimeout(() => {
          if (this.btnCopy) {
            this.btnCopy.innerHTML = origHtml;
            this.btnCopy.classList.remove("btn-copied");
          }
        }, 2200);
      }
    } catch (err) {
      console.error("Failed to copy insights report to clipboard:", err);
    }
  }

  _renderError(err) {
    if (this.contentView) {
      this.contentView.innerHTML = `
        <div class="insights-error-card">
          <i class="fa-solid fa-triangle-exclamation error-icon"></i>
          <h4>Unable to Generate AI Insights</h4>
          <p>${this._escape(err.message || "An unexpected error occurred while contacting the insights engine.")}</p>
          <button id="btn-retry-insights-inline" class="btn-primary-action compact" style="margin-top: 12px;">
            <i class="fa-solid fa-arrows-rotate"></i> Retry Synthesis
          </button>
        </div>
      `;
      const retryBtn = document.getElementById("btn-retry-insights-inline");
      if (retryBtn) {
        retryBtn.addEventListener("click", () => this.fetchInsights({ forceRegenerate: true }));
      }
    }
  }

  _renderMarkdown(md) {
    if (!md) return "";

    // Lightweight markdown parser for headers, bold, bullet points, and paragraphs
    const lines = md.split("\n");
    const htmlLines = [];
    let inList = false;

    for (let rawLine of lines) {
      const line = rawLine.trim();

      if (line.startsWith("### ")) {
        if (inList) { htmlLines.push("</ul>"); inList = false; }
        htmlLines.push(`<h4>${this._formatInline(line.substring(4))}</h4>`);
      } else if (line.startsWith("## ")) {
        if (inList) { htmlLines.push("</ul>"); inList = false; }
        htmlLines.push(`<h3>${this._formatInline(line.substring(3))}</h3>`);
      } else if (line.startsWith("# ")) {
        if (inList) { htmlLines.push("</ul>"); inList = false; }
        htmlLines.push(`<h2>${this._formatInline(line.substring(2))}</h2>`);
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        if (!inList) { htmlLines.push("<ul>"); inList = true; }
        htmlLines.push(`<li>${this._formatInline(line.substring(2))}</li>`);
      } else if (line === "") {
        if (inList) { htmlLines.push("</ul>"); inList = false; }
      } else {
        if (inList) { htmlLines.push("</ul>"); inList = false; }
        htmlLines.push(`<p>${this._formatInline(line)}</p>`);
      }
    }

    if (inList) {
      htmlLines.push("</ul>");
    }

    return htmlLines.join("\n");
  }

  _formatInline(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  _escape(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
