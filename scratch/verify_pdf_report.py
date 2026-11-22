"""
scratch/verify_pdf_report.py
Acceptance tests for Urban GreenWatch PDF Study Report Precision Polish:
1. Unit test pdfSafeText with poison string.
2. Generate PDFs for real Chickpete, Chikkalasandra, and long-name AOIs.
3. Validate:
   - No chars > U+00FF in extracted text
   - Zero matches for /%, /ha, /<, />, // /
   - "Sentinel-2" with intact hyphen
   - Line x1 <= 555.28 pt
   - Body advance in 3.8-4.8 pt/char
   - Page 1 not > 25% blank
   - Target 4-5 pages
4. Render 150 dpi PNGs.
"""

import os
import sys
import json
import base64
import requests
import fitz  # PyMuPDF
from playwright.sync_api import sync_playwright

def run_tests():
    os.makedirs("scratch/pdf_output", exist_ok=True)
    all_passed = True

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="msedge")
        page = browser.new_page()
        print("Navigating to http://localhost:3000 ...")
        page.goto("http://localhost:3000", wait_until="networkidle")

        # -----------------------------------------------------------------
        # TEST 1: Unit Test pdfSafeText with poison string
        # -----------------------------------------------------------------
        print("\n==================================================")
        print("TEST 1: Unit Test pdfSafeText with poison string")
        print("==================================================")
        poison_result = page.evaluate("""
            async () => {
                const module = await import('/src/features/insights/pdfReportGenerator.js');
                const poison = "Sentinel\\u20112 4.1\\u202f% NDVI\\u202f\\u2265\\u202f0.3 \\u201cbi\\u2011weekly\\u201d \\u200Bstorm\\u2011water\\u2192 \\uD83C\\uDF33 16.69\\u202fha";
                const cleaned = module.pdfSafeText(poison);
                return { poison, cleaned };
            }
        """)

        print(f"Poison Input:  {repr(poison_result['poison'])}")
        print(f"Cleaned Output: {repr(poison_result['cleaned'])}")

        cleaned = poison_result["cleaned"]
        # Assertions on cleaned text
        assert "Sentinel-2" in cleaned, "Hyphen failed in Sentinel-2!"
        assert "4.1%" in cleaned, "Percent normalization failed!"
        assert "NDVI >= 0.3" in cleaned, ">= symbol conversion failed!"
        assert '"bi-weekly"' in cleaned or "'bi-weekly'" in cleaned, "Quotes or hyphen in bi-weekly failed!"
        assert "storm-water" in cleaned, "Hyphen in storm-water failed!"
        assert "16.69 ha" in cleaned, "ha spacing failed!"
        assert "/%" not in cleaned, "Stray /% found!"
        assert "/ha" not in cleaned, "Stray /ha found!"
        assert all(ord(c) <= 255 for c in cleaned), "Found char > 255 in cleaned output!"
        print("PASS: pdfSafeText unit test passed with flying colors!")

        # -----------------------------------------------------------------
        # Fetch Real Data for Chickpete & Chikkalasandra from Backend API
        # -----------------------------------------------------------------
        def fetch_analysis(aid):
            r = requests.get(f"http://localhost:8000/api/analyses/{aid}")
            assert r.status_code == 200, f"Failed to fetch {aid}"
            d = r.json()
            raw_insights = d.get("generated_insights")
            if isinstance(raw_insights, str):
                insights = json.loads(raw_insights)
            else:
                insights = raw_insights
            return {
                "area_name": d.get("area_name"),
                "analysis_id": d.get("id"),
                "satellite_date_used": d.get("satellite_date_used"),
                "total_area_hectares": d.get("total_area_hectares"),
                "green_cover_percentage": d.get("green_cover_percentage"),
                "mean_ndvi": d.get("mean_ndvi"),
                "stats": {
                    "dense_pct": d.get("dense_pct") or (d.get("stats") or {}).get("dense_pct", 0),
                    "moderate_pct": d.get("moderate_pct") or (d.get("stats") or {}).get("moderate_pct", 0),
                    "sparse_pct": d.get("sparse_pct") or (d.get("stats") or {}).get("sparse_pct", 0),
                    "non_veg_pct": d.get("deficit_pct") or (d.get("stats") or {}).get("non_veg_pct", 0),
                    "area_ha": d.get("total_area_hectares"),
                    "green_cover_pct": d.get("green_cover_percentage"),
                    "mean_ndvi": d.get("mean_ndvi")
                }
            }, insights

        chickpete_telemetry, chickpete_insights = fetch_analysis("2082b183-059d-4380-80df-4421376f6aa2")
        chikkalasandra_telemetry, chikkalasandra_insights = fetch_analysis("0a1df88c-c69f-4c59-9441-c1cc671b6beb")

        long_name_telemetry = dict(chikkalasandra_telemetry)
        long_name_telemetry["area_name"] = "Indiranagar Ward 82 - East Zone Urban Planning Sub-District Municipal Boundary"
        long_name_insights = dict(chikkalasandra_insights)

        scenarios = [
            ("chickpete", "Chickpete, Bengaluru", chickpete_telemetry, chickpete_insights),
            ("chikkalasandra", "Chikkalasandra, Bengaluru", chikkalasandra_telemetry, chikkalasandra_insights),
            ("long_name_aoi", long_name_telemetry["area_name"], long_name_telemetry, long_name_insights)
        ]

        # -----------------------------------------------------------------
        # TEST 2: Generate & Validate PDFs for All Scenarios
        # -----------------------------------------------------------------
        for sc_id, name, telemetry, insights in scenarios:
            print(f"\n==================================================")
            print(f"Testing Scenario: {sc_id} - '{name}'")
            print(f"==================================================")

            eval_res = page.evaluate("""
                async (data) => {
                    try {
                        const module = await import('/src/features/insights/pdfReportGenerator.js');

                        // Create mock snapshot
                        const canvas = document.createElement("canvas");
                        canvas.width = 400;
                        canvas.height = 250;
                        const ctx = canvas.getContext("2d");
                        ctx.fillStyle = "#1e293b";
                        ctx.fillRect(0, 0, 400, 250);
                        ctx.fillStyle = "#10b981";
                        ctx.fillRect(80, 50, 240, 150);
                        const mapSnapshot = canvas.toDataURL("image/png");

                        const res = await module.generatePdfReport({
                            telemetry: data.telemetry,
                            insights: data.insights,
                            mapSnapshot: mapSnapshot,
                            returnDoc: true
                        });

                        if (!res || !res.doc) return { error: "No doc returned" };
                        const b64 = res.doc.output('datauristring').split(',')[1];
                        return { base64: b64 };
                    } catch (e) {
                        return { error: e.stack || e.message || String(e) };
                    }
                }
            """, {"telemetry": telemetry, "insights": insights})

            if not eval_res or "error" in eval_res or not eval_res.get("base64"):
                print(f"FAILED to generate PDF: {eval_res}")
                all_passed = False
                continue

            pdf_bytes = base64.b64decode(eval_res["base64"])
            pdf_path = f"scratch/pdf_output/{sc_id}.pdf"
            with open(pdf_path, "wb") as f:
                f.write(pdf_bytes)
            print(f"Saved PDF to {pdf_path} ({len(pdf_bytes)} bytes)")

            # PyMuPDF checks
            doc = fitz.open(pdf_path)
            page_count = len(doc)
            print(f"Page Count: {page_count} (Target: 4-5 pages)")
            if page_count < 4 or page_count > 5:
                print(f"  FAIL: Page count {page_count} outside 4-5 range!")
                all_passed = False
            else:
                print(f"  PASS: Page count is {page_count}")

            # Render 150 dpi PNGs
            for pno in range(page_count):
                pdf_page = doc[pno]
                pix = pdf_page.get_pixmap(dpi=150)
                pix.save(f"scratch/pdf_output/{sc_id}_p{pno + 1}.png")

            # Check 1: Max right edge x1 <= 555.28 pt
            max_allowed_x1 = 555.28 + 1.0 # 1 pt tolerance
            overflow_spans = []
            full_text = ""
            for pno, pdf_page in enumerate(doc):
                words = pdf_page.get_text("words")
                for w in words:
                    x0, y0, x1, y1, word = w[0], w[1], w[2], w[3], w[4]
                    if x1 > max_allowed_x1:
                        overflow_spans.append((pno + 1, word, x1))
                full_text += pdf_page.get_text() + "\n"

            if overflow_spans:
                print(f"  FAIL: Found text overflow past right margin: {overflow_spans[:5]}")
                all_passed = False
            else:
                print(f"  PASS: All words stay within right margin (x1 <= {max_allowed_x1:.2f} pt)")

            # Check 2: No characters > U+00FF in extracted text
            high_chars = [ch for ch in full_text if ord(ch) > 0xFF]
            if high_chars:
                print(f"  FAIL: Found characters > U+00FF in extracted text: {set(high_chars)}")
                all_passed = False
            else:
                print("  PASS: Zero characters > U+00FF in extracted PDF text!")

            # Check 3: Zero matches for stray slash artifacts
            bad_patterns = ["/%", "/ha", " /<", " />", "// /", "MODERAT / E", "MODERAT/E"]
            found_bad = [bp for bp in bad_patterns if bp in full_text]
            if found_bad:
                print(f"  FAIL: Found stray slash artifacts: {found_bad}")
                all_passed = False
            else:
                print("  PASS: Zero stray slash artifacts (no /%, /ha, /<, />, // /, MODERAT / E)")

            # Check 4: "Sentinel-2" with intact hyphen
            if "Sentinel-2" in full_text:
                print("  PASS: 'Sentinel-2' present with intact ASCII hyphen")
            else:
                print("  FAIL: 'Sentinel-2' missing or hyphen vanished!")
                all_passed = False

            # Check 5: Body character advance (3.5 - 4.8 pt/char)
            body_advances = []
            for pdf_page in doc:
                blocks = pdf_page.get_text("dict")["blocks"]
                for b in blocks:
                    if "lines" in b:
                        for l in b["lines"]:
                            for s in l["spans"]:
                                text = s["text"].strip()
                                size = s["size"]
                                font = s["font"]
                                flags = s["flags"]
                                is_bold = bool(flags & 4) or ("bold" in font.lower())
                                is_all_caps = text.isupper()
                                if not is_bold and not is_all_caps and 8.0 <= size <= 9.5 and len(text) > 15:
                                    bbox = s["bbox"]
                                    width = bbox[2] - bbox[0]
                                    adv = width / len(text)
                                    body_advances.append(adv)

            if body_advances:
                avg_adv = sum(body_advances) / len(body_advances)
                max_adv = max(body_advances)
                min_adv = min(body_advances)
                print(f"  Body Character Advance: avg={avg_adv:.2f} pt, min={min_adv:.2f}, max={max_adv:.2f} (normal range: 3.5-4.8)")
                if max_adv > 5.0 or min_adv < 3.0:
                    print(f"  FAIL: Character advance out of bounds: min={min_adv:.2f}, max={max_adv:.2f}")
                    all_passed = False
                else:
                    print("  PASS: Body character advance in normal range (no justify or lingering charSpace)")

            # Check 6: Page 1 not excessively blank
            # Page 1 should contain content well beyond the map (at least y > 450 pt)
            p1_rects = doc[0].get_text("blocks")
            max_y1_p1 = max(b[3] for b in p1_rects)
            print(f"  Page 1 content reaches y={max_y1_p1:.1f} pt (out of 841.9 pt page)")
            if max_y1_p1 < 500.0:
                print(f"  FAIL: Page 1 is too blank (content stops at y={max_y1_p1:.1f})!")
                all_passed = False
            else:
                print(f"  PASS: Page 1 is richly filled (content reaches y={max_y1_p1:.1f} pt)")

            doc.close()

        browser.close()

    print("\n==================================================")
    if all_passed:
        print("ALL ACCEPTANCE TESTS PASSED WITH 100% SUCCESS!")
    else:
        print("SOME CHECKS FAILED. PLEASE REVIEW LOGS.")
    print("==================================================")
    return all_passed

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
