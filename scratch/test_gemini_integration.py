import sys
sys.path.insert(0, 'backend')
import os
import asyncio
import logging
from unittest.mock import patch, MagicMock
import httpx

# Configure logging capture
logger = logging.getLogger("app.services.insights_service")
log_records = []
class LogHandler(logging.Handler):
    def emit(self, record):
        log_records.append(record.getMessage())
test_handler = LogHandler()
logger.addHandler(test_handler)

# 1. Test Proxy Import & Config
from app.core.config import Settings, get_settings
s = get_settings()
print('Proxy config import OK:', s.PROJECT_NAME)
assert s.GEMINI_MODEL == "gemini-3.8-flash", f"Expected gemini-3.8-flash, got {s.GEMINI_MODEL}"
assert hasattr(s, "GEMINI_FALLBACK_MODEL"), "Expected GEMINI_FALLBACK_MODEL attribute in Settings"
assert hasattr(s, "GROQ_API_KEY"), "Expected GROQ_API_KEY attribute in Settings"
assert s.GROQ_MODEL == "openai/gpt-oss-120b", f"Expected openai/gpt-oss-120b, got {s.GROQ_MODEL}"

from app.features.insights.schemas import InsightsRequest, InsightsResponse
from app.features.insights.service import evaluate_environmental_insights
from app.services.insights_service import generate_ai_insights
from app.features.insights.router import generate_insights_endpoint

req = InsightsRequest(
    area_name='Cubbon Park Unit Test',
    total_area_hectares=120.0,
    green_cover_percentage=65.0,
    mean_ndvi=0.55
)

# Reference benchmark calculation:
# health_score = int(min(100.0, max(5.0, (0.55 * 60.0) + (65.0 * 0.4)))) = 59
# green_deficit_hectares = 0.0, estimated_trees_needed = 0
# overall_health_status = "Substantial Urban Canopy", cooling = "High"
expected_benchmark = evaluate_environmental_insights(
    mean_ndvi=req.mean_ndvi,
    green_cover_pct=req.green_cover_percentage,
    total_area_hectares=req.total_area_hectares
)
assert expected_benchmark.health_score == 59
assert expected_benchmark.green_deficit_hectares == 0.0
assert expected_benchmark.estimated_trees_needed == 0
assert expected_benchmark.cooling_capacity_index == "High (Effective Natural Cooling)"
assert expected_benchmark.overall_health_status == "Optimal Canopy Cover"

CANONICAL_TITLES = [
    "Canopy & Spatial Gap Strategy",
    "Urban Cooling & Ecological Resilience",
    "Sentinel-2 Monitoring & Verification"
]

# 2. Test Fallback (Neither Gemini nor Groq Key)
os.environ['GEMINI_API_KEY'] = ''
os.environ['GROQ_API_KEY'] = ''
res_fallback = asyncio.run(generate_ai_insights(req))
print('Fallback mode OK:', res_fallback.source, '| Model:', res_fallback.model_used)
assert res_fallback.source == 'fallback'
assert 'Deterministic' in res_fallback.model_used
assert res_fallback.health_score == expected_benchmark.health_score == 59
assert res_fallback.overall_health_status == expected_benchmark.overall_health_status
assert res_fallback.cooling_capacity_index == expected_benchmark.cooling_capacity_index
assert res_fallback.green_deficit_hectares == 0.0
assert res_fallback.estimated_trees_needed == 0
assert [r.title for r in res_fallback.recommendations] == CANONICAL_TITLES
assert len(res_fallback.planting_recommendations) == 4, f"Expected 4 canonical flora groups, got {len(res_fallback.planting_recommendations)}"
assert any("Canopy Shade Trees" in f.plant_type for f in res_fallback.planting_recommendations)
assert any("Urban Street & Avenue Trees" in f.plant_type for f in res_fallback.planting_recommendations)
assert any("Native Understory" in f.plant_type for f in res_fallback.planting_recommendations)
assert any("Bioswale" in f.plant_type for f in res_fallback.planting_recommendations)
assert "## 3. Recommended Flora & Ecological Benefits" in res_fallback.markdown
print('Fallback Flora Recommendations & Markdown OK!')

# 3. Test Invalid Key Fallback (HTTP 400 - Should NOT retry)
os.environ['GEMINI_API_KEY'] = 'AIzaSy_fake_invalid_test_key_12345'
os.environ['GROQ_API_KEY'] = ''
call_count_400 = 0

