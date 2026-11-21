"""
AI Insights Service for Urban Tree Mapping & Green-Cover Assessment.

Synthesizes high-level ecological diagnostics and actionable urban forestry
recommendations using Google Gemini REST API (gemini-3.8-flash) grounded strictly
in verified Sentinel-2 NDVI metrics, with automatic fallback to a deterministic
urban forestry rule engine.
"""

import asyncio
import json
import logging
import os
import random
from typing import Any, Dict, List, Optional, Tuple
import httpx

from app.config import get_settings
from app.features.insights.schemas import (
    ActionableRecommendation,
    InsightSeverity,
    InsightsRequest,
    InsightsResponse,
    PlantingRecommendation,
)
from app.features.insights.service import evaluate_environmental_insights

logger = logging.getLogger(__name__)

GEMINI_API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GROQ_API_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"


def _build_canonical_recommendations(report: Any, req: InsightsRequest) -> List[ActionableRecommendation]:
    """Builds exactly 3 canonical recommendations in strict fixed order matching urban forestry guidelines."""
    green_pct = req.green_cover_percentage
    dense_val = round(req.dense_pct or 0.0, 1)
    moderate_val = round(req.moderate_pct or 0.0, 1)
    deficit_val = round(req.deficit_pct or 0.0, 1)
    deficit_ha = report.green_deficit_hectares
    trees_needed = report.estimated_trees_needed
    area_ha = req.total_area_hectares

    # 1. Canopy & Spatial Gap Strategy
    if green_pct < 15.0:
        rec1_sev = InsightSeverity.CRITICAL
        rec1_desc = (
            f"Severe vegetative deficit with only {green_pct:.1f}% canopy cover across {area_ha:.1f} ha, "
            f"creating a {deficit_ha:.1f} ha shortfall below the WHO 30% municipal benchmark. "
            f"Impervious and non-vegetated surfaces dominate {deficit_val:.1f}% of the boundary."
        )
        rec1_act = (
            f"Deploy emergency municipal infill planting of ~{trees_needed:,} native shade saplings to restore "
            f"{deficit_ha:.1f} ha of canopy, prioritizing high-traffic arterial road corridors and asphalt easements."
        )
    elif green_pct < 30.0:
        rec1_sev = InsightSeverity.WARNING
        gap_pct = round(30.0 - green_pct, 1)
        rec1_desc = (
            f"Moderate canopy deficit of {gap_pct:.1f}% ({deficit_ha:.1f} ha) below the WHO 30% guideline. "
            f"Non-vegetated surfaces occupy {deficit_val:.1f}%, while dense tree canopy is restricted to {dense_val:.1f}%."
        )
        rec1_act = (
            f"Mandate infill planting of ~{trees_needed:,} native shade trees across public parks, sidewalk verges, "
            f"and civic easements to eliminate the {deficit_ha:.1f} ha green deficit."
        )
    else:
        rec1_sev = InsightSeverity.HEALTHY
        rec1_desc = (
            f"Optimal canopy coverage of {green_pct:.1f}% across {area_ha:.1f} ha exceeds the WHO 30% standard, "
            f"with mature dense tree clusters occupying {dense_val:.1f}% and providing contiguous canopy continuity."
        )
        rec1_act = (
            f"Enact permanent conservation easements and municipal root-zone preservation bylaws to protect existing "
            f"{dense_val:.1f}% mature dense tree stands from utility excavation or infrastructure encroachment."
        )

    # 2. Urban Cooling & Ecological Resilience
    if green_pct < 15.0:
        rec2_sev = InsightSeverity.CRITICAL
        rec2_desc = (
            f"Critically elevated urban heat island risk and localized surface heat buildup resulting from {deficit_val:.1f}% "
            f"impervious exposure, with mean NDVI constrained to {req.mean_ndvi:.3f}."
        )
        rec2_act = (
            "Integrate vegetated bioswales, reflective permeable pavements, and pocket parks along heat-stressed road easements "
            "to dampen localized surface temperatures and detain stormwater runoff."
        )
    elif green_pct < 30.0:
        rec2_sev = InsightSeverity.WARNING
        rec2_desc = (
            f"Moderate urban heat island exposure with fragmented thermal buffering ({moderate_val:.1f}% intermediate cover), "
            f"leaving pedestrian corridors vulnerable to seasonal surface heat retention."
        )
        rec2_act = (
            "Establish continuous green street corridors and shaded bioswales linking isolated vegetation stands "
            "to lower microclimate temperatures and mitigate urban stormwater peak flows."
        )
    else:
        rec2_sev = InsightSeverity.HEALTHY
        rec2_desc = (
            f"High urban cooling capacity and effective microclimate dampening supported by a healthy mean NDVI of {req.mean_ndvi:.3f} "
            f"and {moderate_val:.1f}% complementary understory and shrub cover."
        )
        rec2_act = (
            "Enhance structural biodiversity by introducing native flowering understory species beneath mature canopy "
            "to sustain microclimate humidity and bolster drought resilience."
        )

    # 3. Sentinel-2 Monitoring & Verification
    if green_pct < 30.0:
        rec3_sev = InsightSeverity.MODERATE
        rec3_desc = (
            f"Ongoing multispectral surveillance is essential to track sapling establishment, verify hydration in newly planted "
            f"corridors, and detect seasonal dieback against the {req.mean_ndvi:.3f} NDVI baseline."
        )
        rec3_act = (
            "Establish bi-monthly automated Sentinel-2 NDVI comparative scans to monitor thermal stress hotspots "
            "and track vegetative canopy recovery progress toward the 30% target."
        )
    else:
        rec3_sev = InsightSeverity.HEALTHY
        rec3_desc = (
            f"Strong vegetative vitality with healthy mean NDVI of {req.mean_ndvi:.3f}; regular remote sensing monitoring "
            f"ensures early detection of seasonal canopy thinning, pest infestation, or drought stress."
        )
        rec3_act = (
            "Schedule quarterly Sentinel-2 multispectral vegetation tracking to audit canopy stability, benchmark against "
            f"the {req.mean_ndvi:.3f} baseline, and detect unauthorized canopy clearing."
        )

    return [
        ActionableRecommendation(
            title="Canopy & Spatial Gap Strategy",
            description=rec1_desc,
            severity=rec1_sev,
            suggested_action=rec1_act
        ),
        ActionableRecommendation(
            title="Urban Cooling & Ecological Resilience",
            description=rec2_desc,
            severity=rec2_sev,
            suggested_action=rec2_act
        ),
        ActionableRecommendation(
            title="Sentinel-2 Monitoring & Verification",
            description=rec3_desc,
            severity=rec3_sev,
            suggested_action=rec3_act
        )
    ]


