/**
 * @file main.js
 * @description Frontend Application Bootstrap and Orchestrator.
 * Wires together MapManager, DrawTool, dynamic NDVI tile layers, StatsPanel,
 * InsightsCard, and HistoryDrawer with centralized API client communication.
 */

import { checkSystemHealth, submitAnalyzeRequest, fetchAnalysisHistory, fetchHistoryDetail } from "./api/apiClient.js";
import { MapManager } from "./features/map/mapManager.js";
import { DrawTool } from "./features/map/drawTool.js";
import { NdviLayerManager } from "./features/layers/ndviLayer.js";
import { LegendControl } from "./features/layers/legend.js";
import { StatsPanel } from "./features/dashboard/statsPanel.js";
import { InsightsCard } from "./features/insights/insightsCard.js";
import { HistoryDrawer } from "./features/history/historyDrawer.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Loading spinner helper
  const loadingOverlay = document.getElementById("loading-overlay");
  const setLoading = (isLoading) => {
    if (loadingOverlay) {
      loadingOverlay.classList.toggle("active", Boolean(isLoading));
    }
  };

  // 2. Initialize Core Map
  const mapManager = new MapManager("map");
  const map = mapManager.init();

  // 3. Initialize Feature Modules
  const ndviLayers = new NdviLayerManager(map);
  const legend = new LegendControl("legend-container");
  legend.render();

  const statsPanel = new StatsPanel("stats-panel-container");
  const insightsCard = new InsightsCard("insights-panel-container");

  // 4. Initialize History Drawer & Click-to-Recall handler
  const historyDrawer = new HistoryDrawer({
    drawerId: "history-drawer",
    listId: "history-list",
    onSelectRun: async (runId) => {
      try {
        setLoading(true);
        const detail = await fetchHistoryDetail(runId);

        // Render recalled boundary polygon & zoom map to fit
        if (detail.geometry) {
          drawTool.renderPolygon(detail.geometry);
          mapManager.fitToCoordinates(detail.geometry.coordinates);
        }

        // Apply dynamic NDVI raster overlay if URL template provided
        if (detail.tile_url_template) {
          ndviLayers.setNdviLayer(detail.tile_url_template);
        }

        // Populate Dashboard & Insights
        statsPanel.update(detail);
        if (detail.insights) {
          insightsCard.update(detail.insights);
        }
      } catch (err) {
        console.error("Failed to recall history run:", err);
        alert(`Error loading analysis: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }
  });

  // 5. Initialize Polygon Drawing Tool & Submit Analysis Handler
  const drawTool = new DrawTool(map, async (polygonGeometry) => {
    try {
      setLoading(true);
      const analysisResult = await submitAnalyzeRequest(polygonGeometry);

      // Mount returned GEE XYZ raster overlay
      if (analysisResult.tile_url_template) {
        ndviLayers.setNdviLayer(analysisResult.tile_url_template);
      }

      // Update Dashboard Stats Panel
      statsPanel.update(analysisResult);

      // Update Environmental Insights Cards
      if (analysisResult.insights_summary) {
        insightsCard.update(analysisResult.insights_summary);
      }

      // Refresh History Drawer list in background
      loadHistoryList();
    } catch (err) {
      console.error("Analysis request failed:", err);
      alert(`Analysis processing error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  });

  // 6. Header Action Buttons
  const btnDraw = document.getElementById("btn-draw-aoi");
  if (btnDraw) {
    btnDraw.addEventListener("click", () => drawTool.startPolygonDraw());
  }

  const btnClear = document.getElementById("btn-clear-aoi");
  if (btnClear) {
    btnClear.addEventListener("click", () => {
      drawTool.clear();
      ndviLayers.removeCurrentLayer();
      statsPanel.renderPlaceholder();
      insightsCard.renderPlaceholder();
    });
  }

  const btnToggleHistory = document.getElementById("btn-toggle-history");
  if (btnToggleHistory) {
    btnToggleHistory.addEventListener("click", () => {
      historyDrawer.toggle();
      if (historyDrawer.isOpen) {
        loadHistoryList();
      }
    });
  }

  // 7. Helper to load and render history items
  async function loadHistoryList() {
    try {
      const data = await fetchAnalysisHistory();
      historyDrawer.renderItems(data.items || []);
    } catch (err) {
      console.warn("Could not retrieve history runs:", err);
    }
  }

  // 8. Health Check on startup
  async function performHealthCheck() {
    const statusText = document.getElementById("status-text");
    const statusBadge = document.getElementById("connection-status");
    const health = await checkSystemHealth();

    if (health.status === "ok") {
      if (statusText) statusText.textContent = "Backend Online";
      if (statusBadge) statusBadge.style.borderColor = "rgba(16, 185, 129, 0.4)";
    } else {
      if (statusText) statusText.textContent = "Backend Offline (Mock Mode)";
      if (statusBadge) {
        statusBadge.style.color = "#f59e0b";
        statusBadge.style.background = "rgba(245, 158, 11, 0.15)";
        statusBadge.style.borderColor = "rgba(245, 158, 11, 0.3)";
      }
    }
  }

  // Initial Startup
  await performHealthCheck();
  loadHistoryList();
});