class Mock400Response:
    def __init__(self):
        self.status_code = 400
        self.text = '{"error": {"code": 400, "message": "API key not valid"}}'
    def json(self):
        return {}

async def mock_post_400(self, url, *args, **kwargs):
    global call_count_400
    call_count_400 += 1
    return Mock400Response()

with patch('httpx.AsyncClient.post', new=mock_post_400):
    res_invalid = asyncio.run(generate_ai_insights(req))
    print('HTTP 400 Graceful Drop (No Retries): Calls =', call_count_400)
    assert call_count_400 == 1, f"Expected 1 call for 400 without retrying, got {call_count_400}"
    assert res_invalid.source == 'fallback'
    assert res_invalid.health_score == 59

# Standard valid Gemini response payload with intentionally divergent numbers
# to prove deterministic backend override locks the numbers
mock_gemini_payload = {
    'candidates': [
        {
            'content': {
                'parts': [
                    {
                        'thought': True,
                        'text': 'Internal reasoning: evaluating Sentinel-2 NDVI metrics for Cubbon Park...'
                    },
                    {
                        'text': '''{
                            "summary": "Gemini 3.8 Flash analysis of Cubbon Park with robust canopy cover.",
                            "overall_health_status": "Invented High Status",
                            "health_score": 99,
                            "cooling_capacity_index": "Invented Cooling",
                            "green_deficit_hectares": 42.5,
                            "estimated_trees_needed": 17000,
                            "canopy_assessment": "High density mature tree canopy across the boundary.",
                            "priority_action_areas": "Maintain mature root zones.",
                            "monitoring_next_steps": "Quarterly Sentinel-2 NDVI monitoring.",
                            "recommendations": [
                                {
                                    "title": "Random Card Title 1",
                                    "description": "Protective buffer recommended.",
                                    "severity": "healthy",
                                    "suggested_action": "Enact conservation easements."
                                }
                            ],
                            "planting_recommendations": [
                                {
                                    "plant_type": "Canopy Shade Trees (Parklands & Open Infill)",
                                    "species_examples": ["Pongamia pinnata", "Azadirachta indica"],
                                    "why_suited_for_area": "Deep root structure fits urban soils.",
                                    "area_benefits": "High microclimate cooling."
                                },
                                {
                                    "plant_type": "Urban Street & Avenue Trees",
                                    "species_examples": ["Cassia fistula", "Tabebuia rosea"],
                                    "why_suited_for_area": "Non-invasive roots avoid sidewalk damage.",
                                    "area_benefits": "Transit shading."
                                },
                                {
                                    "plant_type": "Native Understory Shrubs",
                                    "species_examples": ["Justicia adhatoda", "Ixora coccinea"],
                                    "why_suited_for_area": "Thrives in sub-canopy shade.",
                                    "area_benefits": "Soil moisture retention."
                                }
                            ],
                            "markdown": "## 1. Ground-Truth Canopy & Microclimate Assessment\\n\\nGemini synthesized assessment.\\n\\n## 2. Practical Urban Forestry Management & Infill Strategy\\n\\nGemini action plan.\\n\\n## 3. Recommended Flora & Ecological Benefits\\n\\nFlora report."
                        }'''
                    }
                ]
            }
        }
    ]
}