def _build_canonical_planting_recommendations(req: InsightsRequest) -> List[PlantingRecommendation]:
    """
    Generates canonical tailored flora groups grounded in the polygon's spatial profile,
    vegetation tiers, and urban climate/soil constraints.
    """
    deficit_pct = req.deficit_pct or 0.0
    dense_pct = req.dense_pct or 0.0

    return [
        PlantingRecommendation(
            plant_type="Canopy Shade Trees (Parklands & Open Infill)",
            species_examples=[
                "Pongamia pinnata (Indian Beech / Honge)",
                "Azadirachta indica (Neem)",
                "Ficus religiosa (Peepal)"
            ],
            why_suited_for_area=(
                f"Thrives in compacted urban soils with high drought resistance; extensive non-invasive taproot systems "
                f"anchor open ground and provide maximum leaf area index (LAI) to restore high-deficit areas ({deficit_pct:.1f}% built-up)."
            ),
            area_benefits=(
                "Delivers up to 2.5°C localized microclimate cooling through dense transpiration, filters coarse air particulates (PM10), "
                "and improves deep soil hydraulic conductivity."
            )
        ),
        PlantingRecommendation(
            plant_type="Urban Street & Avenue Trees (Narrow Verges & Asphalt Buffers)",
            species_examples=[
                "Cassia fistula (Golden Shower / Amaltas)",
                "Tabebuia rosea (Pink Poui)",
                "Bauhinia purpurea (Butterfly Tree)"
            ],
            why_suited_for_area=(
                "Vertical, compact branching habit that avoids overhead utility line interference, with contained root spread "
                "that does not buckle paved sidewalks or asphalt road margins under intense surface heat."
            ),
            area_benefits=(
                "Interrupts radiant asphalt heat, provides immediate pedestrian shade along transit margins, and buffers "
                "vehicular exhaust emissions while attracting urban pollinators."
            )
        ),
        PlantingRecommendation(
            plant_type="Native Understory & Under-Canopy Shrubs (Intermediate Buffers)",
            species_examples=[
                "Justicia adhatoda (Malabar Nut / Vasaka)",
                "Ixora coccinea (Jungle Geranium)",
                "Nerium oleander"
            ],
            why_suited_for_area=(
                f"Tolerates partial to heavy shade beneath existing canopy ({dense_pct:.1f}% dense cover); requires minimal irrigation "
                f"and thrives in lean roadside soil profiles without outcompeting mature tree root zones."
            ),
            area_benefits=(
                "Establishes multi-tiered vegetative layering, curtails sub-canopy soil moisture evaporation, and supplies vital food "
                "and shelter corridors for urban birds, bees, and beneficial insects."
            )
        ),
        PlantingRecommendation(
            plant_type="Bioswale & Infiltration Groundcover (Drainage Margins & Runoff Edges)",
            species_examples=[
                "Vetiveria zizanioides (Vetiver Grass)",
                "Cymbopogon flexuosus (Lemongrass)",
                "Wedelia trilobata"
            ],
            why_suited_for_area=(
                "Massive fibrous root depth (down to 2–3 meters) capable of anchoring sloped ground; exhibits extreme tolerance "
                "to alternating flash inundation during heavy monsoons and extended dry spells."
            ),
            area_benefits=(
                "Intercepts urban stormwater peak flows, traps roadside heavy metal runoff and sediments, and stabilizes exposed topsoil "
                "against storm erosion."
            )
        )
    ]


