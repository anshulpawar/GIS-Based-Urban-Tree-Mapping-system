"""
verify_frontend_config.py
Tests frontend runtime environment configuration:
- Localhost detection (127.0.0.1:8000/api)
- Production URL resolution with trailing slash normalization
- Window override (window.UGW_API_URL)
- Zero double slashes
- Live browser check on http://localhost:3000
"""

import time
from playwright.sync_api import sync_playwright

def test_frontend_config():
    print("==================================================")
    print("VERIFYING FRONTEND CONFIG & RUNTIME RESOLUTION")
    print("==================================================")

    console_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="msedge")
        page = browser.new_page()

        def handle_console(msg):
            if msg.type == "error":
                loc = msg.location.get("url", "")
                if "favicon" not in loc.lower() and "favicon" not in msg.text.lower():
                    console_errors.append(f"{msg.text} (at {loc})")

        page.on("console", handle_console)
        page.on("pageerror", lambda exc: console_errors.append(str(exc)))

        print("Navigating to http://localhost:3000 ...")
        page.goto("http://localhost:3000", wait_until="networkidle")
        time.sleep(1)

        # Test local resolution via dynamic import
        res = page.evaluate("""
            async () => {
                const { API_BASE_URL, getApiEndpoint, resolveApiBaseUrl, IS_LOCAL } = await import('./src/config.js');
                return {
                    API_BASE_URL,
                    healthEndpoint: getApiEndpoint('/health'),
                    analyzeEndpoint: getApiEndpoint('analyze'),
                    compareEndpoint: getApiEndpoint('/analyze/compare'),
                    isLocal: IS_LOCAL
                };
            }
        """)

        print(f"Local API_BASE_URL: {res['API_BASE_URL']}")
        print(f"Health Endpoint: {res['healthEndpoint']}")
        print(f"Analyze Endpoint: {res['analyzeEndpoint']}")
        print(f"Compare Endpoint: {res['compareEndpoint']}")

        assert res["isLocal"] is True, "FAIL: Expected IS_LOCAL to be True on localhost!"
        assert res["API_BASE_URL"] == "http://127.0.0.1:8000/api", f"FAIL: Unexpected API_BASE_URL: {res['API_BASE_URL']}"
        assert res["healthEndpoint"] == "http://127.0.0.1:8000/api/health", f"FAIL: Double slash in health: {res['healthEndpoint']}"
        assert res["analyzeEndpoint"] == "http://127.0.0.1:8000/api/analyze", f"FAIL: Incorrect analyze endpoint: {res['analyzeEndpoint']}"
        assert "//api" not in res["analyzeEndpoint"].replace("http://", ""), f"FAIL: Found double slash: {res['analyzeEndpoint']}"
        print("PASS: Localhost auto-detection and endpoint normalization verified.")

        # Test runtime override (simulating Render deployment on Vercel)
        prod_res = page.evaluate("""
            async () => {
                window.UGW_API_URL = "https://urban-greenwatch-api.onrender.com/";
                const { resolveApiBaseUrl, getApiEndpoint } = await import('./src/config.js');
                const resolved = resolveApiBaseUrl();
                const ep = getApiEndpoint('/analyze');
                // reset
                window.UGW_API_URL = "";
                return { resolved, ep };
            }
        """)

        print(f"\nSimulated Production Render URL: {prod_res['resolved']}")
        print(f"Simulated Production Endpoint: {prod_res['ep']}")

        assert prod_res["resolved"] == "https://urban-greenwatch-api.onrender.com/api", f"FAIL: Expected Render URL with /api, got {prod_res['resolved']}"
        assert prod_res["ep"] == "https://urban-greenwatch-api.onrender.com/api/analyze", f"FAIL: Expected clean endpoint, got {prod_res['ep']}"
        print("PASS: Production Render override and double-slash prevention verified.")

        assert len(console_errors) == 0, f"FAIL: Console errors found: {console_errors}"
        print("PASS: 0 JavaScript console errors detected.")

        browser.close()

    print("\n==================================================")
    print("ALL FRONTEND CONFIG CHECKS PASSED WITH 100% SUCCESS!")
    print("==================================================")

if __name__ == "__main__":
    test_frontend_config()