# Standard valid Groq response payload with intentionally divergent numbers
mock_groq_payload = {
    "id": "chatcmpl-test-mock-123",
    "choices": [
        {
            "message": {
                "role": "assistant",
                "content": '''{
                    "summary": "Groq LPU synthesized assessment for Cubbon Park.",
                    "overall_health_status": "Invented Groq Status",
                    "health_score": 92,
                    "cooling_capacity_index": "Invented Low",
                    "green_deficit_hectares": 35.0,
                    "estimated_trees_needed": 14000,
                    "canopy_assessment": "Continuous vegetative cover across urban core.",
                    "priority_action_areas": "Protect mature root systems.",
                    "monitoring_next_steps": "Quarterly multispectral verification.",
                    "recommendations": [
                        {
                            "title": "Some LLM Card",
                            "description": "Maintain buffer around tree root zones.",
                            "severity": "healthy",
                            "suggested_action": "Implement municipal root-zone bylaws."
                        }
                    ],
                    "planting_recommendations": [
                        {
                            "plant_type": "Canopy Shade Trees (Parklands & Open Infill)",
                            "species_examples": ["Pongamia pinnata", "Azadirachta indica"],
                            "why_suited_for_area": "Deep root structure fits urban soils.",
                            "area_benefits": "High microclimate cooling."
                        },
                        {
                            "plant_type": "Urban Street & Avenue Trees",
                            "species_examples": ["Cassia fistula", "Tabebuia rosea"],
                            "why_suited_for_area": "Non-invasive roots avoid sidewalk damage.",
                            "area_benefits": "Transit shading."
                        },
                        {
                            "plant_type": "Native Understory Shrubs",
                            "species_examples": ["Justicia adhatoda", "Ixora coccinea"],
                            "why_suited_for_area": "Thrives in sub-canopy shade.",
                            "area_benefits": "Soil moisture retention."
                        }
                    ],
                    "markdown": "## 1. Ground-Truth Canopy & Microclimate Assessment\\n\\nGroq assessment.\\n\\n## 2. Practical Urban Forestry Management & Infill Strategy\\n\\nGroq management plan.\\n\\n## 3. Recommended Flora & Ecological Benefits\\n\\nGroq flora report."
                }'''
            }
        }
    ]
}

# Coroutine to bypass actual sleep delays in tests
async def mock_sleep(*args, **kwargs):
    return None

class MockResponse:
    def __init__(self, status_code=200, payload=None, text="OK"):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text
    def json(self):
        return self._payload

# 4. Test Transient 503 Retry with Exponential Backoff + Math Locking
os.environ['GEMINI_API_KEY'] = 'AIzaSy_mock_key'
os.environ['GEMINI_MODEL'] = 'gemini-3.8-flash'
os.environ.pop('GEMINI_FALLBACK_MODEL', None)
os.environ.pop('GROQ_API_KEY', None)

attempt_history = []
async def mock_post_retry_503(self, url, *args, **kwargs):
    attempt_history.append(str(url))
    if len(attempt_history) == 1:
        return MockResponse(503, text="Service Unavailable")
    return MockResponse(200, mock_gemini_payload)

with patch('asyncio.sleep', new=mock_sleep), patch('httpx.AsyncClient.post', new=mock_post_retry_503):
    res_retry = asyncio.run(generate_ai_insights(req))
    print('503 Retry Succeeded: Attempts =', len(attempt_history), '| Source:', res_retry.source, '| Model:', res_retry.model_used)
    assert len(attempt_history) == 2, f"Expected 2 attempts for 503 retry, got {len(attempt_history)}"
    assert res_retry.source == 'gemini'
    assert res_retry.model_used == 'gemini-3.8-flash'
    # Check deterministic locking overrides LLM's 99/42.5
    assert res_retry.health_score == 59
    assert res_retry.overall_health_status == "Optimal Canopy Cover"
    assert res_retry.cooling_capacity_index == "High (Effective Natural Cooling)"
    assert res_retry.green_deficit_hectares == 0.0
    assert res_retry.estimated_trees_needed == 0
    assert [r.title for r in res_retry.recommendations] == CANONICAL_TITLES
    assert len(res_retry.planting_recommendations) >= 3, f"Expected >= 3 flora groups, got {len(res_retry.planting_recommendations)}"
    print('Gemini 503 Retry Flora Recommendations OK!')

# 5. Test Primary Exhaustion with Secondary GEMINI_FALLBACK_MODEL
os.environ['GEMINI_FALLBACK_MODEL'] = 'gemini-2.5-flash'
fallback_call_history = []

async def mock_post_secondary_fallback(self, url, *args, **kwargs):
    url_str = str(url)
    fallback_call_history.append(url_str)
    if 'gemini-3.8-flash' in url_str:
        return MockResponse(503, text="Service Unavailable")
    elif 'gemini-2.5-flash' in url_str:
        return MockResponse(200, mock_gemini_payload)
    return MockResponse(500)

with patch('asyncio.sleep', new=mock_sleep), patch('httpx.AsyncClient.post', new=mock_post_secondary_fallback):
    res_secondary = asyncio.run(generate_ai_insights(req))
    print('Secondary Gemini Fallback Succeeded: Calls =', len(fallback_call_history), '| Model:', res_secondary.model_used)
    assert len(fallback_call_history) == 4, f"Expected 4 calls, got {len(fallback_call_history)}"
    assert res_secondary.source == 'gemini'
    assert res_secondary.model_used == 'gemini-2.5-flash'
    assert res_secondary.health_score == 59
    assert [r.title for r in res_secondary.recommendations] == CANONICAL_TITLES