def _build_grounded_prompt(req: InsightsRequest, benchmark: Any) -> str:
    """Constructs a strictly grounded prompt with verified Sentinel-2 NDVI telemetry and locked benchmark math."""
    green_ha = req.green_cover_hectares
    if green_ha is None:
        green_ha = round(req.total_area_hectares * (req.green_cover_percentage / 100.0), 2)

    temporal_info = ""
    if req.delta_ndvi is not None:
        temporal_info = f"- Temporal Mean Delta NDVI: {req.delta_ndvi:+.3f} (compared against {req.historical_date or 'Historical Baseline'})\n"

    prompt = f"""You are a Senior Urban Forestry Scientist & Satellite Remote Sensing Specialist analyzing high-resolution Copernicus Sentinel-2 multispectral vegetation telemetry for an urban boundary.

STUDY AREA TELEMETRY:
- Location / Study Area Name: {req.area_name}
- Total Surface Area: {req.total_area_hectares:.2f} hectares
- Sentinel-2 Acquisition Date: {req.satellite_date_used or 'Recent Cloud-Filtered Composite'}
- Mean NDVI: {req.mean_ndvi:.3f} (-1.0 to +1.0 scale)
- Green Vegetation Cover (NDVI >= 0.3): {req.green_cover_percentage:.1f}% ({green_ha:.2f} hectares)
- Dense Tree Canopy (NDVI >= 0.6): {req.dense_pct:.1f}%
- Moderate Canopy / Shrub Cover (0.4 <= NDVI < 0.6): {req.moderate_pct:.1f}%
- Sparse Vegetation / Grass (0.2 <= NDVI < 0.4): {req.sparse_pct:.1f}%
- Built-up / Impervious / Deficit (NDVI < 0.2): {req.deficit_pct:.1f}%
{temporal_info}
DETERMINISTIC BENCHMARK TRUTH (CALCULATED BY MUNICIPAL ENGINE - DO NOT CONTRADICT):
- Canopy Health Score: {benchmark.health_score}/100
- Overall Health Status: {benchmark.overall_health_status}
- Urban Cooling Capacity Index: {benchmark.cooling_capacity_index}
- Green Deficit: {benchmark.green_deficit_hectares:.2f} ha (vs WHO 30% guideline)
- Planting Target Needed: ~{benchmark.estimated_trees_needed:,} native shade saplings (~400 trees/ha)

STRICT SCIENTIFIC & NON-REPETITIVE GUIDELINES:
1. Ground every statement strictly in the telemetry numbers and benchmark truth provided above.
2. DO NOT claim machine learning or optical stem-counting. Sentinel-2 measures aggregate multispectral reflectance at 10m spatial resolution, not individual tree counts.
3. Compare the green cover percentage against the World Health Organization (WHO) municipal standard of 30% urban canopy cover.
4. DO NOT repeat the raw statistics as a bulleted checklist, and DO NOT echo boilerplate text from the user interface.
5. In the markdown report, provide a genuine, insightful three-part narrative:
   - Part 1: "## 1. Ground-Truth Canopy & Microclimate Assessment"
     Clearly explain the physical situation on the ground from the polygon's metrics: how the canopy balance (dense {req.dense_pct:.1f}%, moderate {req.moderate_pct:.1f}%, non-vegetated {req.deficit_pct:.1f}%) and mean NDVI manifest across the physical landscape, evaluating localized microclimate cooling, surface heat retention, and stormwater absorption.
   - Part 2: "## 2. Practical Urban Forestry Management & Infill Strategy"
     Conclude with concrete, practical ways to improve or manage the area based on its actual deficit or surplus profile:
     * If there is a green deficit: Detail exact spatial priorities for planting (converting impervious asphalt, parking borders, and sidewalk verges), native deep-root shade species strategies, and localized heat island mitigation.
     * If the canopy is optimal: Focus on legal root-zone preservation, multi-tier understory diversification, and seasonal drought/pest surveillance.
   - Part 3: "## 3. Recommended Flora & Ecological Benefits"
     Synthesize which native and climate-adapted tree and plant species fit the polygon's spatial profile, why they thrive in the area's physical conditions, and their targeted environmental benefits (cooling, stormwater mitigation, particulate trapping).
6. Provide exactly 3 to 4 tailored plant groups in "planting_recommendations" matched to the polygon's spatial profile, climate, and space constraints (open parks, narrow avenues, understory beneath dense canopy, and drainage/bioswales).

RESPONSE FORMAT REQUIREMENTS:
You MUST respond with a single valid JSON object with EXACTLY the following structure (no surrounding markdown code blocks):
{{
  "summary": "2-3 sentences concise executive summary synthesizing canopy vigor and physical landscape condition.",
  "canopy_assessment": "Cohesive diagnostic paragraph evaluating vegetative health, tier distribution, and microclimate influence without bullet points.",
  "priority_action_areas": "Paragraph detailing concrete urban zones needing intervention or conservation.",
  "monitoring_next_steps": "Paragraph outlining satellite monitoring and field verification cadence.",
  "recommendations": [
    {{
      "title": "Canopy & Spatial Gap Strategy",
      "description": "Specific rationale grounded in the NDVI figures and canopy gap ({benchmark.green_deficit_hectares:.2f} ha / ~{benchmark.estimated_trees_needed:,} trees).",
      "severity": "critical" | "warning" | "moderate" | "healthy",
      "suggested_action": "Concrete municipal intervention."
    }},
    {{
      "title": "Urban Cooling & Ecological Resilience",
      "description": "Specific rationale grounded in surface heat island dampening and runoff absorption.",
      "severity": "critical" | "warning" | "moderate" | "healthy",
      "suggested_action": "Concrete municipal intervention (bioswales, cool pavements, permeable surfaces)."
    }},
    {{
      "title": "Sentinel-2 Monitoring & Verification",
      "description": "Specific rationale for multispectral satellite surveillance.",
      "severity": "critical" | "warning" | "moderate" | "healthy",
      "suggested_action": "Concrete monitoring protocol using Sentinel-2 NDVI comparative tracking."
    }}
  ],
  "planting_recommendations": [
    {{
      "plant_type": "Category name (e.g. Canopy Shade Trees, Urban Street & Avenue Trees, Native Understory Shrubs, Bioswale Groundcover)",
      "species_examples": ["Species 1 (Common Name)", "Species 2"],
      "why_suited_for_area": "Rationale explaining climate, soil, and space constraint suitability.",
      "area_benefits": "Targeted ecological benefits (cooling, stormwater absorption, particulate trapping, biodiversity)."
    }}
  ],
  "markdown": "A three-part report with sections: ## 1. Ground-Truth Canopy & Microclimate Assessment, ## 2. Practical Urban Forestry Management & Infill Strategy, and ## 3. Recommended Flora & Ecological Benefits."
}}
"""
    return prompt
    return prompt


