/**
 * @file pdfReportGenerator.js
 * @description Generates a comprehensive, multi-section PDF study report for urban forestry researchers,
 * planners, and municipal stakeholders. Embeds high-DPI canvas charts, tightly-zoomed AOI heatmap snapshot,
 * canopy tier tables, health score breakdown, priority interventions, and recommended flora.
 * Features an uncrowded, natural 4-5 page layout, single-source pdfSafeText unicode mapping (preventing stray slashes
 * and letter-spacing gaps), canvas clipping fixes, and per-block fit checks.
 */

/**
 * Single source of truth for sanitizing strings before rendering in jsPDF Helvetica (WinAnsiEncoding).
 * Maps characters above U+00FF to safe ASCII/Latin-1 equivalents so that narrow spaces (U+202F) do not truncate
 * to "/" and non-breaking hyphens (U+2011) do not vanish.
 * @param {string} str 
 * @returns {string}
 */
export function pdfSafeText(str) {
  if (!str) return "";
  let text = String(str);

  // 1. Explicit character mapping
  // Hyphens / Dashes: U+2010, U+2011, U+2012, U+2013, U+2014, U+2212 -> "-"
  text = text.replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-");

  // Spaces: U+00A0, U+2002-U+200A, U+202F, U+205F, U+3000 -> " "
  text = text.replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ");

  // Zero-width & control chars: U+200B, U+200C, U+200D, U+2060, U+FEFF, U+00AD -> ""
  text = text.replace(/[\u200B\u200C\u200D\u2060\uFEFF\u00AD]/g, "");

  // Quotes: curly single -> ', curly double -> "
  text = text.replace(/[\u2018\u2019\u201A\u201B]/g, "'");
  text = text.replace(/[\u201C\u201D\u201E\u201F]/g, '"');

  // Punctuation & symbols
  text = text.replace(/\u2022/g, "-");    // bullet
  text = text.replace(/\u2026/g, "...");  // ellipsis
  text = text.replace(/\u2265/g, ">=");   // greater-than-or-equal
  text = text.replace(/\u2264/g, "<=");   // less-than-or-equal
  text = text.replace(/\u2260/g, "!=");   // not equal
  text = text.replace(/\u2248/g, "~");    // almost equal
  text = text.replace(/\u2192/g, "->");   // rightwards arrow
  text = text.replace(/\u00B1/g, "+/-");  // plus-minus

  // Clean raw LaTeX math delimiters ($...$, $$, \text, ^{...})
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, "$1");
  text = text.replace(/\$([^\$]+)\$/g, "$1");
  text = text.replace(/\\text\{([^}]+)\}/g, "$1");
  text = text.replace(/\^\{([^}]+)\}/g, "$1");
  text = text.replace(/\\ge\b/g, ">=");
  text = text.replace(/\\le\b/g, "<=");
  text = text.replace(/\\times\b/g, "x");
  text = text.replace(/\\pm\b/g, "+/-");
  text = text.replace(/\\Delta\b/g, "Delta ");
  text = text.replace(/\\%/g, "%");
  text = text.replace(/\\_/g, "_");
  text = text.replace(/\\[a-zA-Z]+\{([^}]+)\}/g, "$1");
  text = text.replace(/\\[a-zA-Z]+/g, "");

  // Clean markdown tokens
  text = text.replace(/\*\*(.*?)\*\*/g, "$1");
  text = text.replace(/\*(.*?)\*/g, "$1");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/~~(.*?)~~/g, "$1");

  // Replace invasive weed Lantana camara with true native shrub
  text = text.replace(/Lantana\s+camara/gi, "Carissa spinarum (Karanda / Wild Karavanda)");
  text = text.replace(/Lantana/gi, "Carissa spinarum");

  // 2. Unicode normalization (NFKC)
  text = text.normalize("NFKC");

  // 3. Whitelist: Strip anything not in [\x09\x0A\x20-\x7E\xA0-\xFF] (keeps °, ×, ±, latin-1)
  text = text.replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, "");

  // 4. Collapse runs of spaces/tabs to a single space
  text = text.replace(/[ \t]+/g, " ");

  // 5. Clean space before percentage: "(\d) %" -> "$1%"
  text = text.replace(/(\d)\s+%/g, "$1%");

  // 6. Clean stray slashes and artifacts
  text = text.replace(/\/\%/g, "%");
  text = text.replace(/\s*\/\s*<\s*/g, " < ");
  text = text.replace(/\s*\/\s*>\s*/g, " > ");
  text = text.replace(/\s*\/ha\b/g, " ha");
  text = text.replace(/MODERAT\s*\/\s*E/gi, "MODERATE");
  text = text.replace(/\/{2,}\s*\//g, " / ");
  text = text.replace(/\/{3,}/g, " / ");

  return text.trim();
}

/**
 * Backwards compatible alias for pdfSafeText.
 * @param {string} str 
 * @returns {string}
 */
function cleanLatexAndFormatting(str) {
  return pdfSafeText(str);
}

/**
 * Creates high-DPI canvas for offscreen chart rendering.
 * @param {number} width 
 * @param {number} height 
 * @returns {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D }}
 */
function createHiDpiCanvas(width, height) {
  const canvas = document.createElement("canvas");
  const scale = 2; // 2x retina scale for crisp PDF embedding
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  return { canvas, ctx };
}

/**
 * Renders a crisp 2x Retina horizontal distribution chart of canopy density tiers
 * with a direct comparison to the WHO 30% municipal canopy benchmark.
 * Canvas height is 220 px to guarantee >= 16 px clearance below the WHO 30% Target label.
 * @param {Object} stats - Zonal statistics object
 * @param {number} totalHa - Total area in hectares
 * @param {number} greenPct - Overall green cover percentage
 * @returns {string} Base64 PNG data URL
 */
