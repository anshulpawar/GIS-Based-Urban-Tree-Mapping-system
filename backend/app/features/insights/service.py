"""
Deterministic Environmental Insights Service.

Applies algorithmic rules and urban forestry benchmarks (such as the WHO 30%
urban tree canopy guideline) to calculate green deficit, canopy health status,
and actionable planting recommendations.
"""

import math
from typing import List
from app.features.insights.schemas import (
    InsightReport,
    ActionableRecommendation,
    InsightSeverity,
)

# Standard Urban Forestry Constant: ~400 mature shade trees per hectare
TREES_PER_HECTARE_BENCHMARK = 400
TARGET_GREEN_COVER_PCT = 30.0


def evaluate_environmental_insights(
    mean_ndvi: float,
    green_cover_pct: float,
    total_area_hectares: float
) -> InsightReport:
    """
    Evaluates vegetation coverage against urban planning benchmarks.

    Args:
        mean_ndvi (float): Mean NDVI index (-1.0 to 1.0).
        green_cover_pct (float): Percentage of area covered by vegetation (NDVI >= 0.3).
        total_area_hectares (float): Total area of the selected polygon in hectares.

    Returns:
        InsightReport: Complete breakdown of health score, green deficit, and interventions.
    """
    recommendations: List[ActionableRecommendation] = []

    # 1. Deficit math
    target_coverage_ratio = TARGET_GREEN_COVER_PCT / 100.0
    actual_coverage_ratio = max(0.0, green_cover_pct / 100.0)

    deficit_ratio = max(0.0, target_coverage_ratio - actual_coverage_ratio)
    deficit_hectares = round(deficit_ratio * total_area_hectares, 2)
    trees_needed = int(math.ceil(deficit_hectares * TREES_PER_HECTARE_BENCHMARK))

    # 2. Canopy Health and Score Computation
    # Normalized score: base 100 scaled on NDVI and green coverage
    health_score = int(min(100.0, max(5.0, (mean_ndvi * 60.0) + (green_cover_pct * 0.4))))

    if green_cover_pct < 15.0 or mean_ndvi < 0.2:
        health_status = "Critical Green Deficit"
        cooling_capacity = "Low (High Urban Heat Island Risk)"
        recommendations.append(
            ActionableRecommendation(
                title="Urban Heat Island Red Alert",
                description="Vegetation cover is critically below the 15% ecological threshold, inducing microclimate heat stress.",
                severity=InsightSeverity.CRITICAL,
                suggested_action="Deploy emergency rapid-growth street tree corridors and reflective/green roofs along road networks."
            )
        )
        recommendations.append(
            ActionableRecommendation(
                title="Impervious Surface Mitigation",
                description="Dense built-up surfaces impede rainwater infiltration and escalate runoff volume.",
                severity=InsightSeverity.WARNING,
                suggested_action="Convert underutilized asphalt parking and vacant lots into bioswales and micro-forests."
            )
        )
    elif green_cover_pct < 30.0 or mean_ndvi < 0.4:
        health_status = "Moderate Green Deficit"
        cooling_capacity = "Moderate (Seasonal Thermal Vulnerability)"
        recommendations.append(
            ActionableRecommendation(
                title="Canopy Infill Target",
                description=f"Area is {round(TARGET_GREEN_COVER_PCT - green_cover_pct, 1)}% below the WHO recommended 30% canopy standard.",
                severity=InsightSeverity.WARNING,
                suggested_action=f"Plant approximately {trees_needed} native shade trees in parks, schoolyards, and residential easements."
            )
        )
        recommendations.append(
            ActionableRecommendation(
                title="Biodiversity Enhancement",
                description="Existing greenery shows fragmented continuity, restricting local pollinator pathways.",
                severity=InsightSeverity.MODERATE,
                suggested_action="Introduce multi-tier native shrubs and understory plantings beneath existing street trees."
            )
        )
    else:
        health_status = "Optimal Canopy Cover"
        cooling_capacity = "High (Effective Natural Cooling)"
        recommendations.append(
            ActionableRecommendation(
                title="Sustained Ecological Conservation",
                description="Green cover satisfies healthy municipal urban forest standards.",
                severity=InsightSeverity.HEALTHY,
                suggested_action="Establish conservation easements and tree preservation ordinances to protect mature tree roots."
            )
        )
        recommendations.append(
            ActionableRecommendation(
                title="Canopy Health Monitoring",
                description="Continuous satellite spectral monitoring recommended to detect seasonal pest stress or drought early.",
                severity=InsightSeverity.HEALTHY,
                suggested_action="Schedule bi-monthly automated Sentinel-2 NDVI comparative scans."
            )
        )

    return InsightReport(
        overall_health_status=health_status,
        health_score=health_score,
        green_deficit_hectares=deficit_hectares,
        estimated_trees_needed=trees_needed,
        cooling_capacity_index=cooling_capacity,
        recommendations=recommendations,
    )

