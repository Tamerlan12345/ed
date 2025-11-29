from playwright.sync_api import sync_playwright
import time
import os

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = context.new_page()

    cwd = os.getcwd()
    index_path = os.path.join(cwd, 'index.html')

    if not os.path.exists(index_path):
        print(f"Error: {index_path} not found")
        return

    print(f"Loading file://{index_path}")
    page.goto(f"file://{index_path}")

    # Mock local storage to enable character
    page.evaluate("localStorage.setItem('characterEnabled', 'true')")

    # --- Verify CSS Changes ---

    # 1. Tabs Styling
    print("Checking Menu Tabs...")
    # Inject logic to show main menu directly (bypass auth for verification)
    page.evaluate("""
        // Mock global functions and objects
        window.fetchAuthenticated = async (url) => {
            console.log("Mock fetch: " + url);
            if (url.includes('getCourses')) {
                return [{
                    id: 'individual',
                    group_name: 'Individual',
                    courses: [{
                        id: 'c1',
                        title: 'Test Course 1',
                        description: 'Desc',
                        is_locked: false,
                        user_status: 'not_assigned'
                    }]
                }];
            }
            if (url.includes('getCourseContent')) {
                 return { summary: [{ html_content: '<p>Slide 1</p>' }], questions: [], materials: [] };
            }
            if (url.includes('get-leaderboard')) return [];
            return [];
        };

        // Hide Auth, Show App
        document.getElementById('auth-view').classList.add('hidden');
        document.getElementById('app-view').classList.remove('hidden');

        // Load courses to populate the UI
        loadCourses();
    """)

    # Wait for the courses to load (and menu items to appear)
    page.wait_for_selector(".menu-item")

    # Verify flex styles
    tabs_style = page.evaluate("""
        window.getComputedStyle(document.getElementById('main-menu-tabs')).display
    """)
    print(f"Tabs display style: {tabs_style}")

    # Verify Tab Button styles (padding, centering)
    btn_style = page.evaluate("""
        window.getComputedStyle(document.querySelector('.tab-btn')).textAlign
    """)
    print(f"Tab button text-align: {btn_style}")

    # 2. Sprite Optimization Check (Tatiana)
    print("Checking Sprite Check...")
    # We will verify this by forcing the sprite class
    page.evaluate("""
        const widget = document.getElementById('character-widget');
        widget.classList.remove('hidden');
        widget.style.display = 'block';
        const sprite = document.getElementById('character-sprite');
        sprite.className = 'character-sprite tatiana pose-idle';
    """)

    # Check computed styles directly
    sprite_width = page.evaluate("window.getComputedStyle(document.querySelector('.character-sprite.tatiana')).width")
    sprite_height = page.evaluate("window.getComputedStyle(document.querySelector('.character-sprite.tatiana')).height")
    bg_size = page.evaluate("window.getComputedStyle(document.querySelector('.character-sprite.tatiana')).backgroundSize")

    print(f"Sprite Width: {sprite_width} (Expected: 200px)")
    print(f"Sprite Height: {sprite_height} (Expected: 312px)")
    print(f"Background Size: {bg_size} (Expected: 832px 1248px)")

    page.screenshot(path="verification/sprite_check.png")

    # 3. Tour Logic & Highlight
    print("Checking Tour...")
    # Start tour
    page.evaluate("startInteractiveTour()")

    # Wait for "Running Start" animation (2000ms in code)
    print("Waiting for tour start animation...")
    page.wait_for_timeout(3000)

    # We are now at Step 0 (Bayan).

    # Skip Step 0 -> 1
    print("Skipping step 0...")
    page.evaluate("nextStep()")
    page.wait_for_timeout(500)

    # Skip Step 1 -> 2
    print("Skipping step 1...")
    page.evaluate("nextStep()")
    page.wait_for_timeout(500)

    # Skip Step 2 -> 3 (Profile)
    print("Skipping step 2 (Moving to Profile Step 3)...")
    page.evaluate("nextStep()")
    page.wait_for_timeout(500)

    try:
        # Check Highlight on Profile (Step 3)
        print("Verifying Profile Highlight...")
        page.wait_for_selector("#profile-btn.highlight-element", timeout=5000)
        page.screenshot(path="verification/tour_step_profile.png")
        print("Profile highlighted verified.")

        # Verify Highlight CSS (White background, Z-index)
        z_index = page.evaluate("window.getComputedStyle(document.querySelector('.highlight-element')).zIndex")
        print(f"Highlight z-index: {z_index}")

        bg_color = page.evaluate("window.getComputedStyle(document.querySelector('.highlight-element')).backgroundColor")
        print(f"Highlight background: {bg_color}")

        # Step 3 -> 4 (Menu Tabs Intro)
        print("Moving to Step 4 (Menu Tabs)...")
        page.evaluate("nextStep()")
        page.wait_for_selector("#main-menu-tabs.highlight-element", timeout=5000)
        page.screenshot(path="verification/tour_step_tabs_container.png")
        print("Tabs container highlighted verified.")

        # Step 4 -> 5 (Assigned Tab)
        print("Moving to Step 5 (Assigned Tab)...")
        page.evaluate("nextStep()")
        page.wait_for_selector("#tab-assigned.highlight-element", timeout=5000)
        print("Assigned tab highlighted verified.")

        # Step 5 -> 6 (Completed)
        print("Skipping Step 6...")
        page.evaluate("nextStep()")

        # Step 6 -> 7 (Catalog)
        print("Skipping Step 7...")
        page.evaluate("nextStep()")

        # Step 7 -> 8 (Click Card / Transition)
        print("Moving to Step 8 (Transition)...")
        page.evaluate("nextStep()")

        # Wait for transition to complete (Presentation Mode)
        # Step 9 logic waits for 'btn-test-start'
        print("Waiting for course view transition...")
        page.wait_for_selector("#btn-test-start", timeout=10000)
        print("Transition verified: #btn-test-start found.")
        page.screenshot(path="verification/tour_step_course_view.png")

    except Exception as e:
        print(f"Tour verification failed: {e}")
        page.screenshot(path="verification/tour_failed.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