function renderCanopyTiersVsTargetChart(stats, totalHa, greenPct) {
  const canvasHeight = 220;
  const { canvas, ctx } = createHiDpiCanvas(520, canvasHeight);

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 520, canvasHeight);

  // Border (with full canvas height, never cutting off bottom text)
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, 520, canvasHeight);

  // Title & Subtitle
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 12px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Vegetation & Canopy Tier Distribution vs. WHO 30% Target", 15, 20);

  ctx.fillStyle = "#64748b";
  ctx.font = "9.5px Inter, sans-serif";
  ctx.fillText("Copernicus Sentinel-2 multispectral NDVI tier coverage & municipal surplus/deficit benchmark", 15, 34);

  const denseVal = Number(stats.dense_pct != null ? stats.dense_pct : 0);
  const modVal = Number(stats.moderate_pct != null ? stats.moderate_pct : 0);
  const sparseVal = Number(stats.sparse_pct != null ? stats.sparse_pct : 0);
  const nonVegVal = Number(stats.non_veg_pct != null ? stats.non_veg_pct : stats.deficit_pct || 0);

  const tiers = [
    { label: "Dense Tree Canopy (NDVI >= 0.60)", pct: denseVal, color: "#059669" },
    { label: "Moderate Canopy / Shrubs (0.40 <= NDVI < 0.60)", pct: modVal, color: "#10b981" },
    { label: "Sparse / Open Ground (0.20 <= NDVI < 0.40)", pct: sparseVal, color: "#f59e0b" },
    { label: "Built-up / Deficit Surfaces (NDVI < 0.20)", pct: nonVegVal, color: "#f43f5e" }
  ];

  const startY = 48;
  const rowSpacing = 26;
  const maxBarWidth = 330;

  tiers.forEach((tier, i) => {
    const y = startY + i * rowSpacing;

    // Label
    ctx.fillStyle = "#334155";
    ctx.font = "10px Inter, sans-serif";
    ctx.fillText(tier.label, 15, y + 8);

    // Track background
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(15, y + 12, maxBarWidth, 7);

    // Value bar
    const barW = Math.min(maxBarWidth, Math.max(3, (tier.pct / 100.0) * maxBarWidth));
    ctx.fillStyle = tier.color;
    ctx.fillRect(15, y + 12, barW, 7);

    // Value text
    const haVal = ((tier.pct / 100.0) * totalHa).toFixed(1);
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 9.5px Inter, sans-serif";
    ctx.fillText(`${tier.pct.toFixed(1)}% (${haVal} ha)`, maxBarWidth + 24, y + 18);
  });

  // Separator rule
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(15, 156);
  ctx.lineTo(505, 156);
  ctx.stroke();

  // Bottom Row: Combined Canopy Cover vs WHO 30% Benchmark
  const benchY = 166;
  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 9.5px Inter, sans-serif";
  ctx.fillText("Active Canopy Coverage vs WHO 30% Municipal Benchmark:", 15, benchY - 2);

  // Active Percentage Label placed ABOVE the track to guarantee zero overlap with WHO marker below
  const activeW = Math.min(maxBarWidth, Math.max(3, (greenPct / 100.0) * maxBarWidth));
  ctx.fillStyle = greenPct >= 30.0 ? "#059669" : "#b45309";
  ctx.font = "bold 9px Inter, sans-serif";
  const activeLabelText = `${greenPct.toFixed(1)}% Active Canopy Cover`;
  const labelX = Math.min(maxBarWidth - 110, Math.max(15, activeW - 40));
  ctx.fillText(activeLabelText, Math.max(15, labelX), benchY + 10);

  // Benchmark Bar Track
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(15, benchY + 14, maxBarWidth, 12);

  // Active Green Cover Fill
  ctx.fillStyle = greenPct >= 30.0 ? "#059669" : "#f59e0b";
  ctx.fillRect(15, benchY + 14, activeW, 12);

  // WHO 30% Target Line
  const targetX = 15 + (30.0 / 100.0) * maxBarWidth;
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(targetX, benchY + 12);
  ctx.lineTo(targetX, benchY + 28);
  ctx.stroke();

  // Target Marker Label placed strictly BELOW the track (vertical separation >= 28 pt from Active label)
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 8.5px Inter, sans-serif";
  ctx.fillText("WHO 30% Target", targetX - 35, benchY + 38);

  // Surplus / Deficit Badge
  const isSurplus = greenPct >= 30.0;
  const diffPct = Math.abs(greenPct - 30.0).toFixed(1);
  const diffHa = Math.abs((diffPct / 100.0) * totalHa).toFixed(1);
  const badgeText = isSurplus ? `+${diffPct}% Canopy Surplus (+${diffHa} ha)` : `-${diffPct}% Canopy Deficit (-${diffHa} ha)`;

  ctx.fillStyle = isSurplus ? "#ecfdf5" : "#fff1f2";
  ctx.strokeStyle = isSurplus ? "#10b981" : "#f43f5e";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(355, benchY + 8, 150, 20, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isSurplus ? "#065f46" : "#9f1239";
  ctx.font = "bold 8.5px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(badgeText, 430, benchY + 21);
  ctx.textAlign = "left";

  return canvas.toDataURL("image/png");
}

/**
 * Renders the Canopy Health Score gauge, mathematical component weights,
 * and temporal observation baseline indicator with wrapped multi-line subtitle.
 * @param {number} healthScore 
 * @param {number} ndviPts 
 * @param {number} coverPts 
 * @param {string} bandLabel 
 * @param {Object} [comparisonData] 
 * @returns {string} Base64 PNG data URL
 */