# 6. Test Groq API Fallback When Gemini Fails + Temperature 0 + Math Locking
os.environ['GEMINI_API_KEY'] = 'AIzaSy_mock_key'
os.environ.pop('GEMINI_FALLBACK_MODEL', None)
os.environ['GROQ_API_KEY'] = 'gsk_test_mock_groq_key_123'
os.environ['GROQ_MODEL'] = 'openai/gpt-oss-120b'

groq_calls = []
async def mock_post_with_groq_fallback(self, url, *args, **kwargs):
    url_str = str(url)
    groq_calls.append({'url': url_str, 'kwargs': kwargs})
    if 'generativelanguage.googleapis.com' in url_str:
        return MockResponse(503, text="Gemini Down")
    elif 'api.groq.com' in url_str:
        return MockResponse(200, mock_groq_payload)
    return MockResponse(500)

with patch('asyncio.sleep', new=mock_sleep), patch('httpx.AsyncClient.post', new=mock_post_with_groq_fallback):
    res_groq = asyncio.run(generate_ai_insights(req))
    print('Groq API Fallback Succeeded: Source =', res_groq.source, '| Model =', res_groq.model_used)
    assert res_groq.source == 'groq'
    assert res_groq.model_used == 'openai/gpt-oss-120b'
    # Verify deterministic override of Groq's 92/35.0
    assert res_groq.health_score == 59
    assert res_groq.overall_health_status == "Optimal Canopy Cover"
    assert res_groq.cooling_capacity_index == "High (Effective Natural Cooling)"
    assert res_groq.green_deficit_hectares == 0.0
    assert res_groq.estimated_trees_needed == 0
    assert [r.title for r in res_groq.recommendations] == CANONICAL_TITLES
    assert len(res_groq.planting_recommendations) >= 3, f"Expected >= 3 flora groups from Groq, got {len(res_groq.planting_recommendations)}"
    assert 'Groq assessment' in res_groq.markdown
    
    # Verify Groq request structure & temperature: 0
    groq_call = next(c for c in groq_calls if 'api.groq.com' in c['url'])
    headers = groq_call['kwargs'].get('headers', {})
    assert headers.get('Authorization') == 'Bearer gsk_test_mock_groq_key_123'
    body = groq_call['kwargs'].get('json', {})
    assert body.get('model') == 'openai/gpt-oss-120b'
    assert body.get('response_format') == {'type': 'json_object'}
    assert body.get('temperature') == 0, f"Expected temperature 0 for deterministic Groq inference, got {body.get('temperature')}"
    print('Groq Request Headers, Body, and Temperature=0 Verified OK!')

# 7. Test Groq Standalone (No Gemini Key configured)
os.environ['GEMINI_API_KEY'] = ''
os.environ['GROQ_API_KEY'] = 'gsk_test_mock_groq_key_123'

groq_standalone_calls = []
async def mock_post_groq_standalone(self, url, *args, **kwargs):
    groq_standalone_calls.append(str(url))
    return MockResponse(200, mock_groq_payload)

with patch('asyncio.sleep', new=mock_sleep), patch('httpx.AsyncClient.post', new=mock_post_groq_standalone):
    res_standalone = asyncio.run(generate_ai_insights(req))
    print('Groq Standalone Succeeded: Source =', res_standalone.source, '| Model =', res_standalone.model_used)
    assert res_standalone.source == 'groq'
    assert len(groq_standalone_calls) == 1
    assert 'api.groq.com' in groq_standalone_calls[0]
    assert res_standalone.health_score == 59
    assert [r.title for r in res_standalone.recommendations] == CANONICAL_TITLES

# 8. Test Total Failure Across All Providers (Gemini & Groq fail -> Deterministic Fallback)
os.environ['GEMINI_API_KEY'] = 'AIzaSy_mock_key'
os.environ['GROQ_API_KEY'] = 'gsk_test_mock_groq_key_123'

async def mock_post_all_fail(self, url, *args, **kwargs):
    return MockResponse(503, text="All Down")

