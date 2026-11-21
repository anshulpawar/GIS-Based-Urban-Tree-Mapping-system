"""
AI Insights Service for Urban Tree Mapping & Green-Cover Assessment.

Synthesizes high-level ecological diagnostics and actionable urban forestry
recommendations using Google Gemini REST API (gemini-2.5-flash) grounded strictly
in verified Sentinel-2 NDVI metrics, with automatic fallback to a deterministic
urban forestry rule engine.
"""

import json
import logging
from typing import Any, Dict, List, Optional
import httpx

from app.config import get_settings
from app.features.insights.schemas import (
    ActionableRecommendation,
    InsightSeverity,
    InsightsRequest,
    InsightsResponse,
)
from app.features.insights.service import evaluate_environmental_insights

logger = logging.getLogger(__name__)

GEMINI_API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def _build_grounded_prompt(req: InsightsRequest) -> str:
    """Constructs a strictly grounded prompt with verified Sentinel-2 NDVI telemetry."""
    green_ha = req.green_cover_hectares
    if green_ha is None:
        green_ha = round(req.total_area_hectares * (req.green_cover_percentage / 100.0), 2)

    temporal_info = ""
    if req.delta_ndvi is not None:
        temporal_info = f"- Temporal Mean Delta NDVI: {req.delta_ndvi:+.3f} (compared against {req.historical_date or 'Historical Baseline'})\n"

    prompt = f"""You are an expert Urban Forestry & Remote Sensing Analyst evaluating Copernicus Sentinel-2 satellite telemetry for an urban study area.

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
STRICT SCIENTIFIC & FORMATTING GUIDELINES:
1. Ground every statement strictly in the telemetry numbers provided above.
2. DO NOT claim machine learning or optical stem-counting. Sentinel-2 measures aggregate multispectral reflectance at 10m spatial resolution, not individual tree counts.
3. Compare the green cover percentage against the World Health Organization (WHO) municipal standard of 30% urban canopy cover.
4. DO NOT repeat the raw statistics as a bulleted checklist; the user already views those metrics in the application header.
5. In the markdown report, provide a cohesive two-part narrative:
   - Part 1: "## 1. Current Canopy & Ecological Assessment" — Clearly explain the area's current vegetation situation, canopy tier balance, microclimate cooling, and deficit/surplus profile from the metrics.
   - Part 2: "## 2. Strategic Interventions & Urban Management Plan" — Conclude with concrete, practical ways to improve or manage the area based on its actual canopy tier distribution and deficit profile.

RESPONSE FORMAT REQUIREMENTS:
You MUST respond with a single valid JSON object with EXACTLY the following structure (no surrounding markdown code blocks):
{{
  "summary": "2-3 sentences concise executive summary of the canopy health and spatial distribution.",
  "overall_health_status": "Short title, e.g. 'Severe Canopy Deficit' or 'Healthy Contiguous Canopy'",
  "health_score": <integer between 5 and 100>,
  "cooling_capacity_index": "Low", "Moderate", "High", or "Optimal",
  "green_deficit_hectares": <float representing hectares needed to reach 30% canopy, or 0.0>,
  "estimated_trees_needed": <integer calculated at ~400 trees per hectare of deficit, or 0>,
  "canopy_assessment": "Cohesive diagnostic paragraph evaluating vegetative health, tier distribution, and microclimate influence without bullet points.",
  "priority_action_areas": "Paragraph detailing concrete urban zones needing intervention or conservation.",
  "monitoring_next_steps": "Paragraph outlining satellite monitoring and field verification cadence.",
  "recommendations": [
    {{
      "title": "Short title of action",
      "description": "Specific rationale grounded in the NDVI figures.",
      "severity": "critical" | "warning" | "moderate" | "healthy",
      "suggested_action": "Concrete municipal intervention (e.g. bioswales, native street tree corridors, cool pavements)."
    }}
  ],
  "markdown": "A two-part report with sections: ## 1. Current Canopy & Ecological Assessment (explaining the area's current vegetation situation from the metrics without raw metric lists), and ## 2. Strategic Interventions & Urban Management Plan (concrete, practical ways to improve or manage the area based on the actual canopy tiers and deficit/surplus profile)."
}}
"""
    return prompt


