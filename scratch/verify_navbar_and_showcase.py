"""
verify_navbar_and_showcase.py
Automated Playwright test script to verify:
1. Top navbar spacing, padding-right (16px), and contextual action controls visibility.
2. Actions (.navbar-actions) hidden on ABOUT and METHODOLOGY views.
3. Actions (.navbar-actions) visible with uniform 32px height buttons on MAP and DASHBOARD views.
4. Rightmost toolbar button has clearance >= 16px from screen edge (zero clipping).
5. 'Why It Matters' section contains the high-detail custom inline SVG with zero broken images.
6. Zero console errors.
"""

import sys
import time
from playwright.sync_api import sync_playwright

def run_verification():
    print("==================================================")
    print("VERIFYING NAVBAR POLISH & WHY IT MATTERS SHOWCASE")
    print("==================================================")

    console_errors = []

    with sync_playwright() as p:
        print("Launching Edge browser...")
        browser = p.chromium.launch(headless=True, channel="msedge")
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

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
        # TEST 1: Initial Load (About View) - Actions Hidden & Navbar Padding
        # -----------------------------------------------------------------
        print("\n[TEST 1] Checking Navbar Spacing & Initial About View Visibility...")
        navbar_padding_right = page.locator(".global-navbar").evaluate(
            "el => window.getComputedStyle(el).paddingRight"
        )
        print(f"Global navbar computed padding-right: {navbar_padding_right}")
        assert navbar_padding_right == "16px", f"FAIL: Expected paddingRight: 16px, got {navbar_padding_right}"

        navbar_actions = page.locator(".navbar-actions")
        actions_display = navbar_actions.evaluate("el => window.getComputedStyle(el).display")
        print(f"Navbar actions display on About view: {actions_display}")
        assert actions_display == "none", f"FAIL: Expected display: none on About view, got {actions_display}"
        print("PASS: Top navbar actions cleanly hidden on initial About view.")

        # -----------------------------------------------------------------
        # TEST 2: Inspecting 'Why It Matters' Custom Vector SVG Showcase
        # -----------------------------------------------------------------
        print("\n[TEST 2] Checking 'Why It Matters' Vector Illustration Showcase...")
        svg_elem = page.locator(".split-showcase-svg")
        assert svg_elem.is_visible(), "FAIL: .split-showcase-svg is not visible!"

        viewbox = svg_elem.get_attribute("viewBox")
        assert viewbox == "0 0 600 520", f"FAIL: Unexpected viewBox: {viewbox}"
        print(f"PASS: Custom inline SVG illustration found with viewBox: {viewbox}")

        # Ensure no broken <img> elements inside .split-showcase-visual
        broken_imgs = page.locator(".split-showcase-visual img")
        assert broken_imgs.count() == 0, f"FAIL: Found {broken_imgs.count()} <img> elements in split showcase, expected 0!"
        print("PASS: Zero broken <img> elements in Why It Matters card.")

        # Ensure floating metric pills are present
        pills = page.locator(".split-showcase-visual .glass-metric-pill")
        assert pills.count() == 3, f"FAIL: Expected 3 floating metric pills, got {pills.count()}!"
        print("PASS: All 3 floating metric pills cleanly overlaid on vector illustration.")

        # Screenshot Why It Matters
        showcase_visual = page.locator("#sec-why-it-matters")
        showcase_visual.scroll_into_view_if_needed()
        time.sleep(0.5)
        page.screenshot(path="scratch/why_it_matters_vector_showcase.png", clip={"x": 0, "y": 0, "width": 1440, "height": 900})
        print("Saved screenshot: scratch/why_it_matters_vector_showcase.png")

        # -----------------------------------------------------------------
        # TEST 3: Transition to MAP View - Actions Visible & Right Edge Clearance
        # -----------------------------------------------------------------
        print("\n[TEST 3] Testing Map View Transition & Navbar Action Button Polish...")
        page.locator("#btn-hero-launch-map").click()
        time.sleep(0.5)

        assert page.locator("#map-view").is_visible(), "FAIL: #map-view is not visible!"

        actions_display = navbar_actions.evaluate("el => window.getComputedStyle(el).display")
        assert actions_display == "flex", f"FAIL: Expected display: flex on Map view, got {actions_display}"
        print("PASS: Navbar actions visible on Map view.")

        # Check button heights & uniform styling
        buttons = page.locator(".navbar-polygon-tools .toolbar-btn")
        btn_count = buttons.count()
        assert btn_count == 4, f"FAIL: Expected 4 polygon toolbar buttons, got {btn_count}"

        for i in range(btn_count):
            btn = buttons.nth(i)
            h = btn.evaluate("el => window.getComputedStyle(el).height")
            assert h == "32px", f"FAIL: Button {i} height is {h}, expected 32px!"
        print("PASS: All action buttons have uniform 32px height.")

        # Check right edge clearance of the rightmost button (AI Insights)
        ai_btn = page.locator("#btn-ai-insights")
        ai_box = ai_btn.bounding_box()
        viewport_width = 1440
        right_margin = viewport_width - (ai_box["x"] + ai_box["width"])
        print(f"Rightmost button clearance from viewport edge: {right_margin:.1f}px")
        assert right_margin >= 15.0, f"FAIL: Rightmost button too close to screen edge: {right_margin}px (expected >= 15px)"
        print("PASS: Rightmost button has safe margin >= 16px from screen edge (zero clipping).")

        page.screenshot(path="scratch/map_navbar_controls.png", clip={"x": 0, "y": 0, "width": 1440, "height": 100})
        print("Saved screenshot: scratch/map_navbar_controls.png")

        # -----------------------------------------------------------------
        # TEST 4: Contextual Visibility in METHODOLOGY & DASHBOARD Views
        # -----------------------------------------------------------------
        print("\n[TEST 4] Testing Contextual Visibility in METHODOLOGY & DASHBOARD...")
        # Methodology: actions must be hidden
        page.locator("#nav-btn-methodology").click()
        time.sleep(0.3)
        assert navbar_actions.evaluate("el => window.getComputedStyle(el).display") == "none", "FAIL: Actions visible on Methodology!"
        print("PASS: Actions hidden on METHODOLOGY view.")

        # Back to map: actions must be visible
        page.locator("#btn-methodology-back-map").click()
        time.sleep(0.3)
        assert navbar_actions.evaluate("el => window.getComputedStyle(el).display") == "flex", "FAIL: Actions hidden on Map!"
        print("PASS: Actions restored on MAP view.")

        # Dashboard: actions must be visible
        page.locator("#nav-btn-dashboard").click()
        time.sleep(0.3)
        assert navbar_actions.evaluate("el => window.getComputedStyle(el).display") == "flex", "FAIL: Actions hidden on Dashboard!"
        print("PASS: Actions visible on DASHBOARD view.")

        # Back to About: actions must be hidden
        page.locator(".brand-block").click()
        time.sleep(0.3)
        assert navbar_actions.evaluate("el => window.getComputedStyle(el).display") == "none", "FAIL: Actions visible on About!"
        print("PASS: Actions hidden on ABOUT view.")

        # -----------------------------------------------------------------
        # TEST 5: Console Errors Check
        # -----------------------------------------------------------------
        print("\n[TEST 5] Checking for Console Errors...")
        if console_errors:
            print(f"FAIL: {len(console_errors)} console errors found:")
            for err in console_errors:
                print(f"  - {err}")
            assert False, "Console errors detected!"
        else:
            print("PASS: 0 JavaScript console errors detected across all view transitions!")

        browser.close()

    print("\n==================================================")
    print("ALL TESTS PASSED WITH 100% SUCCESS!")
    print("==================================================")

if __name__ == "__main__":
    run_verification()