with patch('asyncio.sleep', new=mock_sleep), patch('httpx.AsyncClient.post', new=mock_post_all_fail):
    res_all_fail = asyncio.run(generate_ai_insights(req))
    print('Total Provider Failure Clean Fallback: Source =', res_all_fail.source, '| Model =', res_all_fail.model_used)
    assert res_all_fail.source == 'fallback'
    assert 'Deterministic' in res_all_fail.model_used
    assert res_all_fail.health_score == 59
    assert [r.title for r in res_all_fail.recommendations] == CANONICAL_TITLES

# 9. Test Timeout Resilience in Retry Loop
log_records.clear()
async def mock_post_timeout(self, url, *args, **kwargs):
    raise httpx.ReadTimeout("timed out after 30s")

with patch('asyncio.sleep', new=mock_sleep), patch('httpx.AsyncClient.post', new=mock_post_timeout):
    res_timeout = asyncio.run(generate_ai_insights(req))
    assert res_timeout.source == 'fallback'
    timeout_logs = [msg for msg in log_records if "timed out" in msg]
    print('Captured timeout logs in retry loop:', timeout_logs)
    assert len(timeout_logs) >= 1
    assert "ReadTimeout" in timeout_logs[0]

# 10. Test Router Supabase Caching & force_regenerate
print('Testing Router Supabase Caching & force_regenerate...')

saved_insights_record = {
    "id": "analysis-test-uuid-1234",
    "area_name": "Cubbon Park Unit Test",
    "generated_insights": {
        "summary": "Cached Supabase Insights from previous run.",
        "markdown": "## Cached Markdown\\n\\nExisting report.",
        "health_score": 999, # Stored divergent score to test overlay
        "overall_health_status": "Old Status",
        "cooling_capacity_index": "Low",
        "green_deficit_hectares": 99.0,
        "estimated_trees_needed": 99999,
        "source": "gemini",
        "model_used": "gemini-3.8-flash",
        "canopy_assessment": "Mature trees",
        "priority_action_areas": "None",
        "monitoring_next_steps": "Quarterly",
        "recommendations": [
            {
                "title": "Canopy & Spatial Gap Strategy",
                "description": "Cached desc",
                "severity": "healthy",
                "suggested_action": "Cached action"
            }
        ]
    }
}

req_with_cache = InsightsRequest(
    area_name='Cubbon Park Unit Test',
    total_area_hectares=120.0,
    green_cover_percentage=65.0,
    mean_ndvi=0.55,
    analysis_id="analysis-test-uuid-1234",
    force_regenerate=False
)

mock_gen_ai = MagicMock()
with patch('app.features.insights.router.get_analysis_by_id', return_value=saved_insights_record), \
     patch('app.features.insights.router.generate_ai_insights', new=mock_gen_ai):
    res_cached = asyncio.run(generate_insights_endpoint(req_with_cache))
    assert res_cached.summary == "Cached Supabase Insights from previous run."
    # Math must still be strictly locked to ANALYSIS tab formula!
    assert res_cached.health_score == 59
    assert res_cached.overall_health_status == "Optimal Canopy Cover"
    assert res_cached.cooling_capacity_index == "High (Effective Natural Cooling)"
    assert res_cached.green_deficit_hectares == 0.0
    assert res_cached.estimated_trees_needed == 0
    # Backfilled legacy flora check
    assert len(res_cached.planting_recommendations) == 4, f"Expected 4 backfilled flora groups, got {len(res_cached.planting_recommendations)}"
    # LLM generation was skipped!
    mock_gen_ai.assert_not_called()
    print('Router Cache Hit OK: Saved insights returned without calling LLM, math locked, flora backfilled.')

# Test force_regenerate=True bypasses cache and calls update_analysis_insights
req_force = InsightsRequest(
    area_name='Cubbon Park Unit Test',
    total_area_hectares=120.0,
    green_cover_percentage=65.0,
    mean_ndvi=0.55,
    analysis_id="analysis-test-uuid-1234",
    force_regenerate=True
)

