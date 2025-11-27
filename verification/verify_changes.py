import os
import time
from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        print("Navigating to home page...")
        try:
            page.goto("http://localhost:3002", timeout=60000)
        except Exception as e:
            print(f"Failed to load page: {e}")
            return

        # Bypass Login
        print("Bypassing login...")
        # Wait for auth-view to be present
        expect(page.locator("#auth-view")).to_be_visible()

        page.evaluate("""
            userData.token = 'dummy_token'; // Inject token
            document.getElementById('auth-view').classList.add('hidden');
            document.getElementById('app-view').classList.remove('hidden');

            // We need to mock fetchAuthenticated because showMainMenu calls it
            window.fetchOriginal = window.fetch;
            window.fetch = async (url, options) => {
                if (url.includes('/api/getCourses')) {
                    return {
                        ok: true,
                        json: async () => ([
                             {
                                id: 'g1',
                                group_name: 'Test Group',
                                courses: [{
                                    id: 'c1',
                                    title: 'Test Course',
                                    description: 'Test Desc',
                                    summary: [{html_content: '<p>Test Slide</p>'}],
                                    questions: [],
                                    materials: [],
                                    is_locked: false,
                                    user_status: 'assigned',
                                    progress: { percentage: 0 }
                                }]
                            }
                        ])
                    };
                }
                if (url.includes('/api/get-leaderboard')) return { ok: true, json: async () => [] };
                if (url.includes('/api/getNotifications')) return { ok: true, json: async () => [] };
                // Default mock
                return { ok: true, json: async () => ({}) };
            };

            showMainMenu();
        """)

        # --- Verify Simulator View ---
        print("Verifying Simulator View...")
        # Wait for main menu to load
        expect(page.locator("#launch-simulator-btn")).to_be_visible()

        page.get_by_role("button", name="Диалоговый тренажер").click()
        expect(page.locator("#simulator-view")).to_be_visible()

        # Check Back Button
        back_btn = page.locator("#simulator-back-btn")
        expect(back_btn).to_be_visible()

        # Check it is at the top (before setup)
        is_first = page.evaluate("""
            () => {
                const view = document.getElementById('simulator-view');
                const btn = document.getElementById('simulator-back-btn');
                return view.firstElementChild === btn;
            }
        """)
        if not is_first:
            print("Warning: Simulator back button is not the first element.")
        else:
            print("Simulator back button IS the first element.")

        page.screenshot(path="verification/simulator_view.png")
        print("Simulator View screenshot taken.")

        # Go back
        back_btn.click()
        expect(page.locator("#main-menu")).to_be_visible()

        # --- Verify Presentation View Sidebar ---
        print("Verifying Presentation View Sidebar...")

        # Inject dummy course and navigate
        # Since we mocked getCourses, 'courses' variable in JS should be populated.
        # But let's force it to be safe.
        page.evaluate("""
            courses = [{
                id: 'g1',
                group_name: 'Test Group',
                courses: [{
                    id: 'c1',
                    title: 'Test Course',
                    description: 'Desc',
                    summary: [{html_content: '<p>Slide 1</p>'}],
                    materials: [],
                    questions: []
                }]
            }];

            // Mock getCourseContent as well specifically
             window.fetch = async (url, options) => {
                if (url.includes('/api/getCourseContent')) {
                     return {
                        ok: true,
                        json: async () => ({
                            summary: [{html_content: '<h1>Slide 1</h1>'}],
                            questions: [],
                            materials: []
                        })
                    };
                }
                // Reuse previous logic if possible or just return default
                if (url.includes('/api/update-time-spent')) return { ok: true, json: async () => ({}) };
                return { ok: true, json: async () => ({}) };
            };

            showPresentationView('c1');
        """)

        expect(page.locator("#product-content")).to_be_visible()
        expect(page.locator(".presentation-view-container")).to_be_visible()

        # Check Sidebar Button
        sidebar_back_btn = page.locator("#back-to-course-btn-sidebar")
        expect(sidebar_back_btn).to_be_visible()

        # Check it is at the top of sidebar
        is_sidebar_first = page.evaluate("""
            () => {
                const sidebar = document.querySelector('.presentation-view-left-sidebar');
                const btn = document.getElementById('back-to-course-btn-sidebar');
                return sidebar.firstElementChild === btn;
            }
        """)

        if is_sidebar_first:
            print("Sidebar back button is correctly at the top.")
        else:
            print("FAIL: Sidebar back button is NOT at the top.")

        page.screenshot(path="verification/presentation_view.png")
        print("Presentation View screenshot taken.")

        browser.close()

if __name__ == "__main__":
    run()
