import time
from playwright.sync_api import sync_playwright, expect

def verify_profile_fix():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Mock the getUserProfileData API to return a user without a full name
        def handle_route(route):
            response_body = {
                "user": {
                    "full_name": None,
                    "department": "Test Dept",
                    "email": "test@example.com"
                },
                "stats": {
                    "courses_assigned": 0,
                    "courses_completed": 0,
                    "average_score": 0,
                    "total_time_minutes": 0
                },
                "courses": [],
                "simulations": []
            }
            route.fulfill(
                status=200,
                content_type="application/json",
                body=str(response_body).replace("'", '"').replace("None", "null")
            )

        # Intercept the API call
        page.route("**/api/getUserProfileData", handle_route)
        page.route("**/api/getNotifications", lambda route: route.fulfill(json=[]))
        page.route("**/api/get-leaderboard", lambda route: route.fulfill(json=[]))
        page.route("**/api/getCourses", lambda route: route.fulfill(json=[]))

        # Go to the page
        page.goto("http://localhost:3002/index.html")

        page.evaluate("""
            // Define userData globally if not exists or overwrite
            window.userData = { email: 'test@example.com', token: 'mock-token' };

            const authView = document.getElementById('auth-view');
            const appView = document.getElementById('app-view');

            if(authView) authView.classList.add('hidden');
            if(appView) appView.classList.remove('hidden');
        """)

        # Wait for profile button
        expect(page.locator("#profile-btn")).to_be_visible(timeout=10000)

        # Click the profile button
        page.click("#profile-btn")

        # Wait for profile view to appear
        expect(page.locator("#profile-view")).to_be_visible(timeout=10000)

        # Wait longer for the mock API to respond and update DOM
        # The previous run showed "Загрузка..." which means it was still loading or API failed silently?
        # But we mocked it.

        # Maybe fetchAuthenticated failed because token check happened before we set it?
        # No, we set it before clicking.

        # Let's wait for the profile name to NOT be "Загрузка..."
        try:
            expect(page.locator("#profile-name")).not_to_have_text("Загрузка...", timeout=10000)
        except Exception as e:
            print("Timeout waiting for profile name to update")

        profile_name = page.locator("#profile-name").text_content()
        print(f"Profile Name: {profile_name}")

        profile_avatar = page.locator("#profile-avatar").text_content()
        print(f"Profile Avatar: {profile_avatar}")

        if profile_name != "test@example.com":
            print("FAILED: Profile name is not the expected fallback.")
        else:
            print("SUCCESS: Profile name handled null full_name correctly.")

        page.screenshot(path="verification/profile_fix_verification.png")

        browser.close()

if __name__ == "__main__":
    verify_profile_fix()
