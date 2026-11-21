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


class InsightsRequest(BaseModel):
    """
    Request payload containing verified Sentinel-2 NDVI metrics for AI or rule-based synthesis.
    """
    analysis_id: Optional[str] = Field(None, description="Optional UUID of saved analysis record")
    area_name: Optional[str] = Field("Custom Selected Area", description="Name or label of the study area")
    total_area_hectares: float = Field(..., description="Total area of AOI in hectares")
    green_cover_percentage: float = Field(..., description="Vegetation cover percentage (NDVI >= 0.3)")
    green_cover_hectares: Optional[float] = Field(None, description="Total vegetation area in hectares")
    mean_ndvi: float = Field(..., description="Mean NDVI (-1.0 to 1.0)")
    dense_pct: Optional[float] = Field(0.0, description="Dense canopy percentage (NDVI >= 0.6)")
    moderate_pct: Optional[float] = Field(0.0, description="Moderate cover percentage (0.4 <= NDVI < 0.6)")
    sparse_pct: Optional[float] = Field(0.0, description="Sparse vegetation percentage (0.2 <= NDVI < 0.4)")
    deficit_pct: Optional[float] = Field(0.0, description="Non-vegetated / built-up percentage (NDVI < 0.2)")
    satellite_date_used: Optional[str] = Field(None, description="Acquisition date of the Sentinel-2 image")
    delta_ndvi: Optional[float] = Field(None, description="Optional temporal change in mean NDVI")
    historical_date: Optional[str] = Field(None, description="Optional historical comparison date")


class InsightsResponse(BaseModel):
    """
    Synthesized environmental insight response combining structured metrics and rich narrative.
    """
    source: str = Field(..., description="Source of insights: 'gemini' or 'fallback'")
    model_used: str = Field(..., description="Specific model or engine identifier")
    summary: str = Field(..., description="Executive summary of the vegetative assessment")
    health_score: int = Field(..., ge=0, le=100, description="Normalized urban canopy score (0-100)")
    overall_health_status: str = Field(..., description="Categorical health assessment")
    cooling_capacity_index: Optional[str] = Field(None, description="Urban cooling rating")
    green_deficit_hectares: Optional[float] = Field(None, description="Hectares needed for 30% canopy target")
    estimated_trees_needed: Optional[int] = Field(None, description="Estimated trees needed to reach target")
    canopy_assessment: Optional[str] = Field(None, description="Assessment of canopy density & health")
    priority_action_areas: Optional[str] = Field(None, description="Identified priority deficit zones")
    monitoring_next_steps: Optional[str] = Field(None, description="Recommended remote sensing monitoring steps")
    recommendations: List[ActionableRecommendation] = Field(
        default_factory=list,
        description="Structured action items with severity ratings"
    )
    markdown: str = Field(..., description="Full structured markdown narrative report")
    analysis_id: Optional[str] = Field(None, description="Associated analysis record UUID if provided")


