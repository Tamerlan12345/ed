from playwright.sync_api import Page, expect, sync_playwright
import os

def verify_sim_back_button(page: Page):
    # Load the index.html file
    # Assuming the server is not running or we want to test isolated behavior.
    # However, since we need to mock API calls and auth, it is better to load the file directly
    # and mock the necessary environment in the browser.

    cwd = os.getcwd()
    file_path = f"file://{cwd}/index.html"
    page.goto(file_path)

    # Mock the necessary state to bypass login and load the app view
    page.evaluate("""
        () => {
            // Mock auth token
            window.userData = { email: 'test@example.com', token: 'mock-token' };

            // Show app view, hide auth view
            document.getElementById('auth-view').classList.add('hidden');
            document.getElementById('app-view').classList.remove('hidden');

            // Mock courses
            window.courses = [
                {
                    id: 'group1',
                    group_name: 'Test Group',
                    courses: [
                        { id: 'c1', title: 'Course 1', description: 'Desc 1', progress: {} }
                    ]
                }
            ];

            // Mock currentCourse
            window.currentCourse = window.courses[0].courses[0];

            // Override showMainMenu to not fail on API calls
            window.showMainMenu = () => {
                console.log('showMainMenu called');
                document.getElementById('simulator-view').classList.add('hidden');
                document.getElementById('main-content-wrapper').classList.remove('hidden');
            };

            // Override fetchAuthenticated to avoid network errors
            window.fetchAuthenticated = async (url) => {
                if (url === '/api/getCourses') return window.courses;
                if (url === '/api/getNotifications') return [];
                if (url === '/api/get-leaderboard') return [];
                return {};
            };
        }
    """)

    # 1. Test entering Simulator from Course View (should have "Back to Course")
    # We simulate clicking the simulator button which calls showSimulatorView(currentCourse.id)
    print("Testing Simulator Back Button when entering from Course...")

    # Manually trigger the function with a course ID
    page.evaluate("showSimulatorView('c1')")

    # Check that the simulator view is visible
    expect(page.locator("#simulator-view")).to_be_visible()

    # Check the back button text
    back_btn = page.locator("#back-to-menu-btn")
    expect(back_btn).to_be_visible()
    expect(back_btn).to_have_text("Назад к курсу")

    # Take a screenshot
    page.screenshot(path="verification/sim_back_to_course.png")
    print("Screenshot saved: verification/sim_back_to_course.png")

    # Click back button and verify action (we mocked showPresentationView implicitly via backButtonAction)
    # Since we didn't mock showPresentationView fully in python, let's just check the button text and state.

    # 2. Test entering Simulator from Main Menu (should have "Back to Menu")
    print("Testing Simulator Back Button when entering from Main Menu...")

    # Manually trigger the function WITHOUT a course ID
    page.evaluate("showSimulatorView(null)")

    # Check the back button text
    expect(back_btn).to_have_text("Назад в меню")

    # Take a screenshot
    page.screenshot(path="verification/sim_back_to_menu.png")
    print("Screenshot saved: verification/sim_back_to_menu.png")

    # 3. Test Test View Back Button (Safe Exit)
    print("Testing Test View Back Button safe exit...")

    # Setup test view state
    page.evaluate("""
        () => {
            document.getElementById('test-view').classList.remove('hidden');
            document.getElementById('simulator-view').classList.add('hidden');
            window.currentCourse = null; // Simulate lost course data

            // Mock confirm to always return true
            window.confirm = () => true;
        }
    """)

    # Click the back button in test view
    page.locator("#back-to-presentation-from-test").click()

    # Verify we are redirected to main menu (main content wrapper becomes visible)
    # Our mocked showMainMenu removes hidden from main-content-wrapper
    expect(page.locator("#main-content-wrapper")).to_be_visible()
    print("Successfully navigated to main menu after lost course data.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_sim_back_button(page)
        finally:
            browser.close()