def _generate_fallback_insights(req: InsightsRequest, benchmark: Optional[Any] = None) -> InsightsResponse:
    """Generates a robust deterministic urban forestry report if AI providers are unavailable."""
    report = benchmark or evaluate_environmental_insights(
        mean_ndvi=req.mean_ndvi,
        green_cover_pct=req.green_cover_percentage,
        total_area_hectares=req.total_area_hectares,
        dense_pct=req.dense_pct,
        moderate_pct=req.moderate_pct,
        sparse_pct=req.sparse_pct,
        deficit_pct=req.deficit_pct,
    )

    canonical_recs = _build_canonical_recommendations(report, req)

    green_ha = req.green_cover_hectares
    if green_ha is None:
        green_ha = round(req.total_area_hectares * (req.green_cover_percentage / 100.0), 2)

    dense_val = round(req.dense_pct or 0.0, 1)
    moderate_val = round(req.moderate_pct or 0.0, 1)
    deficit_val = round(req.deficit_pct or 0.0, 1)

    # Executive Summary
    summary = (
        f"Evaluation of {req.area_name} ({req.total_area_hectares:.1f} ha) reveals a mean NDVI of {req.mean_ndvi:.3f} "
        f"with {req.green_cover_percentage:.1f}% vegetative canopy cover ({green_ha:.1f} ha). "
        f"Overall canopy status is categorized as {report.overall_health_status}, with an urban cooling index rated as {report.cooling_capacity_index}."
    )

    # Diagnostic Situation Analysis
    if req.green_cover_percentage < 30.0:
        gap_pct = round(30.0 - req.green_cover_percentage, 1)
        situation_text = (
            f"The study area exhibits a pronounced vegetative deficit, falling {gap_pct:.1f}% below the World Health Organization's "
            f"30% urban canopy guideline. Non-vegetated and impervious surfaces dominate {deficit_val:.1f}% of the boundary, severely restricting "
            f"natural evapotranspiration and exacerbating localized surface heat accumulation. Dense tree canopy is constrained to {dense_val:.1f}%, "
            f"with {moderate_val:.1f}% moderate vegetation providing fragmented microclimate buffering. With a mean NDVI of {req.mean_ndvi:.3f}, "
            f"the area experiences heightened urban heat island exposure and elevated stormwater runoff volumes during heavy precipitation."
        )
        action_text = (
            f"To overcome the {report.green_deficit_hectares:.1f} ha green deficit and achieve the municipal 30% canopy standard, "
            f"a targeted planting campaign of approximately {report.estimated_trees_needed:,} native shade saplings is required. "
            f"Interventions should prioritize converting underutilized impervious asphalt and parking easements ({deficit_val:.1f}%) into "
            f"continuous shaded bioswales, while establishing linear tree corridors along arterial road verges. Additionally, existing mature "
            f"canopy stands ({dense_val:.1f}%) must be legally protected under root-zone preservation ordinances."
        )
    else:
        situation_text = (
            f"The study area demonstrates a resilient and contiguous urban forest canopy, surpassing the World Health Organization's "
            f"30% municipal canopy target with {req.green_cover_percentage:.1f}% vegetative cover ({green_ha:.1f} ha). "
            f"Mature dense tree canopy constitutes {dense_val:.1f}% of the boundary, complemented by {moderate_val:.1f}% moderate vegetation, "
            f"providing robust microclimate cooling, shading, and rainwater attenuation. Non-vegetated surfaces occupy {deficit_val:.1f}%, "
            f"and the healthy mean NDVI of {req.mean_ndvi:.3f} reflects strong vegetative vigor across both public parks and private easements."
        )
        action_text = (
            f"With canopy density currently exceeding ecological benchmarks, municipal management should focus on conservation and resilience. "
            f"Enact permanent conservation easements and root-zone protection ordinances to shield the {dense_val:.1f}% dense canopy "
            f"from construction encroachment and utility excavation. Furthermore, introduce multi-tier native understory shrubs beneath existing "
            f"tree stands to enhance pollinator biodiversity and reinforce the {moderate_val:.1f}% moderate vegetation buffer against seasonal drought."
        )

    if req.delta_ndvi is not None:
        trend = "positive canopy gain" if req.delta_ndvi > 0 else "canopy decline"
        situation_text += f" Historical comparison indicates a {trend} of {req.delta_ndvi:+.3f} mean NDVI relative to the baseline."

    # Priority Recommendations formatted cleanly
    recs_md = "\n\n".join([
        f"### {r.title} [{r.severity.upper()}]\n{r.description}\n\n**Suggested Action**: {r.suggested_action}"
        for r in canonical_recs
    ])

    canonical_flora = _build_canonical_planting_recommendations(req)
    flora_md = "\n\n".join([
        f"### {f.plant_type}\n"
        f"- **Recommended Species**: {', '.join(f.species_examples)}\n"
        f"- **Site & Soil Suitability**: {f.why_suited_for_area}\n"
        f"- **Targeted Ecological Benefits**: {f.area_benefits}"
        for f in canonical_flora
    ])

    monitoring_steps = (
        "Establish automated bi-monthly Sentinel-2 multispectral scans to track seasonal phenology changes, "
        "detect moisture stress hotspots early, and benchmark canopy vitality against the verified NDVI baseline."
    )

    markdown_report = f"""## 1. Ground-Truth Canopy & Microclimate Assessment
{situation_text}

## 2. Practical Urban Forestry Management & Infill Strategy
{action_text}

{recs_md}

## 3. Recommended Flora & Ecological Benefits
{flora_md}

### Sentinel-2 Monitoring & Verification Protocol
{monitoring_steps}
"""

    return InsightsResponse(
        source="fallback",
        model_used="Deterministic Urban Forestry Rule Engine",
        summary=summary,
        health_score=report.health_score,
        overall_health_status=report.overall_health_status,
        cooling_capacity_index=report.cooling_capacity_index,
        green_deficit_hectares=report.green_deficit_hectares,
        estimated_trees_needed=report.estimated_trees_needed,
        canopy_assessment=situation_text,
        priority_action_areas=action_text,
        monitoring_next_steps=monitoring_steps,
        recommendations=canonical_recs,
        planting_recommendations=canonical_flora,
        markdown=markdown_report,
        analysis_id=req.analysis_id,
    )


