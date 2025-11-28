
import os
import time
import re
from playwright.sync_api import sync_playwright, expect

def verify_tour_interaction():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            # 1. Login
            page.goto("http://localhost:3002/index.html")
            page.wait_for_selector("#auth-view", state="visible")

            page.fill("#user-email", "test1@cic.kz")
            page.fill("#user-password", "123456")
            page.click("#auth-button")

            page.wait_for_selector("#app-view", state="visible", timeout=10000)
            page.wait_for_selector("#main-menu", state="visible", timeout=10000)

            print("Logged in successfully.")

            # 2. Start tour
            page.click("#start-tour-btn")
            print("Started tour.")

            # 3. Wait for overlay
            page.wait_for_selector("#onboarding-overlay", state="visible", timeout=5000)

            # 4. Step 1 (Info) -> Click Next
            page.wait_for_selector(".character-bubble.visible", timeout=5000)
            page.get_by_role("button", name="Далее ➔").click()
            print("Clicked Next on Step 1.")

            # 5. Step 2 (Bell Interaction)
            time.sleep(1)
            page.wait_for_selector(".character-bubble.visible", timeout=5000)

            bell = page.locator("#notifications-bell")
            expect(bell).to_have_class(re.compile(r"highlight-element"))

            # Correctly target the app-view header
            header = page.locator("#app-view .window-header")
            expect(header).to_have_class(re.compile(r"z-index-fix-header"))
            print("Header has z-index-fix-header class.")

            # Take screenshot of the fixed state
            page.screenshot(path="verification/tour_step_2_fixed.png")

            # 6. Verify Clickability
            # This is the real test. If z-index is wrong, overlay intercepts click.
            # We must ensure the click triggers the notification panel.

            # Force a click (simulate user action)
            bell.click()
            print("Clicked the bell.")

            # Verify that the notification panel opened OR the tour proceeded.
            # The tour logic says: wait for click, then after 300ms nextStep().
            # Next step is Profile button highlight.

            time.sleep(1)

            # Check if tour proceeded to Step 3 (Profile button highlighted)
            profile_btn = page.locator("#profile-btn")
            expect(profile_btn).to_have_class(re.compile(r"highlight-element"))
            print("Tour proceeded to Step 3 (Profile). Interaction successful!")

            # Check if header STILL has the fix class (Profile is also in header)
            expect(header).to_have_class(re.compile(r"z-index-fix-header"))
            print("Header still has z-index fix for Step 3.")

            page.screenshot(path="verification/tour_success.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error_state_retry.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    verify_tour_interaction()