mock_update = MagicMock()
fresh_generated_response = InsightsResponse(
    summary="Freshly regenerated insights.",
    markdown="## Fresh Report",
    health_score=59,
    overall_health_status="Optimal Canopy Cover",
    cooling_capacity_index="High (Effective Natural Cooling)",
    green_deficit_hectares=0.0,
    estimated_trees_needed=0,
    source="gemini",
    model_used="gemini-3.8-flash",
    canopy_assessment="Assessed",
    priority_action_areas="Priority",
    monitoring_next_steps="Next",
    recommendations=[
        {
            "title": "Canopy & Spatial Gap Strategy",
            "description": "...",
            "severity": "healthy",
            "suggested_action": "..."
        }
    ],
    planting_recommendations=[
        {
            "plant_type": "Canopy Shade Trees",
            "species_examples": ["Pongamia pinnata"],
            "why_suited_for_area": "Compacted soil tolerance",
            "area_benefits": "High shade canopy"
        }
    ]
)

async def mock_gen_fresh(payload):
    return fresh_generated_response

with patch('app.features.insights.router.get_analysis_by_id', return_value=saved_insights_record) as mock_get, \
     patch('app.features.insights.router.generate_ai_insights', new=mock_gen_fresh), \
     patch('app.features.insights.router.update_analysis_insights', new=mock_update):
    res_fresh = asyncio.run(generate_insights_endpoint(req_force))
    mock_get.assert_not_called()
    assert res_fresh.summary == "Freshly regenerated insights."
    mock_update.assert_called_once()
    assert mock_update.call_args[0][0] == "analysis-test-uuid-1234"
    print('Router force_regenerate=True OK: Bypassed cache, generated fresh, and updated Supabase.')

# 9. Test Health Score Mathematical Clarity & Significance Bands
# Case A: High Green Cover (65%) with Moderate NDVI (0.50) -> 56/100 (Moderate band 45–64)
# Demonstrates why scores in 50-60 range occur despite high green cover:
# NDVI vigor weight (0.50 * 60 = 30 pts) + green cover weight (65 * 0.4 = 26 pts) = 56 pts.
bench_moderate = evaluate_environmental_insights(
    mean_ndvi=0.50,
    green_cover_pct=65.0,
    total_area_hectares=100.0
)
ndvi_pts_a = round(0.50 * 60.0, 1) # 30.0
cover_pts_a = round(65.0 * 0.4, 1) # 26.0
assert bench_moderate.health_score == 56
assert ndvi_pts_a == 30.0
assert cover_pts_a == 26.0
assert 45 <= bench_moderate.health_score < 65, "Expected Moderate canopy band"
print(f"Health Score Clarity Case A (Moderate: 56/100): NDVI={ndvi_pts_a}pts, Cover={cover_pts_a}pts -> Verified OK.")

# Case B: Critical Deficit (Green Cover 18%, Mean NDVI 0.22) -> 20/100 (Critical band < 45)
bench_critical = evaluate_environmental_insights(
    mean_ndvi=0.22,
    green_cover_pct=18.0,
    total_area_hectares=100.0
)
ndvi_pts_b = round(0.22 * 60.0, 1) # 13.2
cover_pts_b = round(18.0 * 0.4, 1) # 7.2
assert bench_critical.health_score == 20
assert bench_critical.health_score < 45, "Expected Critical band"
assert bench_critical.green_deficit_hectares == 12.0 # WHO 30% - 18% = 12% of 100ha
print(f"Health Score Clarity Case B (Critical: 20/100): NDVI={ndvi_pts_b}pts, Cover={cover_pts_b}pts -> Verified OK.")

# Case C: Optimal Canopy (Green Cover 85%, Mean NDVI 0.78) -> 80/100 (Optimal band >= 80)
bench_optimal = evaluate_environmental_insights(
    mean_ndvi=0.78,
    green_cover_pct=85.0,
    total_area_hectares=100.0
)
ndvi_pts_c = round(0.78 * 60.0, 1) # 46.8
cover_pts_c = round(85.0 * 0.4, 1) # 34.0
assert bench_optimal.health_score == 81
assert bench_optimal.health_score >= 80, "Expected Optimal band"
print(f"Health Score Clarity Case C (Optimal: 81/100): NDVI={ndvi_pts_c}pts, Cover={cover_pts_c}pts -> Verified OK.")

# Clean up
os.environ.pop('GEMINI_API_KEY', None)
os.environ.pop('GEMINI_FALLBACK_MODEL', None)
os.environ.pop('GROQ_API_KEY', None)
os.environ.pop('GROQ_MODEL', None)
print('ALL GEMINI & GROQ DETERMINISTIC LOCKING & CACHING INTEGRATION UNIT TESTS PASSED!')