def _build_generation_config(model: str) -> dict:
    """Builds appropriate generationConfig based on Gemini model capabilities."""
    config: Dict[str, Any] = {"responseMimeType": "application/json"}
    # Configure low thinking for models with thinking reasoning (Gemini 2.5 / 3.x)
    if "3." in model or "2.5" in model:
        config["thinkingConfig"] = {"thinkingLevel": "LOW"}
    return config


async def _invoke_gemini_with_retries(
    client: httpx.AsyncClient,
    model_name: str,
    api_key: str,
    prompt_text: str,
    max_retries: int = 2,
) -> Tuple[Optional[dict], int, Optional[str]]:
    """
    Invokes the Gemini REST API with retry and backoff for transient HTTP 503 and 429 errors.
    Returns (response_json, status_code, error_text).
    """
    url = GEMINI_API_ENDPOINT.format(model=model_name) + f"?key={api_key.strip()}"
    request_body = {
        "contents": [
            {
                "parts": [
                    {"text": prompt_text}
                ]
            }
        ],
        "generationConfig": _build_generation_config(model_name)
    }

    last_status = 500
    last_error_text = ""

    for attempt in range(max_retries + 1):
        logger.info(
            "Calling Gemini REST API (%s, attempt %d/%d)...",
            model_name,
            attempt + 1,
            max_retries + 1
        )
        try:
            resp = await client.post(url, json=request_body)
            last_status = resp.status_code
            if resp.status_code == 200:
                return resp.json(), 200, None

            last_error_text = resp.text[:250]
            if resp.status_code in (429, 503):
                err_label = "UNAVAILABLE" if resp.status_code == 503 else "RATE_LIMITED"
                if attempt < max_retries:
                    backoff = (1.0 if attempt == 0 else 2.0) + random.uniform(0.1, 0.4)
                    logger.warning(
                        "Gemini API (%s) returned HTTP %d (%s). Retrying attempt %d/%d in %.2fs...",
                        model_name,
                        resp.status_code,
                        err_label,
                        attempt + 1,
                        max_retries,
                        backoff
                    )
                    await asyncio.sleep(backoff)
                    continue
                else:
                    logger.warning(
                        "Gemini API (%s) returned HTTP %d (%s) after %d retries.",
                        model_name,
                        resp.status_code,
                        err_label,
                        max_retries
                    )
                    return None, resp.status_code, last_error_text
            else:
                logger.warning(
                    "Gemini API (%s) returned non-retryable HTTP %d: %s",
                    model_name,
                    resp.status_code,
                    last_error_text
                )
                return None, resp.status_code, last_error_text

        except (httpx.ConnectTimeout, httpx.ReadTimeout) as timeout_exc:
            last_status = 504
            last_error_text = f"{type(timeout_exc).__name__}: {timeout_exc!r}"
            if attempt < max_retries:
                backoff = (1.0 if attempt == 0 else 2.0) + random.uniform(0.1, 0.4)
                logger.warning(
                    "Gemini API (%s) timed out (%s). Retrying attempt %d/%d in %.2fs...",
                    model_name,
                    type(timeout_exc).__name__,
                    attempt + 1,
                    max_retries,
                    backoff
                )
                await asyncio.sleep(backoff)
                continue
            else:
                logger.warning(
                    "Gemini API (%s) timed out after %d retries.",
                    model_name,
                    max_retries
                )
                return None, 504, last_error_text

    return None, last_status, last_error_text


