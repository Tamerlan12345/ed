from playwright.sync_api import sync_playwright, expect
import os

def verify_profile():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Assume we can load index.html directly for layout check
        # Note: Dynamic data loading requires the backend, so this test
        # primarily verifies the static structure and initial state.

        # We need to serve the file or use file:// protocol.
        # Since we are in the repo root, let's use file:// with absolute path.
        cwd = os.getcwd()
        page.goto(f"file://{cwd}/index.html")

        # 1. Check if Profile Button exists (it might be hidden or require auth state manipulation to show)
        # In our code, the Auth View is shown first. We can try to simulate a logged-in state
        # by manually unhiding #app-view and hiding #auth-view via JS,
        # OR just interacting with the hidden elements if possible (less reliable for visual check).

        # Let's manipulate the DOM to show the App View and Profile View for verification
        page.evaluate("document.getElementById('auth-view').classList.add('hidden')")
        page.evaluate("document.getElementById('app-view').classList.remove('hidden')")

        # Now we should see the Main Menu. Let's click the Profile Button.
        # Wait for the button to be visible
        profile_btn = page.locator("#profile-btn")
        expect(profile_btn).to_be_visible()

        # Click the profile button
        profile_btn.click()

        # 2. Verify Profile View is shown
        profile_view = page.locator("#profile-view")
        expect(profile_view).to_be_visible()

        # 3. Verify Profile Header Structure
        expect(page.locator(".profile-header-card")).to_be_visible()
        expect(page.locator("#profile-avatar")).to_be_visible()
        expect(page.locator("#profile-name")).to_be_visible()

        # 4. Verify Stats Grid
        expect(page.locator(".stats-grid")).to_be_visible()
        expect(page.locator(".stat-card").first).to_be_visible()

        # 5. Verify Tabs
        expect(page.locator(".profile-tabs")).to_be_visible()
        expect(page.get_by_role("button", name="История Курсов")).to_be_visible()
        expect(page.get_by_role("button", name="Симуляции")).to_be_visible()

        # Take screenshot
        page.screenshot(path="verification/profile_dashboard.png")

        browser.close()

if __name__ == "__main__":
    verify_profile()
