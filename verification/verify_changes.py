from playwright.sync_api import sync_playwright, expect

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to main page
        page.goto("http://localhost:3002")

        # Wait for content to load
        page.wait_for_selector("body")

        # Mock auth bypass (based on memory usage)
        page.evaluate("""
            const appView = document.getElementById('app-view');
            const authView = document.getElementById('auth-view');
            if (appView && authView) {
                authView.classList.add('hidden');
                appView.classList.remove('hidden');
            }
            window.userData = { email: 'test@cic.kz', token: 'mock' };
        """)

        # 1. Verify Block 3 (Layout)
        # Check Main Menu CSS Grid
        main_menu = page.locator("#main-menu")
        # Just take a screenshot of main menu to verify grid
        page.screenshot(path="verification/main_menu.png")

        # 2. Verify Block 1 (Pass/Fail Logic in Code)
        # We can inspect the script content to see if PASS_THRESHOLD is defined
        script_content = page.content()
        if "const PASS_THRESHOLD = 70;" in script_content:
            print("PASS_THRESHOLD verified.")
        else:
            print("PASS_THRESHOLD not found!")

        if "let userAnswers = [];" in script_content:
            print("userAnswers variable verified.")
        else:
            print("userAnswers variable not found!")

        # 3. Verify Block 2 (Anti-Cheating)
        # Check for focus-loss-overlay
        overlay = page.locator("#focus-loss-overlay")
        if overlay.count() > 0:
            print("Focus loss overlay found.")
        else:
            print("Focus loss overlay MISSING!")

        # Verify protected-content class exists in CSS (indirectly via element check if applied)
        # We applied it to #test-view
        test_view = page.locator("#test-view")
        if "protected-content" in test_view.get_attribute("class"):
            print("protected-content class applied to test-view.")
        else:
            print("protected-content class NOT applied to test-view.")

        # 4. Verify Block 4 (Click Zones)
        # Navigate to a course presentation (Mocking showPresentationView)
        # We can't easily execute complex logic, but we can verify the code is there
        if "createClickZones" in script_content:
            print("createClickZones function found.")
        else:
            print("createClickZones function MISSING!")

        browser.close()

if __name__ == "__main__":
    verify_changes()