def _parse_insights_json(
    raw_text: str,
    source: str,
    model_used: str,
    req: InsightsRequest,
    benchmark: Any
) -> InsightsResponse:
    """Parses clean JSON text from either Gemini or Groq into a structured InsightsResponse."""
    if raw_text.startswith("```json"):
        raw_text = raw_text[7:]
    if raw_text.startswith("```"):
        raw_text = raw_text[3:]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3]
    raw_text = raw_text.strip()

    parsed = json.loads(raw_text)

    # Build canonical fallback recommendations matching benchmark
    canonical_fallbacks = _build_canonical_recommendations(benchmark, req)
    canonical_titles = [
        "Canopy & Spatial Gap Strategy",
        "Urban Cooling & Ecological Resilience",
        "Sentinel-2 Monitoring & Verification"
    ]

    raw_recs = parsed.get("recommendations", [])
    recommendations: List[ActionableRecommendation] = []

    for idx, expected_title in enumerate(canonical_titles):
        fallback_rec = canonical_fallbacks[idx]
        # Look for matching card by title keyword or index
        matched_rec = None
        for r in raw_recs:
            r_title = str(r.get("title", "")).lower()
            if any(kw in r_title for kw in expected_title.lower().split(" & ")):
                matched_rec = r
                break
        if not matched_rec and idx < len(raw_recs):
            matched_rec = raw_recs[idx]

        if matched_rec:
            sev_str = str(matched_rec.get("severity", fallback_rec.severity.value)).lower()
            try:
                severity = InsightSeverity(sev_str)
            except ValueError:
                severity = fallback_rec.severity

            desc = str(matched_rec.get("description", "")).strip() or fallback_rec.description
            act = str(matched_rec.get("suggested_action", "")).strip() or fallback_rec.suggested_action

            recommendations.append(
                ActionableRecommendation(
                    title=expected_title,
                    description=desc,
                    severity=severity,
                    suggested_action=act
                )
            )
        else:
            recommendations.append(fallback_rec)

    # Parse and validate planting recommendations
    canonical_flora = _build_canonical_planting_recommendations(req)
    raw_flora = parsed.get("planting_recommendations", [])
    clean_flora: List[PlantingRecommendation] = []

    if isinstance(raw_flora, list) and len(raw_flora) >= 2:
        for idx, item in enumerate(raw_flora[:4]):
            if isinstance(item, dict) and item.get("plant_type"):
                specs = item.get("species_examples", [])
                if isinstance(specs, str):
                    specs = [s.strip() for s in specs.split(",") if s.strip()]
                elif not isinstance(specs, list):
                    specs = []
                fallback_item = canonical_flora[min(idx, len(canonical_flora) - 1)]
                clean_flora.append(
                    PlantingRecommendation(
                        plant_type=str(item.get("plant_type")).strip(),
                        species_examples=specs if specs else fallback_item.species_examples,
                        why_suited_for_area=str(item.get("why_suited_for_area", "")).strip() or fallback_item.why_suited_for_area,
                        area_benefits=str(item.get("area_benefits", "")).strip() or fallback_item.area_benefits,
                    )
                )

    if len(clean_flora) < 2:
        clean_flora = canonical_flora

    provider_name = "Groq" if source == "groq" else "Gemini"
    logger.info("Successfully synthesized grounded insights via %s AI (%s).", provider_name, model_used)
    return InsightsResponse(
        source=source,
        model_used=model_used,
        summary=parsed.get("summary", "Analysis completed successfully."),
        health_score=benchmark.health_score,
        overall_health_status=benchmark.overall_health_status,
        cooling_capacity_index=benchmark.cooling_capacity_index,
        green_deficit_hectares=benchmark.green_deficit_hectares,
        estimated_trees_needed=benchmark.estimated_trees_needed,
        canopy_assessment=parsed.get("canopy_assessment"),
        priority_action_areas=parsed.get("priority_action_areas"),
        monitoring_next_steps=parsed.get("monitoring_next_steps"),
        recommendations=recommendations,
        planting_recommendations=clean_flora,
        markdown=parsed.get("markdown", parsed.get("summary", "")),
        analysis_id=req.analysis_id,
    )