function renderHealthScoreBreakdownChart(healthScore, ndviPts, coverPts, bandLabel, comparisonData = null) {
  const { canvas, ctx } = createHiDpiCanvas(520, 180);

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 520, 180);

  // Border
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, 520, 180);

  // Title & Subtitle
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 12px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Canopy Health Score: Mathematical Component Breakdown", 15, 20);

  ctx.fillStyle = "#64748b";
  ctx.font = "9.5px Inter, sans-serif";
  ctx.fillText("Deterministic calculation: (Mean NDVI x 60.0 pts vigor) + (Green Cover % x 0.4 pts extent)", 15, 34);

  // Left Section: Score Circular Badge
  const badgeX = 65;
  const badgeY = 92;
  const radius = 38;

  // Arc Background
  ctx.strokeStyle = "#f1f5f9";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Arc Progress Fill
  const scorePct = Math.min(100, Math.max(0, healthScore)) / 100.0;
  const arcColor = healthScore >= 80 ? "#10b981" : healthScore >= 65 ? "#06b6d4" : healthScore >= 45 ? "#f59e0b" : "#f43f5e";
  ctx.strokeStyle = arcColor;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, radius, -Math.PI / 2, -Math.PI / 2 + scorePct * Math.PI * 2);
  ctx.stroke();

  // Score Text inside Badge
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 22px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${healthScore}`, badgeX, badgeY + 4);

  ctx.fillStyle = "#64748b";
  ctx.font = "9.5px Inter, sans-serif";
  ctx.fillText("/ 100", badgeX, badgeY + 17);

  // Significance Band Pill under Gauge
  ctx.fillStyle = healthScore >= 80 ? "#ecfdf5" : healthScore >= 65 ? "#eff6ff" : healthScore >= 45 ? "#fffbeb" : "#fff1f2";
  ctx.strokeStyle = arcColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(badgeX - 52, badgeY + 28, 104, 15, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = healthScore >= 80 ? "#065f46" : healthScore >= 65 ? "#1e40af" : healthScore >= 45 ? "#92400e" : "#9f1239";
  ctx.font = "bold 7.5px Inter, sans-serif";
  ctx.fillText(bandLabel.toUpperCase(), badgeX, badgeY + 39);
  ctx.textAlign = "left";

  // Right Section: Component Bars
  const rightX = 135;
  const barW = 365;

  // Component 1: NDVI Vigor (Max 60 pts)
  ctx.fillStyle = "#334155";
  ctx.font = "bold 10px Inter, sans-serif";
  ctx.fillText("Photosynthetic Vigor & LAI Density (Mean NDVI x 60.0):", rightX, 58);
  ctx.fillStyle = "#0284c7";
  ctx.fillText(`${ndviPts.toFixed(1)} / 60.0 pts`, rightX + barW - 65, 58);

  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(rightX, 64, barW, 8);
  const ndviW = Math.min(barW, Math.max(3, (ndviPts / 60.0) * barW));
  ctx.fillStyle = "#0284c7";
  ctx.fillRect(rightX, 64, ndviW, 8);

  // Component 2: Spatial Coverage (Max 40 pts)
  ctx.fillStyle = "#334155";
  ctx.font = "bold 10px Inter, sans-serif";
  ctx.fillText("Spatial Canopy Coverage Extent (Green Cover % x 0.4):", rightX, 94);
  ctx.fillStyle = "#10b981";
  ctx.fillText(`${coverPts.toFixed(1)} / 40.0 pts`, rightX + barW - 65, 94);

  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(rightX, 100, barW, 8);
  const coverW = Math.min(barW, Math.max(3, (coverPts / 40.0) * barW));
  ctx.fillStyle = "#10b981";
  ctx.fillRect(rightX, 100, coverW, 8);

  // Baseline / Temporal Observation Status Card (Expanded height & wrapped 2-line text)
  const boxY = 122;
  const boxH = 46; // expanded to 46 px so 2 lines wrap with comfortable padding
  ctx.fillStyle = "#f8fafc";
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(rightX, boxY, barW, boxH, 4);
  ctx.fill();
  ctx.stroke();

  const hasComparison = comparisonData && (comparisonData.delta_ndvi != null || comparisonData.mean_delta_ndvi != null);
  if (hasComparison) {
    const deltaVal = Number(comparisonData.delta_ndvi != null ? comparisonData.delta_ndvi : comparisonData.mean_delta_ndvi);
    const sign = deltaVal >= 0 ? "+" : "";
    const histDate = (comparisonData.historical_date || "Historical Baseline").toString().split("T")[0];

    ctx.fillStyle = deltaVal >= 0 ? "#059669" : "#e11d48";
    ctx.font = "bold 9px Inter, sans-serif";
    ctx.fillText(`Temporal Comparison Delta: NDVI ${sign}${deltaVal.toFixed(3)} (${deltaVal >= 0 ? "Canopy Gain" : "Canopy Loss"})`, rightX + 10, boxY + 16);

    ctx.fillStyle = "#64748b";
    ctx.font = "8px Inter, sans-serif";
    ctx.fillText(`Comparison Baseline: ${histDate} vs. Active Observation Date.`, rightX + 10, boxY + 32);
  } else {
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 9px Inter, sans-serif";
    ctx.fillText("Observation Baseline: Single-Date Sentinel-2 Composite (Empirical Telemetry)", rightX + 10, boxY + 16);

    ctx.fillStyle = "#64748b";
    ctx.font = "8px Inter, sans-serif";
    // Wrapped into 2 clean lines to guarantee zero clipping at card edge
    ctx.fillText("Multispectral reflectance verified. Multi-date comparison", rightX + 10, boxY + 28);
    ctx.fillText("activated when historical pass is selected.", rightX + 10, boxY + 39);
  }

  return canvas.toDataURL("image/png");
}

/**
 * Accurately measures card line wraps and computes required container height
 * BEFORE drawing any background or border.
 * Applies a 2% safety margin to availableWidth to guarantee zero horizontal overflow.
 * Formula: blockHeight = (totalLines * lineHeight) + (2 * verticalPadding)
 * @param {Object} doc - jsPDF instance
 * @param {Object} options - Measurement options
 * @returns {Object} Measured dimensions and text line arrays
 */
function measureCard(doc, {
  title = "",
  text = "",
  width,
  topPadding = 12,
  bottomPadding = 14,
  sidePadding = 14,
  titleSize = 9.5,
  fontSize = 8.5,
  lineHeightFactor = 1.38
}) {
  const cleanTitle = pdfSafeText(title);
  const cleanText = pdfSafeText(text);
  // Apply 2% safety margin on available inner width
  const innerWidth = Math.max(50, (width - sidePadding * 2) * 0.98);

  // Measure title lines with identical font state
  doc.setFont("helvetica", "bold");
  doc.setFontSize(titleSize);
  if (doc.setCharSpace) doc.setCharSpace(0);
  const titleLines = cleanTitle ? doc.splitTextToSize(cleanTitle, innerWidth) : [];
  const titleLineHeight = titleSize * 1.32;
  const titleTotalHeight = titleLines.length > 0 ? titleLines.length * titleLineHeight + 5 : 0;

  // Measure body lines with identical font state
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  if (doc.setCharSpace) doc.setCharSpace(0);
  const textLines = cleanText ? doc.splitTextToSize(cleanText, innerWidth) : [];
  const textLineHeight = fontSize * lineHeightFactor;
  const textTotalHeight = textLines.length > 0 ? textLines.length * textLineHeight : 0;

  const minHeight = 28;
  const boxHeight = Math.max(minHeight, topPadding + titleTotalHeight + textTotalHeight + bottomPadding);

  return {
    boxHeight,
    titleLines,
    titleLineHeight,
    textLines,
    textLineHeight,
    innerWidth
  };
}

/**
 * Generates and downloads a clean, multi-section researcher study report in PDF format.
 * Features an uncrowded, natural 4-5 page layout, single-source pdfSafeText unicode mapping,
 * and per-block fit checks.
 * @param {Object} options
 * @param {Object} options.telemetry - Active telemetry metrics & geometry
 * @param {Object} options.insights - Synthesized AI insights response payload
 * @param {string|null} [options.mapSnapshot] - Optional base64 map canvas snapshot
 * @param {boolean} [options.returnDoc] - When true, returns { filename, doc } instead of triggering download
 */
export async function generatePdfReport({ telemetry, insights, mapSnapshot = null, returnDoc = false }) {
  const jsPdfLib = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : null;
  if (!jsPdfLib) {
    throw new Error("jsPDF library is not loaded. Please verify internet connection for CDN scripts.");
  }

  const doc = new jsPdfLib({
    orientation: "portrait",
    unit: "pt",
    format: "a4" // 595.28 x 841.89 pt
  });

  // Ensure standard, un-stretched character spacing everywhere
  if (doc.setCharSpace) {
    doc.setCharSpace(0);
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const bottomMargin = 48; // Generous 48 pt bottom margin
  const contentWidth = 515; // Standard 515 pt printable width
  let y = margin;

  const t = telemetry || {};
  const stats = t.stats || {};
  const rawAreaName = t.area_name || t.run_label || t.studyAreaName || "Custom Selected Area";
  const areaName = pdfSafeText(rawAreaName);
  const totalHa = Number(t.total_area_hectares || stats.area_ha || 1.0);
  const greenPct = Number(t.green_cover_percentage || stats.green_cover_pct || 0.0);
  const meanNdvi = Number(t.mean_ndvi || stats.mean_ndvi || 0.0);
  const satDate = pdfSafeText((t.satellite_date_used || t.acquisition_date || "Recent Composite").toString().split("T")[0]);
  const analysisId = pdfSafeText(t.analysis_id || t.id || "N/A");

  const ndviPts = meanNdvi * 60.0;
  const coverPts = greenPct * 0.4;
  const calculatedScore = Math.round(Math.min(100, Math.max(5, ndviPts + coverPts)));
  const healthScore = Math.round(insights.health_score != null ? insights.health_score : calculatedScore);
  const healthStatus = pdfSafeText(insights.overall_health_status || "Canopy Assessment");
  const coolingRating = pdfSafeText(insights.cooling_capacity_index || "Moderate");
  const deficitHa = insights.green_deficit_hectares != null ? Number(insights.green_deficit_hectares) : 0.0;
  const treesNeeded = insights.estimated_trees_needed || 0;

  let bandLabel = "Moderate Canopy (45-64)";
  if (healthScore >= 80) bandLabel = "Optimal Canopy (80-100)";
  else if (healthScore >= 65) bandLabel = "Good Canopy (65-79)";
  else if (healthScore < 45) bandLabel = "Critical Deficit (< 45)";

  // Helper: check page break before drawing any block
  function ensurePageBreak(neededHeight) {
    if (y + neededHeight > pageHeight - bottomMargin) {
      doc.addPage();
      y = margin;
      if (doc.setCharSpace) doc.setCharSpace(0);
      return true;
    }
    return false;
  }

  // Helper: draw section banner with generous vertical spacing
  function drawSectionBanner(title, iconText = "") {
    ensurePageBreak(36);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 24, "F");
    doc.setFillColor(99, 102, 241); // indigo-500
    doc.rect(margin, y, 4, 24, "F");

    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    if (doc.setCharSpace) doc.setCharSpace(0);
    doc.text(`${iconText ? iconText + "  " : ""}${pdfSafeText(title).toUpperCase()}`, margin + 12, y + 16, { align: "left" });
    y += 32;
  }

  /**
   * Draws a clean, left-aligned rounded text card with measurement-first dynamic containment,
   * generous internal padding, and safe automatic page breaks before drawing.
   */
  function drawCard(options) {
    const measurement = measureCard(doc, {
      ...options,
      width: options.width || contentWidth
    });

    const {
      boxHeight,
      titleLines,
      titleLineHeight,
      textLines,
      textLineHeight
    } = measurement;

    const x = options.x || margin;
    const width = options.width || contentWidth;
    const topPadding = options.topPadding ?? 12;
    const sidePadding = options.sidePadding ?? 14;
    const fillColor = options.fillColor || [248, 250, 252];
    const borderColor = options.borderColor || [226, 232, 240];
    const titleColor = options.titleColor || [30, 41, 59];
    const textColor = options.textColor || [71, 85, 105];
    const titleSize = options.titleSize || 9.5;
    const fontSize = options.fontSize || 8.5;
    const gapAfter = options.gapAfter ?? 16;

    // Check safe page break before drawing!
    ensurePageBreak(boxHeight + 10);

    // Draw background card
    doc.setFillColor(...fillColor);
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, y, width, boxHeight, 4, 4, "FD");

    let cursorY = y + topPadding;

    // Title rendering
    if (titleLines.length > 0) {
      doc.setTextColor(...titleColor);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(titleSize);
      if (doc.setCharSpace) doc.setCharSpace(0);
      titleLines.forEach((tLine) => {
        cursorY += titleLineHeight;
        doc.text(tLine, x + sidePadding, cursorY - (titleLineHeight - titleSize * 0.85), { align: "left" });
      });
      cursorY += 5; // titleBottomGap
    }

    // Body text rendering
    if (textLines.length > 0) {
      doc.setTextColor(...textColor);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(fontSize);
      if (doc.setCharSpace) doc.setCharSpace(0);
      textLines.forEach((line) => {
        cursorY += textLineHeight;
        doc.text(line, x + sidePadding, cursorY - (textLineHeight - fontSize * 0.85), { align: "left" });
      });
    }

    // Explicit state reset
    if (doc.setCharSpace) doc.setCharSpace(0);

    y += boxHeight + gapAfter;
    return boxHeight;
  }

  // ==========================================
  // PAGE 1: Header, Metadata, Core Diagnostics, Map & Canopy Density Tiers
  // ==========================================

  // Primary Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, y, contentWidth, 52, "F");

  doc.setTextColor(248, 250, 252);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  if (doc.setCharSpace) doc.setCharSpace(0);
  doc.text("URBAN GREENWATCH | GIS CANOPY STUDY REPORT", margin + 16, y + 22, { align: "left" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184);
  if (doc.setCharSpace) doc.setCharSpace(0);
  doc.text("Copernicus Sentinel-2 Multispectral 10m Analytics & Ecological Assessment", margin + 16, y + 39, { align: "left" });
  y += 64;

  // Study Area Title & Subtitle (Strictly Wrapped with 2% safety margin)
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  if (doc.setCharSpace) doc.setCharSpace(0);
  const areaNameLines = doc.splitTextToSize(areaName, contentWidth * 0.98);
  areaNameLines.forEach((aLine) => {
    doc.text(aLine, margin, y + 6, { align: "left" });
    y += 18;
  });
  y += 2;

  // Satellite Pass & Report Date Line
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (doc.setCharSpace) doc.setCharSpace(0);
  doc.text(`Satellite Pass: ${satDate}   |   Report Date: ${new Date().toLocaleDateString()}`, margin, y, { align: "left" });
  y += 12;

  // Header Record ID on its own 7 pt line as an unbreakable token
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  if (doc.setCharSpace) doc.setCharSpace(0);
  doc.text(`Record ID: ${analysisId}`, margin, y, { align: "left" });
  y += 14;

  // Core Metrics Summary Table (AutoTable with generous padding & clean left-aligned cells)
  if (doc.autoTable) {
    ensurePageBreak(58);
    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Surface Area", "Green Cover %", "Mean NDVI", "Health Score", "Cooling Rating", "Green Deficit", "Target Infill"]],
      body: [[
        `${totalHa.toFixed(1)} ha`,
        `${greenPct.toFixed(1)}%`,
        meanNdvi.toFixed(3),
        `${healthScore}/100`,
        coolingRating.split(" ")[0],
        `${deficitHa.toFixed(1)} ha`,
        `~${treesNeeded.toLocaleString()} trees`
      ]],
      theme: "grid",
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.5,
        halign: "left",
        valign: "middle",
        cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }
      },
      bodyStyles: {
        fontSize: 8.5,
        fontStyle: "bold",
        halign: "left",
        valign: "middle",
        textColor: [15, 23, 42],
        cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }
      },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 75 },
        2: { cellWidth: 65 },
        3: { cellWidth: 70 },
        4: { cellWidth: 75 },
        5: { cellWidth: 75 },
        6: { cellWidth: 85 }
      },
      styles: {
        overflow: "linebreak",
        halign: "left"
      },
      didDrawCell: () => {
        if (doc.setCharSpace) doc.setCharSpace(0);
      }
    });
    y = doc.lastAutoTable.finalY + 16;
  }

  // Executive Synthesis Card (Dynamically Padded, Left-Aligned)
  const summaryText = pdfSafeText(insights.summary || "Vegetative evaluation completed for the study area boundary.");
  drawCard({
    title: "EXECUTIVE SYNTHESIS & CANOPY PROFILE:",
    text: summaryText,
    width: contentWidth,
    topPadding: 11,
    bottomPadding: 13,
    sidePadding: 14,
    fillColor: [248, 250, 252],
    borderColor: [226, 232, 240],
    titleColor: [71, 85, 105],
    textColor: [30, 41, 59],
    titleSize: 9.5,
    fontSize: 8.5,
    gapAfter: 16
  });

  // Map Snapshot or Geographic Reference Box (Tightly Zoomed to Polygon)
  drawSectionBanner("Spatial Boundary & Sentinel-2 View");
  if (mapSnapshot) {
    let imgProps = null;
    try {
      imgProps = doc.getImageProperties(mapSnapshot);
    } catch {
      imgProps = null;
    }

    const maxW = contentWidth; // 515 pt
    const maxH = 170; // pt
    let renderW = maxW;
    let renderH = maxH;

    if (imgProps && imgProps.width && imgProps.height) {
      const aspect = imgProps.width / imgProps.height;
      if (aspect > maxW / maxH) {
        renderW = maxW;
        renderH = maxW / aspect;
      } else {
        renderH = maxH;
        renderW = maxH * aspect;
      }
    }

    const renderX = margin + (contentWidth - renderW) / 2;
    ensurePageBreak(renderH + 32);

    try {
      doc.setFillColor(15, 23, 42);
      doc.rect(renderX, y, renderW, renderH, "F");

      doc.addImage(mapSnapshot, "PNG", renderX, y, renderW, renderH);

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.75);
      doc.rect(renderX, y, renderW, renderH, "D");

      y += renderH + 9;

      const figCaption = pdfSafeText("Figure 1.0: Active AOI study area boundary tightly framed with Copernicus Sentinel-2 multispectral vegetation reflectance.");
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      if (doc.setCharSpace) doc.setCharSpace(0);
      const captionLines = doc.splitTextToSize(figCaption, contentWidth * 0.98);
      captionLines.forEach((cLine) => {
        doc.text(cLine, margin, y, { align: "left" });
        y += 11;
      });
      y += 16;
    } catch (imgErr) {
      console.warn("Unable to embed map snapshot image into PDF:", imgErr);
      mapSnapshot = null;
    }
  }

  if (!mapSnapshot) {
    drawCard({
      title: "Geographic AOI Spatial Footprint",
      text: `- Study Area: ${areaName}\n- Polygon Surface Extent: ${totalHa.toFixed(2)} hectares (${Math.round(totalHa * 10000).toLocaleString()} m2)\n- Remote Sensing Source: Copernicus Sentinel-2 L2A (10m Resolution)  |  Acquisition: ${satDate}`,
      width: contentWidth,
      fillColor: [248, 250, 252],
      borderColor: [203, 213, 225],
      titleColor: [51, 65, 85],
      textColor: [71, 85, 105],
      titleSize: 9.5,
      fontSize: 8.5,
      gapAfter: 16
    });
  }

  // Canopy Density Tiers Table follows directly on Page 1 if space permits (eliminating ~40% blank space)
  const denseVal = Number(stats.dense_pct != null ? stats.dense_pct : 0.0);
  const modVal = Number(stats.moderate_pct != null ? stats.moderate_pct : 0.0);
  const sparseVal = Number(stats.sparse_pct != null ? stats.sparse_pct : 0.0);
  const nonVegVal = Number(stats.non_veg_pct != null ? stats.non_veg_pct : stats.deficit_pct || 0.0);

  // Per-block fit check: Density Tiers Table requires ~130 pt (banner + table)
  ensurePageBreak(130);
  drawSectionBanner("Canopy Density Tiers & Vegetation Structure");

  if (doc.autoTable) {
    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Vegetation Tier", "NDVI Threshold", "% of AOI", "Hectares", "Microclimate & Urban Forestry Role"]],
      body: [
        ["Dense Tree Canopy", "NDVI >= 0.60", `${denseVal.toFixed(1)}%`, `${((denseVal / 100) * totalHa).toFixed(1)} ha`, "Maximum shade, active evapotranspiration, thermal cooling"],
        ["Moderate Canopy / Shrubs", "0.40 <= NDVI < 0.60", `${modVal.toFixed(1)}%`, `${((modVal / 100) * totalHa).toFixed(1)} ha`, "Intermediate understory, lawn buffers, moisture moderation"],
        ["Sparse / Open Ground", "0.20 <= NDVI < 0.40", `${sparseVal.toFixed(1)}%`, `${((sparseVal / 100) * totalHa).toFixed(1)} ha`, "Scattered turf, dry grassland, high infill planting potential"],
        ["Built-up / Deficit Surfaces", "NDVI < 0.20", `${nonVegVal.toFixed(1)}%`, `${((nonVegVal / 100) * totalHa).toFixed(1)} ha`, "Asphalt, concrete, rooftop surfaces; elevated heat island risk"]
      ],
      theme: "striped",
      rowPageBreak: "avoid",
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.5,
        halign: "left",
        valign: "middle",
        cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }
      },
      bodyStyles: {
        fontSize: 8.2,
        textColor: [30, 41, 59],
        halign: "left",
        valign: "middle",
        cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }
      },
      columnStyles: {
        0: { cellWidth: 115, fontStyle: "bold" },
        1: { cellWidth: 95 },
        2: { cellWidth: 55, fontStyle: "bold" },
        3: { cellWidth: 65 },
        4: { cellWidth: 185 }
      },
      styles: {
        overflow: "linebreak",
        halign: "left"
      },
      didDrawCell: () => {
        if (doc.setCharSpace) doc.setCharSpace(0);
      }
    });
    y = doc.lastAutoTable.finalY + 16;
  }

  // ==========================================
  // PAGE 2: Research Charts & Health Score Component Breakdown
  // ==========================================
  // Chart 1 requires ~190 pt. If it does not fit on Page 1, it cleanly begins Page 2.
  ensurePageBreak(190);

  // Embed High-DPI Research Chart 1: Canopy Tiers vs WHO 30% Target (Zero label overlap, 220px height)
  const tierChartDataUrl = renderCanopyTiersVsTargetChart(stats, totalHa, greenPct);
  ensurePageBreak(185);
  doc.addImage(tierChartDataUrl, "PNG", margin, y, contentWidth, 175);
  y += 185;

  // Canopy Structure Key Observations Card
  drawCard({
    title: "CANOPY STRUCTURE KEY OBSERVATIONS:",
    text: `The active study boundary reflects ${greenPct.toFixed(1)}% total vegetative coverage across ${totalHa.toFixed(1)} ha, with dense tree canopy comprising ${denseVal.toFixed(1)}% and moderate understory/lawns at ${modVal.toFixed(1)}%. Non-vegetated surfaces represent ${nonVegVal.toFixed(1)}% (${((nonVegVal / 100) * totalHa).toFixed(1)} ha), highlighting localized heat retention zones suitable for targeted urban greening and bioswale conversion.`,
    width: contentWidth,
    fillColor: [248, 250, 252],
    borderColor: [226, 232, 240],
    titleColor: [51, 65, 85],
    textColor: [71, 85, 105],
    titleSize: 9,
    fontSize: 8.2,
    gapAfter: 16
  });

  // Section Banner: Canopy Health Score Breakdown & Baseline Status
  drawSectionBanner("Canopy Health Score: Formula Breakdown & Interpretation");

  // Embed High-DPI Research Chart 2: Score Breakdown & Baseline Status
  const scoreChartDataUrl = renderHealthScoreBreakdownChart(healthScore, ndviPts, coverPts, bandLabel, t);
  ensurePageBreak(155);
  doc.addImage(scoreChartDataUrl, "PNG", margin, y, contentWidth, 145);
  y += 155;

  // Formula Interpretation Text Card (Explains 50-60 scores)
  const interpretationText = "Score Interpretation Guide: The Canopy Health Score weights vegetation photosynthetic vigor & density (mean NDVI) at 60% and total spatial area coverage at 40%. An area with extensive green footprint (e.g. 65% green cover) can yield a moderate score (50-60) if dominated by open lawns, young saplings, or seasonal shrubs rather than contiguous, mature high-NDVI shade tree canopies. To achieve a score above 75, urban forestry strategies must focus on dense, broad-canopy tree infill that elevates both spatial coverage and average NDVI.";
  drawCard({
    title: "MATHEMATICAL SCORE INTERPRETATION:",
    text: interpretationText,
    width: contentWidth,
    fillColor: [248, 250, 252],
    borderColor: [226, 232, 240],
    titleColor: [71, 85, 105],
    textColor: [51, 65, 85],
    titleSize: 9.5,
    fontSize: 8.5,
    gapAfter: 16
  });

  // ==========================================
  // PAGE 3: Scientific Honesty, Targeted Action Pathways & Priority Interventions
  // ==========================================
  ensurePageBreak(300);

  // Scientific Honesty & Methodology Note Card
  const honestyText = "Copernicus Sentinel-2 multispectral sensors capture aggregate 10-meter surface reflectance. This study report grounds all canopy densities, health scores, and infill targets strictly in verified radiometric NDVI telemetry and municipal forestry standards (e.g. WHO 30% guideline). Multi-month trend curves and individual optical species-count charts are intentionally omitted unless multi-date historical comparison passes are supplied by the user, preserving empirical integrity for research and urban planning.";
  drawCard({
    title: "SCIENTIFIC HONESTY & REMOTE SENSING METHODOLOGY NOTE:",
    text: honestyText,
    width: contentWidth,
    fillColor: [248, 250, 252],
    borderColor: [203, 213, 225],
    titleColor: [51, 65, 85],
    textColor: [71, 85, 105],
    titleSize: 9,
    fontSize: 8.2,
    gapAfter: 16
  });

  drawSectionBanner("How to Improve This Score: Targeted Action Pathways");

  const improvementSteps = [
    {
      title: "1. Canopy Infill with High-LAI Native Shade Trees (+10 to +15 Score Points)",
      desc: `Targeting open and sparse zones (${sparseVal.toFixed(1)}%) with native broad-canopy trees (e.g. Neem, Honge) elevates mean NDVI toward 0.65+, contributing up to +12 to +18 score points.`
    },
    {
      title: "2. Multi-Tiered Understory Shrub Buffers (+4 to +7 Resilience Points)",
      desc: "Planting native flowering shrubs beneath existing mature stands preserves soil moisture, curtails sub-canopy evaporation, and stabilizes scores during seasonal droughts."
    },
    {
      title: "3. Non-Vegetated Easement & Bioswale Conversion (+5 to +9 Spatial Points)",
      desc: `Converting underutilized impervious margins (${nonVegVal.toFixed(1)}%) into bioswales directly eliminates the ${deficitHa.toFixed(1)} ha deficit, driving spatial coverage toward the 40-point maximum.`
    }
  ];

  improvementSteps.forEach((step) => {
    drawCard({
      title: step.title,
      text: step.desc,
      width: contentWidth,
      topPadding: 10,
      bottomPadding: 12,
      sidePadding: 14,
      fillColor: [248, 250, 252],
      borderColor: [226, 232, 240],
      titleColor: [30, 41, 59],
      textColor: [71, 85, 105],
      titleSize: 9,
      fontSize: 8.2,
      gapAfter: 12
    });
  });

  // Priority Urban Forestry Interventions (Canonical 4-Column Fixed Table: 17% / 11% / 34% / 38%)
  const recs = insights.recommendations || [];
  if (recs.length) {
    drawSectionBanner("Priority Urban Forestry Interventions (Canonical)");

    if (doc.autoTable) {
      ensurePageBreak(110);
      doc.autoTable({
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Priority Intervention", "Severity", "Ecological Diagnosis", "Recommended Municipal Action"]],
        body: recs.map((r) => [
          pdfSafeText(r.title),
          pdfSafeText((r.severity || "MODERATE").toUpperCase()),
          pdfSafeText(r.description),
          pdfSafeText(r.suggested_action)
        ]),
        theme: "grid",
        rowPageBreak: "avoid",
        headStyles: {
          fillColor: [79, 70, 229], // indigo-600
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8,
          halign: "left",
          valign: "middle",
          cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [30, 41, 59],
          halign: "left",
          valign: "top",
          cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }
        },
        columnStyles: {
          0: { cellWidth: 88, fontStyle: "bold" },
          1: { cellWidth: 57, fontStyle: "bold", halign: "center", fontSize: 7 }, // Non-wrapping 57 pt width
          2: { cellWidth: 175 },
          3: { cellWidth: 195 }
        },
        styles: {
          overflow: "linebreak",
          halign: "left"
        },
        didDrawCell: () => {
          if (doc.setCharSpace) doc.setCharSpace(0);
        }
      });
      y = doc.lastAutoTable.finalY + 18;
    }
  }

  // ==========================================
  // PAGE 4: Recommended Flora & Scientific Synthesis Narrative Start
  // ==========================================
  ensurePageBreak(280);

  drawSectionBanner("Recommended Flora & Planting Suitability");

  const floraNote = pdfSafeText("*Note: Species suitability guidance provides horticultural planning support based on geographic context and Sentinel-2 NDVI metrics; not optical satellite species detection.");
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  if (doc.setCharSpace) doc.setCharSpace(0);
  const floraNoteLines = doc.splitTextToSize(floraNote, contentWidth * 0.98);
  floraNoteLines.forEach((fnLine) => {
    doc.text(fnLine, margin, y, { align: "left" });
    y += 11;
  });
  y += 12;

  // Recommended Flora Table (Canonical 4-Column Fixed Table: 16% / 22% / 34% / 28%)
  const flora = insights.planting_recommendations || [];
  if (doc.autoTable && flora.length) {
    ensurePageBreak(110);
    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Plant Group", "Recommended Species Examples", "Site & Soil Suitability Rationale", "Targeted Ecological Benefits"]],
      body: flora.map((f) => [
        pdfSafeText(f.plant_type),
        pdfSafeText((f.species_examples || []).join(", ")),
        pdfSafeText(f.why_suited_for_area),
        pdfSafeText(f.area_benefits)
      ]),
      theme: "striped",
      rowPageBreak: "avoid",
      headStyles: {
        fillColor: [16, 185, 129], // emerald-500
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
        halign: "left",
        valign: "middle",
        cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [30, 41, 59],
        halign: "left",
        valign: "top",
        cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }
      },
      columnStyles: {
        0: { cellWidth: 82, fontStyle: "bold" },
        1: { cellWidth: 113, fontStyle: "italic" },
        2: { cellWidth: 175 },
        3: { cellWidth: 145 }
      },
      styles: {
        overflow: "linebreak",
        halign: "left"
      },
      didDrawCell: () => {
        if (doc.setCharSpace) doc.setCharSpace(0);
      }
    });
    y = doc.lastAutoTable.finalY + 16;
  }

  // Implementation Guidelines Callout Card
  drawCard({
    title: "URBAN FORESTRY IMPLEMENTATION & PLANTING GUIDELINES:",
    text: "Prioritize monsoon or seasonal wet-phase planting windows for all canopy shade saplings to establish deep taproot penetration. For avenue verges and compacted soils, apply 8-10 cm organic mulch buffers to conserve subsoil moisture, prevent surface crusting, and protect saplings against vehicular heat exposure during seasonal dry spells.",
    width: contentWidth,
    fillColor: [248, 250, 252],
    borderColor: [226, 232, 240],
    titleColor: [51, 65, 85],
    textColor: [71, 85, 105],
    titleSize: 9,
    fontSize: 8.2,
    gapAfter: 18
  });

  // ==========================================
  // PAGE 4-5: Detailed Scientific Synthesis Narrative (Natural Multi-Page Flow)
  // ==========================================
  if (insights.markdown) {
    drawSectionBanner("Detailed Scientific Synthesis & Management Narrative");

    const rawMarkdown = pdfSafeText(insights.markdown);
    const cleanLines = rawMarkdown.split("\n");

    cleanLines.forEach((line) => {
      const trimmed = pdfSafeText(line).trim();
      if (!trimmed) {
        y += 6;
        return;
      }

      if (trimmed.startsWith("## ")) {
        const hText = trimmed.replace(/^##\s*/, "");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        if (doc.setCharSpace) doc.setCharSpace(0);
        const hLines = doc.splitTextToSize(hText, contentWidth * 0.98);
        const hHeight = hLines.length * 14 + 10;
        ensurePageBreak(hHeight + 12);
        y += 8;
        doc.setTextColor(15, 23, 42);
        hLines.forEach((hl) => {
          doc.text(hl, margin, y + 10, { align: "left" });
          y += 14;
        });
        y += 4;
      } else if (trimmed.startsWith("### ")) {
        const h3Text = trimmed.replace(/^###\s*/, "");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        if (doc.setCharSpace) doc.setCharSpace(0);
        const h3Lines = doc.splitTextToSize(h3Text, contentWidth * 0.98);
        const h3Height = h3Lines.length * 12 + 6;
        ensurePageBreak(h3Height + 8);
        y += 6;
        doc.setTextColor(51, 65, 85);
        h3Lines.forEach((hl) => {
          doc.text(hl, margin + 4, y + 9, { align: "left" });
          y += 12;
        });
        y += 3;
      } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.2);
        doc.setTextColor(71, 85, 105);
        if (doc.setCharSpace) doc.setCharSpace(0);
        const bulletContent = trimmed.substring(2);
        const bulletLines = doc.splitTextToSize(`-  ${bulletContent}`, (contentWidth - 14) * 0.98);
        const bHeight = bulletLines.length * (8.2 * 1.38) + 4;
        ensurePageBreak(bHeight);
        bulletLines.forEach((bLine, i) => {
          doc.text(bLine, margin + 8, y + (i + 1) * (8.2 * 1.38), { align: "left" });
        });
        y += bHeight + 4;
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(51, 65, 85);
        if (doc.setCharSpace) doc.setCharSpace(0);
        const paraLines = doc.splitTextToSize(trimmed, contentWidth * 0.98);
        const pHeight = paraLines.length * 12.5;
        ensurePageBreak(pHeight + 10);
        paraLines.forEach((pLine, i) => {
          doc.text(pLine, margin, y + (i + 1) * 12.5, { align: "left" });
        });
        y += pHeight + 11; // 11 pt spacing between paragraphs
      }
    });
  }

  // ==========================================
  // RUNNING HEADERS & FOOTERS (All Pages)
  // ==========================================
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    if (p > 1) {
      // Top subtle rule
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(margin, 25, pageWidth - margin, 25);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      if (doc.setCharSpace) doc.setCharSpace(0);
      doc.text("Urban GreenWatch - Copernicus Sentinel-2 Urban Forestry Assessment", margin, 20, { align: "left" });
    }

    // Bottom rule & footer (baseline exactly 24 pt from bottom edge: pageHeight - 24)
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    if (doc.setCharSpace) doc.setCharSpace(0);
    // Display full 36-char ID without truncation at 6.5 pt
    const footerLeft = pdfSafeText(`Study Area: ${areaName.substring(0, 32)}   |   Record ID: ${analysisId}`);
    doc.text(footerLeft, margin, pageHeight - 24, { align: "left" });
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin - 45, pageHeight - 24, { align: "left" });
  }

  // Download Trigger
  const sanitizedName = areaName.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 30);
  const filename = `UrbanGreenWatch_Report_${sanitizedName}_${satDate}.pdf`;
  if (returnDoc) {
    return { filename, doc };
  }
  doc.save(filename);
  return filename;
}
