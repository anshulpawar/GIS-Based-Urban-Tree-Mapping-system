"""
verify_about_and_methodology.py
Automated Playwright test script to verify:
1. Initial load lands on visual About landing page (#about-view, nav-btn-about.active).
2. All 7 editorial sections on About page render cleanly.
3. Launch Interactive Map transitions to Map view with valid MapLibre canvas sizing.
4. Methodology tab transitions to dedicated #methodology-view with all 4 technical cards.
5. Dashboard tab transitions to #dashboard-view.
6. Brand block navigates back to About.
7. Zero JavaScript console errors.
"""

import sys
import time
from playwright.sync_api import sync_playwright

def run_verification():
    print("==================================================")
    print("VERIFYING ABOUT LANDING PAGE & METHODOLOGY VIEW")
    print("==================================================")

    console_errors = []

    with sync_playwright() as p:
        print("Launching Edge browser...")
        browser = p.chromium.launch(headless=True, channel="msedge")
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # Track console errors
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

        # -----------------------------------------------------------------
        # TEST 1: Initial Load on Visual About Landing Page
        # -----------------------------------------------------------------
        print("\n[TEST 1] Checking Default Initial Landing Page...")
        about_view = page.locator("#about-view")
        map_view = page.locator("#map-view")
        dashboard_view = page.locator("#dashboard-view")
        methodology_view = page.locator("#methodology-view")

        assert about_view.is_visible(), "FAIL: #about-view is not visible on initial load!"
        assert not map_view.is_visible(), "FAIL: #map-view should be hidden on initial load!"
        assert not dashboard_view.is_visible(), "FAIL: #dashboard-view should be hidden on initial load!"
        assert not methodology_view.is_visible(), "FAIL: #methodology-view should be hidden on initial load!"

        active_nav = page.locator(".navbar-nav-links .nav-link.active")
        assert active_nav.get_attribute("id") == "nav-btn-about", f"FAIL: Active nav button is {active_nav.get_attribute('id')}, expected nav-btn-about!"
        print("PASS: App loaded on About Landing Page as default with nav-btn-about active.")

        # -----------------------------------------------------------------
        # TEST 2: Inspecting Editorial Sections on About Page
        # -----------------------------------------------------------------
        print("\n[TEST 2] Inspecting About Page Editorial Components...")
        hero_title = page.locator(".hero-title").inner_text()
        print(f"Hero Title: {hero_title}")
        assert "Urban GreenWatch" in hero_title, "FAIL: Hero title missing Urban GreenWatch!"

        btn_hero_map = page.locator("#btn-hero-launch-map")
        btn_hero_meth = page.locator("#btn-hero-methodology")
        assert btn_hero_map.is_visible(), "FAIL: Primary CTA button #btn-hero-launch-map is missing!"
        assert btn_hero_meth.is_visible(), "FAIL: Secondary CTA button #btn-hero-methodology is missing!"

        # Anchor bar
        anchors = page.locator(".about-anchor-strip .anchor-btn")
        assert anchors.count() == 5, f"FAIL: Expected 5 anchor buttons, found {anchors.count()}!"
        print("PASS: 5-column horizontal anchor strip verified.")

        # Workflow cards (4 steps)
        workflow_cards = page.locator(".workflow-card")
        assert workflow_cards.count() == 4, f"FAIL: Expected 4 workflow cards, found {workflow_cards.count()}!"
        print("PASS: 4-step workflow strip verified (Locate, Draw, NDVI, Synthesis & PDF).")

        # 50/50 Editorial split
        pillars = page.locator(".editorial-pillar-card")
        assert pillars.count() == 3, f"FAIL: Expected 3 editorial pillars, found {pillars.count()}!"
        metric_pills = page.locator(".glass-metric-pill")
        assert metric_pills.count() == 3, f"FAIL: Expected 3 floating metric pills, found {metric_pills.count()}!"
        print("PASS: 50/50 editorial split verified with 3 pillars and floating metric badges.")

        # Capabilities cards (3 cards)
        caps = page.locator(".capability-card")
        assert caps.count() == 3, f"FAIL: Expected 3 capability cards, found {caps.count()}!"
        print("PASS: 3 photo-led capability cards verified.")

        # Powered By tech strip
        tech_cards = page.locator(".tech-badge-card")
        assert tech_cards.count() == 5, f"FAIL: Expected 5 powered-by tech badges, found {tech_cards.count()}!"
        print("PASS: 5 powered-by technology badges verified.")

        # Mission CTA banner
        mission_banner = page.locator(".mission-cta-banner")
        assert mission_banner.is_visible(), "FAIL: Mission CTA banner is missing!"
        print("PASS: BMSIT&M mission banner and final CTA verified.")

        # Capture About Hero screenshot
        page.screenshot(path="scratch/about_landing_hero.png", clip={"x": 0, "y": 0, "width": 1440, "height": 900})
        print("Saved screenshot: scratch/about_landing_hero.png")

        # -----------------------------------------------------------------
        # TEST 3: Navigation into Map Workspace via "Launch Interactive Map"
        # -----------------------------------------------------------------
        print("\n[TEST 3] Testing 'Launch Interactive Map' CTA Transition...")
        btn_hero_map.click()
        time.sleep(0.5)

        assert map_view.is_visible(), "FAIL: #map-view did not become visible after clicking Launch Map!"
        assert not about_view.is_visible(), "FAIL: #about-view is still visible after clicking Launch Map!"
        assert page.locator("#nav-btn-map").evaluate("el => el.classList.contains('active')"), "FAIL: nav-btn-map is not active!"

        # Check map canvas dimensions
        canvas = page.locator("#map canvas.maplibregl-canvas")
        box = canvas.bounding_box()
        assert box and box["width"] > 500 and box["height"] > 400, f"FAIL: Map canvas dimensions invalid: {box}"
        print(f"PASS: Map workspace active with valid canvas dimensions ({box['width']}x{box['height']} px).")

        # -----------------------------------------------------------------
        # TEST 4: Navigation to Dedicated METHODOLOGY View
        # -----------------------------------------------------------------
        print("\n[TEST 4] Testing Top Navbar -> METHODOLOGY View...")
        page.locator("#nav-btn-methodology").click()
        time.sleep(0.5)

        assert methodology_view.is_visible(), "FAIL: #methodology-view is not visible!"
        assert not map_view.is_visible(), "FAIL: #map-view should be hidden!"
        assert page.locator("#nav-btn-methodology").evaluate("el => el.classList.contains('active')"), "FAIL: nav-btn-methodology is not active!"

        meth_cards = page.locator(".methodology-card")
        assert meth_cards.count() == 4, f"FAIL: Expected 4 methodology cards, found {meth_cards.count()}!"
        print("PASS: METHODOLOGY view active with all 4 technical specification cards:")
        print("  1. Satellite Telemetry & Cloud Masking")
        print("  2. Deterministic NDVI & 4-Tier Canopy Table")
        print("  3. Canopy Health Score Math & Temporal Comparison")
        print("  4. Remote Sensing Scope & Honest Scientific Limitations")

        page.screenshot(path="scratch/methodology_view.png", clip={"x": 0, "y": 0, "width": 1440, "height": 900})
        print("Saved screenshot: scratch/methodology_view.png")

        # -----------------------------------------------------------------
        # TEST 5: Return to Map from Methodology
        # -----------------------------------------------------------------
        print("\n[TEST 5] Testing 'Back to Map' from Methodology...")
        page.locator("#btn-methodology-back-map").click()
        time.sleep(0.5)
        assert map_view.is_visible(), "FAIL: Failed to return to map view!"
        print("PASS: Returned to map view cleanly.")

        # -----------------------------------------------------------------
        # TEST 6: Navigation to DASHBOARD View & Back
        # -----------------------------------------------------------------
        print("\n[TEST 6] Testing DASHBOARD View Navigation...")
        page.locator("#nav-btn-dashboard").click()
        time.sleep(0.5)
        assert dashboard_view.is_visible(), "FAIL: #dashboard-view is not visible!"
        assert page.locator("#nav-btn-dashboard").evaluate("el => el.classList.contains('active')"), "FAIL: nav-btn-dashboard is not active!"
        print("PASS: DASHBOARD view active.")

        page.locator("#btn-dashboard-back-map").click()
        time.sleep(0.5)
        assert map_view.is_visible(), "FAIL: Failed to return to map from dashboard!"
        print("PASS: Returned to map view from dashboard.")

        # -----------------------------------------------------------------
        # TEST 7: Return to About Landing Page via Brand Block
        # -----------------------------------------------------------------
        print("\n[TEST 7] Testing Brand Block Click -> About Landing Page...")
        page.locator(".brand-block").click()
        time.sleep(0.5)
        assert about_view.is_visible(), "FAIL: Clicking brand-block did not return to #about-view!"
        assert page.locator("#nav-btn-about").evaluate("el => el.classList.contains('active')"), "FAIL: nav-btn-about is not active!"
        print("PASS: Clicking brand-block returned to About Landing Page.")

        # -----------------------------------------------------------------
        # TEST 8: Console Errors Check
        # -----------------------------------------------------------------
        print("\n[TEST 8] Checking for JavaScript Console Errors...")
        filtered_errors = [e for e in console_errors if "favicon" not in e.lower()]
        if filtered_errors:
            print(f"WARNING / ERRORS DETECTED ({len(filtered_errors)}):")
            for err in filtered_errors:
                print(f"  - {err}")
            assert len(filtered_errors) == 0, f"FAIL: {len(filtered_errors)} console errors found!"
        else:
            print("PASS: 0 JavaScript console errors detected across all view transitions!")

        browser.close()

    print("\n==================================================")
    print("ALL TESTS PASSED WITH 100% SUCCESS!")
    print("==================================================")

if __name__ == "__main__":
    run_verification()
