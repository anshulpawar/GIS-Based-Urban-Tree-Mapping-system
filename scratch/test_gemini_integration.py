import sys
sys.path.insert(0, 'backend')
import os
import asyncio
from unittest.mock import patch

# 1. Test Proxy Import
from app.core.config import Settings, get_settings
s = get_settings()
print('Proxy config import OK:', s.PROJECT_NAME)

from app.features.insights.schemas import InsightsRequest
from app.services.insights_service import generate_ai_insights

# 2. Test Fallback (No Key)
os.environ['GEMINI_API_KEY'] = ''
req = InsightsRequest(
    area_name='Cubbon Park Unit Test',
    total_area_hectares=120.0,
    green_cover_percentage=65.0,
    mean_ndvi=0.55
)

res_fallback = asyncio.run(generate_ai_insights(req))
print('Fallback mode OK:', res_fallback.source, '| Model:', res_fallback.model_used)
assert res_fallback.source == 'fallback'
assert 'Deterministic' in res_fallback.model_used

# 3. Test Invalid Key Fallback (Error handling)
os.environ['GEMINI_API_KEY'] = 'AIzaSy_fake_invalid_test_key_12345'
res_invalid = asyncio.run(generate_ai_insights(req))
print('Invalid Key Graceful Fallback OK:', res_invalid.source)
assert res_invalid.source == 'fallback'

# 4. Test Mocked Gemini API Success
os.environ['GEMINI_API_KEY'] = 'AIzaSy_mock_key'
import httpx

mock_gemini_payload = {
    'candidates': [
        {
            'content': {
                'parts': [
                    {
                        'text': '''{
                            "summary": "Gemini test summary of Cubbon Park with robust canopy cover.",
                            "overall_health_status": "Optimal Canopy Cover",
                            "health_score": 88,
                            "cooling_capacity_index": "High",
                            "green_deficit_hectares": 0.0,
                            "estimated_trees_needed": 0,
                            "canopy_assessment": "High density mature tree canopy across the boundary.",
                            "priority_action_areas": "Maintain mature root zones.",
                            "monitoring_next_steps": "Quarterly Sentinel-2 NDVI monitoring.",
                            "recommendations": [
                                {
                                    "title": "Sustained Ecological Conservation",
                                    "description": "Protective buffer recommended.",
                                    "severity": "healthy",
                                    "suggested_action": "Enact conservation easements."
                                }
                            ],
                            "markdown": "## 1. Current Canopy and Ecological Assessment\\n\\nGemini synthesized assessment.\\n\\n## 2. Strategic Interventions and Urban Management Plan\\n\\nGemini action plan."
                        }'''
                    }
                ]
            }
        }
    ]
}

class MockResponse:
    def __init__(self):
        self.status_code = 200
    def json(self):
        return mock_gemini_payload

async def mock_post(*args, **kwargs):
    return MockResponse()

with patch('httpx.AsyncClient.post', new=mock_post):
    res_gemini = asyncio.run(generate_ai_insights(req))
    print('Mocked Gemini Success OK:', res_gemini.source, '| Model:', res_gemini.model_used)
    assert res_gemini.source == 'gemini'
    assert res_gemini.health_score == 88
    assert 'Gemini synthesized assessment' in res_gemini.markdown

# Clean up
os.environ.pop('GEMINI_API_KEY', None)
print('ALL GEMINI INTEGRATION UNIT TESTS PASSED!')
