/**
 * @file historyDrawer.js
 * @description Manages the sliding sidebar drawer displaying historical GIS analysis runs,
 * and handles click-to-recall interaction to restore previous boundaries and stats.
 */

export class HistoryDrawer {
  /**
   * @param {Object} options
   * @param {string} [options.drawerId="history-drawer"]
   * @param {string} [options.listId="history-list"]
   * @param {Function} [options.onSelectRun] - Callback when user clicks a past run
   */
  constructor({ drawerId = "history-drawer", listId = "history-list", onSelectRun = null } = {}) {
    this.drawerEl = document.getElementById(drawerId);
    this.listEl = document.getElementById(listId);
    this.onSelectRun = onSelectRun;
    this.isOpen = false;

    this.bindEvents();
  }

  /**
   * Binds close button and outside click listeners.
   */
  bindEvents() {
    const closeBtn = document.getElementById("btn-close-history");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.close());
    }
  }

  /**
   * Toggles drawer open or closed.
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    if (this.drawerEl) {
      this.drawerEl.classList.add("open");
      this.isOpen = true;
    }
  }

  close() {
    if (this.drawerEl) {
      this.drawerEl.classList.remove("open");
      this.isOpen = false;
    }
  }

  /**
   * Populates the drawer list with historical run cards.
   * @param {Array<Object>} runs - List of history item summaries
   */
  renderItems(runs) {
    if (!this.listEl) return;

    if (!runs || runs.length === 0) {
      this.listEl.innerHTML = `
        <div style="font-size: 13px; color: #94a3b8; text-align: center; padding: 20px;">
          No historical runs recorded yet.
        </div>
      `;
      return;
    }

    this.listEl.innerHTML = runs
      .map((run) => {
        const dateStr = new Date(run.created_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });

        return `
          <div class="history-item-card" data-run-id="${run.id}">
            <div class="history-item-title">${run.run_label || "Analysis Zone"}</div>
            <div class="history-item-meta" style="margin-bottom: 6px;">
              <span>🗓️ ${dateStr}</span>
              <span style="color: #10b981; font-weight: 600;">${run.green_cover_percentage}% Green</span>
            </div>
            <div class="history-item-meta">
              <span>NDVI: <strong>${run.mean_ndvi}</strong></span>
              <span>Area: <strong>${run.total_area_hectares} ha</strong></span>
            </div>
          </div>
        `;
      })
      .join("");

    // Attach click listeners to cards
    this.listEl.querySelectorAll(".history-item-card").forEach((card) => {
      card.addEventListener("click", () => {
        const runId = card.getAttribute("data-run-id");
        if (this.onSelectRun && typeof this.onSelectRun === "function") {
          this.onSelectRun(runId);
        }
        this.close();
      });
    });
  }
}