async def _invoke_groq_api(
    client: httpx.AsyncClient,
    model_name: str,
    api_key: str,
    prompt_text: str,
) -> Tuple[Optional[str], int, Optional[str]]:
    """
    Invokes the Groq OpenAI-compatible Chat Completions API with the grounded prompt.
    Returns (raw_content_string, status_code, error_text).
    """
    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a Senior Urban Forestry Scientist & Satellite Remote Sensing Specialist. "
                    "You analyze verified Sentinel-2 NDVI telemetry and respond with a strictly valid "
                    "JSON object matching the requested schema."
                )
            },
            {
                "role": "user",
                "content": prompt_text
            }
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0
    }

    try:
        logger.info("Calling Groq API fallback (%s)...", model_name)
        resp = await client.post(GROQ_API_ENDPOINT, json=payload, headers=headers, timeout=15.0)
        if resp.status_code == 200:
            data = resp.json()
            choices = data.get("choices", [])
            if choices and "message" in choices[0] and "content" in choices[0]["message"]:
                return choices[0]["message"]["content"], 200, None
            return None, 200, "Empty choices in Groq response"
        else:
            logger.warning("Groq API returned HTTP %d: %s", resp.status_code, resp.text[:250])
            return None, resp.status_code, resp.text[:250]
    except Exception as exc:
        logger.warning("Error invoking Groq API (%s: %r).", type(exc).__name__, exc)
        return None, 500, str(exc)