def _generate_fallback_insights(req: InsightsRequest) -> InsightsResponse:
    """Generates a robust deterministic urban forestry report if Gemini is unavailable."""
    report = evaluate_environmental_insights(
        mean_ndvi=req.mean_ndvi,
        green_cover_pct=req.green_cover_percentage,
        total_area_hectares=req.total_area_hectares,
        dense_pct=req.dense_pct,
        moderate_pct=req.moderate_pct,
        sparse_pct=req.sparse_pct,
        deficit_pct=req.deficit_pct,
    )

    green_ha = req.green_cover_hectares
    if green_ha is None:
        green_ha = round(req.total_area_hectares * (req.green_cover_percentage / 100.0), 2)

    dense_val = round(req.dense_pct or 0.0, 1)
    moderate_val = round(req.moderate_pct or 0.0, 1)
    sparse_val = round(req.sparse_pct or 0.0, 1)
    deficit_val = round(req.deficit_pct or 0.0, 1)

    # Executive Summary
    summary = (
        f"Evaluation of {req.area_name} ({req.total_area_hectares:.1f} ha) reveals a mean NDVI of {req.mean_ndvi:.3f} "
        f"with {req.green_cover_percentage:.1f}% vegetative canopy cover ({green_ha:.1f} ha). "
        f"Overall canopy status is categorized as {report.overall_health_status}, with an urban cooling index rated as {report.cooling_capacity_index}."
    )

    # Diagnostic Situation Analysis (No raw metric list)
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
        for r in report.recommendations
    ])

    monitoring_steps = (
        "Establish automated bi-monthly Sentinel-2 multispectral scans to track seasonal phenology changes, "
        "detect moisture stress hotspots early, and benchmark canopy vitality against the verified NDVI baseline."
    )

    markdown_report = f"""## 1. Current Canopy & Ecological Assessment
{situation_text}

## 2. Strategic Interventions & Urban Management Plan
{action_text}

{recs_md}

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
        recommendations=report.recommendations,
        markdown=markdown_report,
        analysis_id=req.analysis_id,
    )


async def generate_ai_insights(req: InsightsRequest) -> InsightsResponse:
    """
    Synthesizes environmental insights using Gemini 2.5 Flash, or falls back to
    the deterministic urban forestry benchmark engine if the key is missing or calls fail.
    """
    import os
    settings = get_settings()
    api_key = os.getenv("GEMINI_API_KEY") or settings.GEMINI_API_KEY
    model_name = os.getenv("GEMINI_MODEL") or settings.GEMINI_MODEL or "gemini-2.5-flash"

    if not api_key or not api_key.strip() or "placeholder" in api_key.lower():
        logger.info("GEMINI_API_KEY not configured or placeholder. Using deterministic urban forestry engine.")
        return _generate_fallback_insights(req)

    url = GEMINI_API_ENDPOINT.format(model=model_name) + f"?key={api_key.strip()}"
    prompt_text = _build_grounded_prompt(req)

    request_body = {
        "contents": [
            {
                "parts": [
                    {"text": prompt_text}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json"
        }
    }

    try:
        logger.info("Calling Gemini REST API (%s) for AOI '%s'...", model_name, req.area_name)
        async with httpx.AsyncClient(timeout=18.0) as client:
            resp = await client.post(url, json=request_body)
            if resp.status_code != 200:
                logger.warning(
                    "Gemini API returned HTTP %d: %s. Falling back to deterministic engine.",
                    resp.status_code,
                    resp.text[:250]
                )
                return _generate_fallback_insights(req)

            data = resp.json()
            candidates = data.get("candidates", [])
            if not candidates:
                logger.warning("Gemini response contained no candidates. Falling back.")
                return _generate_fallback_insights(req)

            content_parts = candidates[0].get("content", {}).get("parts", [])
            if not content_parts or "text" not in content_parts[0]:
                logger.warning("Empty text parts in Gemini response. Falling back.")
                return _generate_fallback_insights(req)

            raw_text = content_parts[0]["text"].strip()
            # Clean possible markdown wrapping if returned
            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            if raw_text.startswith("```"):
                raw_text = raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]
            raw_text = raw_text.strip()

            parsed = json.loads(raw_text)

            # Parse recommendations safely into ActionableRecommendation models
            raw_recs = parsed.get("recommendations", [])
            recommendations: List[ActionableRecommendation] = []
            for r in raw_recs:
                sev_str = str(r.get("severity", "moderate")).lower()
                try:
                    severity = InsightSeverity(sev_str)
                except ValueError:
                    severity = InsightSeverity.MODERATE

                recommendations.append(
                    ActionableRecommendation(
                        title=r.get("title", "Intervention Recommendation"),
                        description=r.get("description", ""),
                        severity=severity,
                        suggested_action=r.get("suggested_action", "")
                    )
                )

            logger.info("Successfully synthesized grounded insights via Gemini AI (%s).", model_name)
            return InsightsResponse(
                source="gemini",
                model_used=model_name,
                summary=parsed.get("summary", "Analysis completed successfully."),
                health_score=int(parsed.get("health_score", 70)),
                overall_health_status=parsed.get("overall_health_status", "Evaluated Canopy"),
                cooling_capacity_index=parsed.get("cooling_capacity_index", "Moderate"),
                green_deficit_hectares=float(parsed.get("green_deficit_hectares") or 0.0),
                estimated_trees_needed=int(parsed.get("estimated_trees_needed") or 0),
                canopy_assessment=parsed.get("canopy_assessment"),
                priority_action_areas=parsed.get("priority_action_areas"),
                monitoring_next_steps=parsed.get("monitoring_next_steps"),
                recommendations=recommendations,
                markdown=parsed.get("markdown", parsed.get("summary", "")),
                analysis_id=req.analysis_id,
            )

    except Exception as exc:
        logger.warning("Error invoking Gemini API (%s). Falling back cleanly to deterministic engine.", exc)
        return _generate_fallback_insights(req)
