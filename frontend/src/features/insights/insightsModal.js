/**
 * @file insightsModal.js
 * @description Dedicated AI Environmental Insights & Action Plan Modal controller.
 * Displays Gemini 3.8 Flash / Rule-Based diagnostics grounded strictly in Sentinel-2 NDVI telemetry.
 */

import { generateAiInsights } from "../../api/apiClient.js";
import { generatePdfReport } from "./pdfReportGenerator.js";

export class InsightsModal {
  constructor(modalId = "insights-modal", options = {}) {
    this.modalEl = document.getElementById(modalId);
    this.getMapSnapshot = options.getMapSnapshot || null;
    this.currentTelemetry = null;
    this.isLoading = false;
    this.insightsCache = new Map();

    // Sub-elements
    this.btnClose = document.getElementById("btn-close-insights");
    this.btnDismiss = document.getElementById("btn-dismiss-insights");
    this.btnRegenerate = document.getElementById("btn-regenerate-insights");
    this.btnDownload = document.getElementById("btn-download-insights");

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

    // Score Breakdown & Improvements targets
    this.scoreBandPill = document.getElementById("ins-score-band-pill");
    this.ndviPtsEl = document.getElementById("ins-ndvi-pts");
    this.ndviBar = document.getElementById("ins-ndvi-bar");
    this.ndviCalcSub = document.getElementById("ins-ndvi-calc-sub");
    this.coverPtsEl = document.getElementById("ins-cover-pts");
    this.coverBar = document.getElementById("ins-cover-bar");
    this.coverCalcSub = document.getElementById("ins-cover-calc-sub");
    this.scoreExplanation = document.getElementById("ins-score-explanation");
    this.projectedUpliftBadge = document.getElementById("ins-projected-uplift-badge");
    this.improvementStepsContainer = document.getElementById("ins-improvement-steps");

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
    if (this.btnDownload) {
      this.btnDownload.addEventListener("click", () => this.downloadReportPdf());
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
    const cached = telemetry._cachedInsights || telemetry.generated_insights || (cacheKey && this.insightsCache.get(cacheKey));
    if (cached && (cached.markdown || (cached.recommendations && cached.recommendations.length > 0))) {
      if (cacheKey) this.insightsCache.set(cacheKey, cached);
      telemetry._cachedInsights = cached;
      telemetry.generated_insights = cached;
      this._renderContent(cached);
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
      this.currentTelemetry.generated_insights = response;
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

    // 9. Score Breakdown & Improvement Pathways
    this._renderScoreBreakdownAndImprovements(this.currentTelemetry, res);

    this.currentResponse = res;
  }

  _renderScoreBreakdownAndImprovements(t, res) {
    if (!t) return;
    const stats = t.stats || {};
    const meanNdvi = Number(t.mean_ndvi != null ? t.mean_ndvi : stats.mean_ndvi || 0.0);
    const greenPct = Number(t.green_cover_percentage != null ? t.green_cover_percentage : stats.green_cover_pct || 0.0);

    const ndviPts = Math.min(60.0, Math.max(0.0, meanNdvi * 60.0)).toFixed(1);
    const coverPts = Math.min(40.0, Math.max(0.0, greenPct * 0.4)).toFixed(1);
    const totalScore = res.health_score ?? Math.round(Number(ndviPts) + Number(coverPts));

    // Update Formula Values & Bars
    if (this.ndviPtsEl) this.ndviPtsEl.textContent = `${ndviPts} / 60.0 pts`;
    if (this.ndviBar) this.ndviBar.style.width = `${Math.min(100, (Number(ndviPts) / 60.0) * 100)}%`;
    if (this.ndviCalcSub) this.ndviCalcSub.textContent = `Calculated: ${meanNdvi.toFixed(3)} × 60.0 pts weight`;

    if (this.coverPtsEl) this.coverPtsEl.textContent = `${coverPts} / 40.0 pts`;
    if (this.coverBar) this.coverBar.style.width = `${Math.min(100, (Number(coverPts) / 40.0) * 100)}%`;
    if (this.coverCalcSub) this.coverCalcSub.textContent = `Calculated: ${greenPct.toFixed(1)}% × 0.4 pts weight`;

    // Significance Band
    if (this.scoreBandPill) {
      let bandText = "MODERATE CANOPY (45–64)";
      let bandClass = "band-moderate";
      if (totalScore >= 80) {
        bandText = "OPTIMAL CANOPY (80–100)";
        bandClass = "band-optimal";
      } else if (totalScore >= 65) {
        bandText = "GOOD CANOPY (65–79)";
        bandClass = "band-good";
      } else if (totalScore < 45) {
        bandText = "CRITICAL DEFICIT (< 45)";
        bandClass = "band-critical";
      }
      this.scoreBandPill.textContent = bandText;
      this.scoreBandPill.className = `score-band-pill ${bandClass}`;
    }

    // Explanation Note
    if (this.scoreExplanation) {
      if (greenPct >= 50 && totalScore < 65) {
        this.scoreExplanation.textContent = `Why is the score ${totalScore}/100 despite ${greenPct.toFixed(0)}% green cover? Green cover provides up to 40 points for surface coverage (grass, shrubs, sparse trees), while photosynthetic vigor (NDVI) carries 60 points. A score in the 50–60 range indicates acceptable surface vegetation coverage but low canopy density or moisture stress, pointing to high-LAI shade tree infill as the primary opportunity.`;
      } else if (totalScore >= 65) {
        this.scoreExplanation.textContent = `This canopy demonstrates balanced photosynthetic vigor (${ndviPts} pts) and strong spatial coverage (${coverPts} pts). Continued preservation of mature trees will sustain municipal cooling and stormwater absorption.`;
      } else {
        this.scoreExplanation.textContent = `This polygon reflects high non-vegetated deficit and reduced canopy vigor. Prioritize targeted native tree infill and soil de-paving to elevate both NDVI photosynthetic points and green cover surface points.`;
      }
    }

    // Projected Uplift Badge
    if (this.projectedUpliftBadge) {
      const targetGain = totalScore < 50 ? "+16 to +22 pts" : totalScore < 70 ? "+12 to +16 pts" : "+6 to +10 pts";
      this.projectedUpliftBadge.textContent = `${targetGain} Projected Uplift`;
    }

    // Improvement Steps
    if (this.improvementStepsContainer) {
      const deficitHa = res.green_deficit_hectares != null ? Number(res.green_deficit_hectares).toFixed(1) : "0.0";
      const treesNeeded = (res.estimated_trees_needed || 0).toLocaleString();

      this.improvementStepsContainer.innerHTML = `
        <div class="improvement-step-card">
          <div class="step-title-group">
            <div class="step-icon"><i class="fa-solid fa-tree"></i></div>
            <div>
              <div class="step-title">Infill with High-LAI Native Shade Trees</div>
              <div class="step-impact">+10 to +15 NDVI Points</div>
            </div>
          </div>
          <p class="step-desc">Introduce broadleaf canopy species (such as Neem, Rain Tree, or native Oak) in open and sparse zones. Elevating photosynthetic leaf density directly raises mean NDVI toward 0.65+.</p>
        </div>

        <div class="improvement-step-card">
          <div class="step-title-group">
            <div class="step-icon"><i class="fa-solid fa-layer-group"></i></div>
            <div>
              <div class="step-title">Multi-Tiered Understory Shrub Buffers</div>
              <div class="step-impact">+4 to +7 Resilience Points</div>
            </div>
          </div>
          <p class="step-desc">Establish mid-story shrubs and drought-resilient groundcover beneath existing tree canopies to retain soil moisture, reduce solar soil heating, and protect root health during dry spells.</p>
        </div>

        <div class="improvement-step-card">
          <div class="step-title-group">
            <div class="step-icon"><i class="fa-solid fa-road-barrier"></i></div>
            <div>
              <div class="step-title">Non-Vegetated Easement & Bioswale Conversion</div>
              <div class="step-impact">+5 to +9 Spatial Points</div>
            </div>
          </div>
          <p class="step-desc">Convert paved margins, utility easements, and roadside buffers (${deficitHa} ha deficit) into vegetated bioswales to recover spatial green coverage toward the WHO 30% municipal benchmark (~${treesNeeded} trees).</p>
        </div>
      `;
    }
  }

  /**
   * Generates and downloads a complete multi-section researcher PDF study report.
   */
  async downloadReportPdf() {
    if (!this.currentResponse || !this.currentTelemetry) return;
    if (!this.btnDownload) return;

    const originalHtml = this.btnDownload.innerHTML;
    try {
      this.btnDownload.disabled = true;
      this.btnDownload.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Generating PDF...</span>';

      const mapSnapshot = this.getMapSnapshot ? await this.getMapSnapshot(this.currentTelemetry) : null;

      await generatePdfReport({
        telemetry: this.currentTelemetry,
        insights: this.currentResponse,
        mapSnapshot: mapSnapshot
      });

      this.btnDownload.innerHTML = '<i class="fa-solid fa-check"></i><span>Downloaded!</span>';
      this.btnDownload.classList.add("btn-downloaded");
      setTimeout(() => {
        if (this.btnDownload) {
          this.btnDownload.innerHTML = originalHtml;
          this.btnDownload.classList.remove("btn-downloaded");
          this.btnDownload.disabled = false;
        }
      }, 2200);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF report: " + (err.message || err));
      if (this.btnDownload) {
        this.btnDownload.innerHTML = originalHtml;
        this.btnDownload.disabled = false;
      }
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
