/**
 * @file main.js
 * @description Frontend Application Bootstrap and View Orchestrator (Phase 1.5).
 * Aligned with Global Nature Watch: full-width top navigation bar, primary links
 * (MAP, DASHBOARD, METHODOLOGY), Left Panel (LEGEND & ANALYSIS), PostGIS Dashboard,
 * watermark-free world map, and global location search.
 */

import { MapManager } from "./features/map/mapManager.js";
import { DrawTool } from "./features/map/drawTool.js";
import { NdviLayerManager } from "./features/layers/ndviLayer.js";
import { LegendControl } from "./features/layers/legend.js";
import { HistoryDrawer } from "./features/history/historyDrawer.js";

document.addEventListener("DOMContentLoaded", () => {
  // 1. Initialize Map Manager (Global World View [lng: 15.0, lat: 20.0], Zoom 2.5)
  const mapManager = new MapManager("map", {
    center: [15.0, 20.0],
    zoom: 2.5
  });
  const map = mapManager.init();

  // 2. Initialize Layer Manager
  const ndviLayers = new NdviLayerManager(map);

  // 3. Initialize Legend Module inside the Left Sidebar's LEGEND tab
  const legend = new LegendControl("tab-content-legend", {
    onOpacityChange: (opacity) => {
      ndviLayers.setOpacity(opacity);
    },
    onVisibilityToggle: (isVisible) => {
      if (isVisible) {
        // Restore opacity if layer exists
        ndviLayers.setOpacity(legend.currentOpacity / 100.0);
      } else {
        // Mute layer visibility
        ndviLayers.setOpacity(0.0);
      }
    }
  });
  legend.render();

  // 4. Initialize Polygon Vector Drawing Tool & Floating Toolbar
  const drawTool = new DrawTool(map, {
    onPolygonComplete: (geometry) => {
      showSearchToast("Custom AOI polygon captured.", "success");

      // Switch to ANALYSIS tab automatically to guide the user
      switchSidebarTab("analysis");

      const emptyStateTitle = document.querySelector("#analysis-empty-state .empty-state-title");
      if (emptyStateTitle) {
        emptyStateTitle.textContent = "Boundary Ready for Analysis";
      }
      const emptyStateDesc = document.querySelector("#analysis-empty-state .empty-state-desc");
      if (emptyStateDesc) {
        emptyStateDesc.textContent = `Polygon geometry registered with ${geometry.coordinates[0].length} vertices. Click "Analyze Area" in the top navbar to compute real-time NDVI canopy coverage.`;
      }
    },
    onPolygonClear: () => {
      ndviLayers.removeCurrentLayer();
      const emptyStateTitle = document.querySelector("#analysis-empty-state .empty-state-title");
      if (emptyStateTitle) {
        emptyStateTitle.textContent = "No AOI Boundary Selected";
      }
      const emptyStateDesc = document.querySelector("#analysis-empty-state .empty-state-desc");
      if (emptyStateDesc) {
        emptyStateDesc.textContent = "Select or draw a custom polygon boundary on the map to analyze Sentinel-2 vegetation canopy coverage and compute real-time NDVI indices.";
      }
    },
    onAnalyzeClick: (geometry) => {
      showSearchToast(`AOI ready with ${geometry.coordinates[0].length} vertices. Backend analysis API connects in Phase 2!`, "success");
    }
  });

  // 5. Initialize Analytics & PostGIS Spatial History Dashboard
  const historyDashboard = new HistoryDrawer({
    containerId: "history-table-container",
    onSelectRun: (runId, runData) => {
      // 1. Switch back to MAP view
      switchPrimaryView("map");

      // 2. Render polygon boundary and fly to coordinates
      if (runData && runData.geometry) {
        drawTool.renderPolygon(runData.geometry);
        mapManager.fitToCoordinates(runData.geometry.coordinates);
      }

      // 3. Switch sidebar tab to ANALYSIS
      switchSidebarTab("analysis");

      const emptyStateTitle = document.querySelector("#analysis-empty-state .empty-state-title");
      if (emptyStateTitle) {
        emptyStateTitle.textContent = runData.run_label || "Recalled AOI Analysis";
      }
      const emptyStateDesc = document.querySelector("#analysis-empty-state .empty-state-desc");
      if (emptyStateDesc) {
        emptyStateDesc.innerHTML = `
          <strong>Recalled from PostGIS:</strong><br/>
          Surface Area: <strong>${runData.total_area_hectares} ha</strong> | 
          Mean NDVI: <strong>${runData.mean_ndvi}</strong> | 
          Green Cover: <strong style="color: #bef264;">${runData.green_cover_percentage}%</strong>
        `;
      }

      showSearchToast(`Recalled "${runData.run_label}" on map.`, "success");
    }
  });

  // ======================================================================
  // 6. Primary Top Navbar Navigation (MAP | DASHBOARD | METHODOLOGY)
  // ======================================================================
  const navBtnMap = document.getElementById("nav-btn-map");
  const navBtnDashboard = document.getElementById("nav-btn-dashboard");
  const navBtnMethodology = document.getElementById("nav-btn-methodology");
  const mapView = document.getElementById("map-view");
  const dashboardView = document.getElementById("dashboard-view");
  const btnDashboardBackMap = document.getElementById("btn-dashboard-back-map");

  function switchPrimaryView(viewName) {
    if (viewName === "map") {
      navBtnMap.classList.add("active");
      navBtnDashboard.classList.remove("active");
      mapView.style.display = "block";
      dashboardView.style.display = "none";
      mapManager.invalidateSize();
    } else if (viewName === "dashboard") {
      navBtnDashboard.classList.add("active");
      navBtnMap.classList.remove("active");
      mapView.style.display = "none";
      dashboardView.style.display = "block";
    }
  }

  if (navBtnMap) {
    navBtnMap.addEventListener("click", () => switchPrimaryView("map"));
  }

  if (navBtnDashboard) {
    navBtnDashboard.addEventListener("click", () => switchPrimaryView("dashboard"));
  }

  if (btnDashboardBackMap) {
    btnDashboardBackMap.addEventListener("click", () => switchPrimaryView("map"));
  }

  // ======================================================================
  // 7. Left Sidebar Navigation (LEGEND | ANALYSIS) & Collapse
  // ======================================================================
  const tabBtnLegend = document.getElementById("tab-btn-legend");
  const tabBtnAnalysis = document.getElementById("tab-btn-analysis");
  const tabContentLegend = document.getElementById("tab-content-legend");
  const tabContentAnalysis = document.getElementById("tab-content-analysis");
  const sidebar = document.getElementById("sidebar-panel");
  const btnCollapse = document.getElementById("btn-sidebar-collapse");
  const btnOpen = document.getElementById("btn-sidebar-open");

  function switchSidebarTab(tabName) {
    if (tabName === "legend") {
      tabBtnLegend.classList.add("active");
      tabBtnLegend.setAttribute("aria-selected", "true");
      tabBtnAnalysis.classList.remove("active");
      tabBtnAnalysis.setAttribute("aria-selected", "false");
      tabContentLegend.style.display = "flex";
      tabContentAnalysis.style.display = "none";
    } else if (tabName === "analysis") {
      tabBtnAnalysis.classList.add("active");
      tabBtnAnalysis.setAttribute("aria-selected", "true");
      tabBtnLegend.classList.remove("active");
      tabBtnLegend.setAttribute("aria-selected", "false");
      tabContentAnalysis.style.display = "flex";
      tabContentLegend.style.display = "none";
    }
  }

  if (tabBtnLegend) {
    tabBtnLegend.addEventListener("click", () => switchSidebarTab("legend"));
  }

  if (tabBtnAnalysis) {
    tabBtnAnalysis.addEventListener("click", () => switchSidebarTab("analysis"));
  }

  if (btnCollapse && sidebar && btnOpen) {
    btnCollapse.addEventListener("click", () => {
      sidebar.classList.add("collapsed");
      btnOpen.classList.add("visible");
    });

    btnOpen.addEventListener("click", () => {
      sidebar.classList.remove("collapsed");
      btnOpen.classList.remove("visible");
    });
  }

  // ======================================================================
  // 8. Top-Right Global Location Search (Worldwide Geocoding)
  // ======================================================================
  const searchInput = document.getElementById("search-input");
  const btnSearch = document.getElementById("btn-search");
  const btnClearSearch = document.getElementById("btn-clear-search");
  const searchFeedback = document.getElementById("search-feedback");

  let feedbackTimer = null;
  function showSearchToast(message, type = "info") {
    if (!searchFeedback) return;
    if (feedbackTimer) clearTimeout(feedbackTimer);

    searchFeedback.textContent = message;
    searchFeedback.className = `search-feedback-toast ${type}`;
    searchFeedback.style.display = "block";

    feedbackTimer = setTimeout(() => {
      searchFeedback.style.display = "none";
    }, 4500);
  }

  async function executeSearch() {
    if (!searchInput) return;
    const query = searchInput.value.trim();
    if (!query) return;

    // Switch to map view if currently in dashboard
    switchPrimaryView("map");

    showSearchToast(`Locating "${query}"...`, "info");
    const result = await mapManager.searchLocation(query);

    if (result.success) {
      showSearchToast(`Jumped to: ${result.message}`, "success");
    } else {
      showSearchToast(result.message, "error");
    }
  }

  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        executeSearch();
      }
    });

    searchInput.addEventListener("input", () => {
      if (btnClearSearch) {
        btnClearSearch.style.display = searchInput.value.length > 0 ? "block" : "none";
      }
    });
  }

  if (btnSearch) {
    btnSearch.addEventListener("click", () => executeSearch());
  }

  if (btnClearSearch && searchInput) {
    btnClearSearch.addEventListener("click", () => {
      searchInput.value = "";
      btnClearSearch.style.display = "none";
      searchInput.focus();
    });
  }

  // ======================================================================
  // 9. Methodology & About Modal Dialog
  // ======================================================================
  const aboutModal = document.getElementById("about-modal");
  const btnCloseAbout = document.getElementById("btn-close-about");
  const btnModalDismiss = document.getElementById("btn-modal-dismiss");

  const openModal = () => {
    if (aboutModal) aboutModal.style.display = "flex";
  };

  const closeModal = () => {
    if (aboutModal) aboutModal.style.display = "none";
  };

  if (navBtnMethodology) navBtnMethodology.addEventListener("click", openModal);
  if (btnCloseAbout) btnCloseAbout.addEventListener("click", closeModal);
  if (btnModalDismiss) btnModalDismiss.addEventListener("click", closeModal);

  if (aboutModal) {
    aboutModal.addEventListener("click", (e) => {
      if (e.target === aboutModal) closeModal();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && aboutModal.style.display === "flex") {
        closeModal();
      }
    });
  }
});
