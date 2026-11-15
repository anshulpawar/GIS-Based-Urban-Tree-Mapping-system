"""
Insights Feature Module.

Applies deterministic environmental rules and WHO/urban forestry benchmarks
to generate canopy health diagnostics, green deficit warnings, and planting recommendations.
"""

from app.features.insights.service import evaluate_environmental_insights
from app.features.insights.schemas import InsightReport

__all__ = ["evaluate_environmental_insights", "InsightReport"]

