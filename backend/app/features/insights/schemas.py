"""
Insights Feature Validation Schemas.

Pydantic schemas modeling deterministic environmental assessment output,
green-deficit indicators, and actionable urban forestry recommendations.
"""

from typing import List, Optional
from enum import Enum
from pydantic import BaseModel, Field


class InsightSeverity(str, Enum):
    """
    Severity alert levels for environmental diagnostics.
    """
    CRITICAL = "critical"
    WARNING = "warning"
    MODERATE = "moderate"
    HEALTHY = "healthy"


class ActionableRecommendation(BaseModel):
    """
    Specific recommendation card tailored to the observed vegetation deficit.
    """
    title: str = Field(..., description="Short headline of the recommendation")
    description: str = Field(..., description="Detailed diagnosis and ecological impact")
    severity: InsightSeverity = Field(..., description="Priority severity level")
    suggested_action: str = Field(..., description="Direct intervention suggested (e.g. street tree planting)")


class InsightReport(BaseModel):
    """
    Full environmental insight and green-deficit evaluation report.
    """
    overall_health_status: str = Field(..., description="Categorical health assessment (e.g. 'Severe Green Deficit')")
    health_score: int = Field(..., ge=0, le=100, description="Normalized urban canopy score from 0 to 100")
    green_deficit_hectares: float = Field(..., description="Estimated hectares needed to meet 30% urban canopy target")
    estimated_trees_needed: int = Field(..., description="Calculated count of trees needed to offset green deficit")
    cooling_capacity_index: str = Field(..., description="Urban heat island mitigation rating (Low, Medium, High)")
    recommendations: List[ActionableRecommendation] = Field(
        default_factory=list,
        description="List of priority interventions and warnings"
    )

