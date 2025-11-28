
import os
import time
from playwright.sync_api import sync_playwright

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # 1. Navigate to the page
        try:
            page.goto("http://localhost:3002")
            print("Navigated to http://localhost:3002")
        except Exception as e:
            print(f"Failed to navigate: {e}")
            browser.close()
            return

        # 2. Verify Auth View Character
        try:
            page.wait_for_selector("#auth-view", state="visible", timeout=10000)

            char_widget = page.locator("#auth-view .character-widget")
            if char_widget.is_visible():
                print("Character widget is visible on auth view")

                # Check position (heuristic: near bottom)
                viewport_height = page.viewport_size['height']
                bbox = char_widget.bounding_box()
                if bbox['y'] + bbox['height'] > viewport_height * 0.8:
                    print("Character is positioned near the bottom")
                else:
                    print(f"Character position Y: {bbox['y']}, Viewport H: {viewport_height}. Might not be at bottom.")

            # Simulate Hover
            char_container = page.locator(".character-container")
            char_container.hover()

            bubble = page.locator("#character-bubble")
            bubble.wait_for(state="visible", timeout=3000)

            if bubble.is_visible():
                print("Hover bubble appeared.")

            page.screenshot(path="verification/auth_hover.png")

        except Exception as e:
            print(f"Error during auth verification: {e}")
            page.screenshot(path="verification/error_auth.png")

        # 3. Switch to App View (Mocking Backend)
        try:
            print("Switching to App View (Bypassing Login)...")

            # Mock API responses
            page.route("**/api/getCourses", lambda route: route.fulfill(
                status=200,
                content_type="application/json",
                body='[{"id": "group1", "group_name": "Test Group", "courses": [{"id": "c1", "title": "Test Course", "description": "Desc", "is_locked": false, "user_status": "not_assigned", "progress": {}}]}]'
            ))
            page.route("**/api/get-leaderboard", lambda route: route.fulfill(
                status=200,
                content_type="application/json",
                body='[]'
            ))
            page.route("**/api/getNotifications", lambda route: route.fulfill(
                status=200,
                content_type="application/json",
                body='[]'
            ))

            # Inject JS to bypass auth and load menu
            page.evaluate("""
                async () => {
                    // Override fetchAuthenticated to bypass supabase session check
                    window.fetchAuthenticated = async (url, options = {}) => {
                        const response = await fetch(url, options);
                        return response.json();
                    };

                    // Manually switch views
                    document.getElementById('auth-view').classList.add('hidden');
                    document.getElementById('app-view').classList.remove('hidden');

                    // Manually hide loader just in case
                    document.getElementById('content-loader').classList.add('hidden');
                    document.getElementById('content-area').classList.remove('hidden');

                    // Call showMainMenu to load the content
                    // We call moveCharacterTo('app-view') to test if it stays hidden
                    moveCharacterTo('app-view');

                    showMainMenu();
                }
            """)

            # Wait for content to load
            page.wait_for_selector("#app-view", timeout=5000)
            print("App View is active")

            # 4. Verify Character is HIDDEN in App View by default
            char_widget = page.locator("#character-widget")

            # Give it a moment to potentially appear if logic is wrong
            time.sleep(1)

            if char_widget.is_visible():
                print("ERROR: Character is visible in App View by default (Should be HIDDEN)")
            else:
                print("SUCCESS: Character is hidden in App View by default")

            # 5. Start Tour
            tour_btn = page.locator("#start-tour-btn")
            tour_btn.wait_for(state="visible", timeout=5000)
            print("Starting tour...")
            tour_btn.click()

            # Wait for overlay
            page.wait_for_selector("#onboarding-overlay", state="visible", timeout=3000)
            if page.locator("#onboarding-overlay").is_visible():
                print("Onboarding overlay is visible")

            # Verify Character APPEARS
            char_widget.wait_for(state="visible", timeout=3000)
            if char_widget.is_visible():
                print("SUCCESS: Character appeared when tour started")

            bubble = page.locator("#character-bubble")
            if bubble.is_visible():
                 print(f"Tour bubble text: {bubble.inner_text()}")

            # 6. Verify .highlight-element properties (Z-Index fix)
            # We need to find the highlighted element (should be none in step 1, but let's check)
            # Step 1 is Greeting (info only, no highlight).
            # Let's go to Step 2 (Click Next)

            print("Clicking 'Next' to go to Step 2 (Bell)...")
            # Find 'Next' button in bubble
            page.locator(".bubble-btn", has_text="Далее").click()

            # Wait for Bell to be highlighted
            bell = page.locator("#notifications-bell")
            # Check if it has class .highlight-element
            page.wait_for_function("document.getElementById('notifications-bell').classList.contains('highlight-element')")
            print("Bell is highlighted")

            # Verify Computed Style of highlighted element
            z_index = bell.evaluate("el => getComputedStyle(el).zIndex")
            print(f"Bell z-index: {z_index}")

            if z_index == "10005":
                print("SUCCESS: z-index is correct")
            else:
                print(f"ERROR: z-index is {z_index}, expected 10005")

            pointer_events = bell.evaluate("el => getComputedStyle(el).pointerEvents")
            print(f"Bell pointer-events: {pointer_events}")

            page.screenshot(path="verification/tour_step2.png")
            print("Screenshot saved to verification/tour_step2.png")

        except Exception as e:
             print(f"Error during app verification: {e}")
             page.screenshot(path="verification/error_app.png")

        browser.close()

if __name__ == "__main__":
    verify_frontend()