async def generate_ai_insights(req: InsightsRequest) -> InsightsResponse:
    """
    Synthesizes environmental insights using Gemini 3.8 Flash, cascading to Groq API
    if Gemini fails, or falling back to the deterministic urban forestry benchmark engine.
    Always locks Canopy Health Score and numeric stats to deterministic municipal benchmarks.
    """
    # 1. Deterministic Benchmark Math (Immutable Truth)
    benchmark = evaluate_environmental_insights(
        mean_ndvi=req.mean_ndvi,
        green_cover_pct=req.green_cover_percentage,
        total_area_hectares=req.total_area_hectares,
        dense_pct=req.dense_pct,
        moderate_pct=req.moderate_pct,
        sparse_pct=req.sparse_pct,
        deficit_pct=req.deficit_pct,
    )

    settings = get_settings()

    # Gemini config
    gemini_key = os.environ["GEMINI_API_KEY"] if "GEMINI_API_KEY" in os.environ else (settings.GEMINI_API_KEY or "")
    primary_gemini_model = os.environ["GEMINI_MODEL"] if "GEMINI_MODEL" in os.environ else (settings.GEMINI_MODEL or "gemini-3.8-flash")
    gemini_fallback_model = os.environ["GEMINI_FALLBACK_MODEL"] if "GEMINI_FALLBACK_MODEL" in os.environ else settings.GEMINI_FALLBACK_MODEL

    # Groq config (optional fallback)
    groq_key = os.environ["GROQ_API_KEY"] if "GROQ_API_KEY" in os.environ else (settings.GROQ_API_KEY or "")
    groq_model = os.environ["GROQ_MODEL"] if "GROQ_MODEL" in os.environ else (settings.GROQ_MODEL or "openai/gpt-oss-120b")

    has_gemini = bool(gemini_key and gemini_key.strip() and "placeholder" not in gemini_key.lower())
    has_groq = bool(groq_key and groq_key.strip() and "placeholder" not in groq_key.lower())

    if not has_gemini and not has_groq:
        logger.info("Neither GEMINI_API_KEY nor GROQ_API_KEY configured. Using deterministic urban forestry engine.")
        return _generate_fallback_insights(req, benchmark)

    prompt_text = _build_grounded_prompt(req, benchmark)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. Attempt Gemini if configured
            if has_gemini:
                data, status_code, err_text = await _invoke_gemini_with_retries(
                    client=client,
                    model_name=primary_gemini_model,
                    api_key=gemini_key,
                    prompt_text=prompt_text,
                    max_retries=2
                )
                model_used = primary_gemini_model

                # Try secondary Gemini fallback model if configured
                if not data and gemini_fallback_model and gemini_fallback_model.strip() and gemini_fallback_model.strip() != primary_gemini_model:
                    sec_model = gemini_fallback_model.strip()
                    logger.info(
                        "Primary Gemini model '%s' unavailable (HTTP %d). Attempting secondary fallback model '%s'...",
                        primary_gemini_model,
                        status_code,
                        sec_model
                    )
                    fb_data, fb_status, fb_err = await _invoke_gemini_with_retries(
                        client=client,
                        model_name=sec_model,
                        api_key=gemini_key,
                        prompt_text=prompt_text,
                        max_retries=0
                    )
                    if fb_data:
                        data = fb_data
                        model_used = sec_model

                if data:
                    candidates = data.get("candidates", [])
                    content_parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
                    raw_text = None
                    for part in content_parts:
                        if part.get("thought") is True:
                            continue
                        if "text" in part and part["text"].strip():
                            raw_text = part["text"].strip()
                            break
                    if not raw_text:
                        for part in reversed(content_parts):
                            if "text" in part and part["text"].strip():
                                raw_text = part["text"].strip()
                                break
                    if raw_text:
                        return _parse_insights_json(raw_text, source="gemini", model_used=model_used, req=req, benchmark=benchmark)

                logger.warning("Gemini AI synthesis unavailable (last status %d).", status_code)

            # 2. Attempt Groq API if configured and Gemini was unavailable
            if has_groq:
                logger.info("Attempting Groq API fallback (%s)...", groq_model)
                groq_content, groq_status, groq_err = await _invoke_groq_api(
                    client=client,
                    model_name=groq_model,
                    api_key=groq_key,
                    prompt_text=prompt_text
                )
                if groq_content:
                    return _parse_insights_json(groq_content, source="groq", model_used=groq_model, req=req, benchmark=benchmark)
                logger.warning("Groq API fallback failed (HTTP %d).", groq_status)

            # 3. Final Fallback to Deterministic Engine
            logger.info("All configured AI providers unavailable. Falling back cleanly to deterministic engine.")
            return _generate_fallback_insights(req, benchmark)

    except Exception as exc:
        logger.warning(
            "Error in AI insights synthesis chain (%s: %r). Falling back cleanly to deterministic engine.",
            type(exc).__name__,
            exc
        )
        return _generate_fallback_insights(req, benchmark)
