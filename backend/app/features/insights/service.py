"""
Deterministic Environmental Insights Service.

Applies algorithmic rules and urban forestry benchmarks (such as the WHO 30%
urban tree canopy guideline) to calculate green deficit, canopy health status,
and actionable planting recommendations tailored to the study area's actual metrics.
"""

import math
from typing import List, Optional
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
    total_area_hectares: float,
    dense_pct: Optional[float] = None,
    moderate_pct: Optional[float] = None,
    sparse_pct: Optional[float] = None,
    deficit_pct: Optional[float] = None,
) -> InsightReport:
    """
    Evaluates vegetation coverage against urban planning benchmarks.

    Args:
        mean_ndvi (float): Mean NDVI index (-1.0 to 1.0).
        green_cover_pct (float): Percentage of area covered by vegetation (NDVI >= 0.3).
        total_area_hectares (float): Total area of the selected polygon in hectares.
        dense_pct (float, optional): Dense canopy tier percentage (NDVI >= 0.6).
        moderate_pct (float, optional): Moderate canopy tier percentage (0.4 <= NDVI < 0.6).
        sparse_pct (float, optional): Sparse vegetation tier percentage (0.2 <= NDVI < 0.4).
        deficit_pct (float, optional): Non-vegetated / built-up tier percentage (NDVI < 0.2).

    Returns:
        InsightReport: Complete breakdown of health score, green deficit, and interventions.
    """
    recommendations: List[ActionableRecommendation] = []

    # Safe tier value normalization
    green_ha = round(total_area_hectares * (green_cover_pct / 100.0), 2)
    dense_val = round(dense_pct, 1) if dense_pct is not None else round(green_cover_pct * 0.55, 1)
    moderate_val = round(moderate_pct, 1) if moderate_pct is not None else round(green_cover_pct * 0.45, 1)
    sparse_val = round(sparse_pct, 1) if sparse_pct is not None else round((100.0 - green_cover_pct) * 0.45, 1)
    deficit_val = round(deficit_pct, 1) if deficit_pct is not None else round((100.0 - green_cover_pct) * 0.55, 1)

    # 1. Deficit math (preserves positive values when < 30%, exactly 0 ha / ~0 trees when >= 30%)
    target_coverage_ratio = TARGET_GREEN_COVER_PCT / 100.0
    actual_coverage_ratio = max(0.0, green_cover_pct / 100.0)

    deficit_ratio = max(0.0, target_coverage_ratio - actual_coverage_ratio)
    deficit_hectares = round(deficit_ratio * total_area_hectares, 2)
    trees_needed = int(math.ceil(deficit_hectares * TREES_PER_HECTARE_BENCHMARK))

    # 2. Canopy Health and Score Computation
    # Normalized score: base 100 scaled on NDVI and green coverage
    health_score = int(round(min(100.0, max(5.0, (mean_ndvi * 60.0) + (green_cover_pct * 0.4)))))

    if green_cover_pct < 15.0 or mean_ndvi < 0.2:
        health_status = "Critical Green Deficit"
        cooling_capacity = "Low (High Urban Heat Island Risk)"

        recommendations.append(
            ActionableRecommendation(
                title="Sustained Ecological Conservation",
                description=(
                    f"Vegetation covers only {green_cover_pct:.1f}% ({green_ha:.1f} ha) of the {total_area_hectares:.1f} ha boundary, "
                    f"creating a severe {deficit_hectares:.1f} ha green deficit below the WHO 30% standard. "
                    f"Existing mature canopy ({dense_val:.1f}%) is severely fragmented amidst {deficit_val:.1f}% impervious built-up surface."
                ),
                severity=InsightSeverity.CRITICAL,
                suggested_action=(
                    f"Prioritize urgent preservation of all surviving mature tree clusters while deploying fast-growing "
                    f"native shade corridors (~{trees_needed:,} trees) along arterial roads and asphalt corridors to alleviate extreme heat island stress."
                ),
            )
        )
        recommendations.append(
            ActionableRecommendation(
                title="Canopy Health Monitoring",
                description=(
                    f"Critically depressed mean NDVI of {mean_ndvi:.3f} reflects severe vegetative deficit and elevated surface heat "
                    f"retention across the {deficit_val:.1f}% non-vegetated footprint. Close multispectral surveillance is required "
                    f"to halt further canopy loss and verify sapling survivability."
                ),
                severity=InsightSeverity.CRITICAL,
                suggested_action=(
                    "Deploy bi-weekly Sentinel-2 NDVI comparative scans to monitor thermal stress hotspots and track "
                    "root-zone hydration across newly planted green infrastructure."
                ),
            )
        )

    elif green_cover_pct < 30.0 or mean_ndvi < 0.4:
        health_status = "Moderate Green Deficit"
        cooling_capacity = "Moderate (Seasonal Thermal Vulnerability)"
        gap_pct = round(TARGET_GREEN_COVER_PCT - green_cover_pct, 1)

        recommendations.append(
            ActionableRecommendation(
                title="Sustained Ecological Conservation",
                description=(
                    f"Canopy cover is currently {green_cover_pct:.1f}% ({green_ha:.1f} ha) across the {total_area_hectares:.1f} ha study area, "
                    f"lagging {gap_pct:.1f}% behind the WHO recommended 30% municipal threshold. "
                    f"Non-vegetated surfaces ({deficit_val:.1f}%) dominate the landscape, increasing localized runoff and microclimate vulnerability."
                ),
                severity=InsightSeverity.WARNING,
                suggested_action=(
                    f"Mandate urban infill planting of ~{trees_needed:,} native shade saplings across public parks, school grounds, "
                    f"and wide sidewalks to restore {deficit_hectares:.1f} ha of canopy and reinforce existing {dense_val:.1f}% mature clusters."
                ),
            )
        )
        recommendations.append(
            ActionableRecommendation(
                title="Canopy Health Monitoring",
                description=(
                    f"With a moderate mean NDVI of {mean_ndvi:.3f} and {moderate_val:.1f}% intermediate vegetative cover, the area "
                    f"exhibits seasonal thermal vulnerability and disconnected ecological corridors across the {total_area_hectares:.1f} ha boundary."
                ),
                severity=InsightSeverity.WARNING,
                suggested_action=(
                    "Establish monthly Sentinel-2 NDVI spectral tracking to monitor canopy moisture stress, assess seasonal dieback, "
                    "and measure canopy infill progress toward the 30% target."
                ),
            )
        )

    else:
        health_status = "Optimal Canopy Cover"
        cooling_capacity = "High (Effective Natural Cooling)"

        recommendations.append(
            ActionableRecommendation(
                title="Sustained Ecological Conservation",
                description=(
                    f"Canopy coverage stands at an optimal {green_cover_pct:.1f}% ({green_ha:.1f} ha of {total_area_hectares:.1f} ha), "
                    f"with {dense_val:.1f}% dense canopy and {moderate_val:.1f}% moderate vegetation providing robust microclimate cooling and rainwater absorption."
                ),
                severity=InsightSeverity.HEALTHY,
                suggested_action=(
                    f"Enact municipal conservation easements and root-zone protection ordinances to shield the {dense_val:.1f}% "
                    f"mature dense tree stands from construction encroachment or utility trenching."
                ),
            )
        )
        recommendations.append(
            ActionableRecommendation(
                title="Canopy Health Monitoring",
                description=(
                    f"Healthy mean NDVI of {mean_ndvi:.3f} indicates vigorous vegetative vitality across the {green_ha:.1f} ha canopy; "
                    f"continuous multi-spectral surveillance is recommended to detect early seasonal drought stress, pest infestation, or canopy thinning."
                ),
                severity=InsightSeverity.HEALTHY,
                suggested_action=(
                    f"Schedule bi-monthly automated Sentinel-2 NDVI comparative scans to benchmark canopy vitality against "
                    f"the {mean_ndvi:.3f} baseline and safeguard contiguous green corridors."
                ),
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
