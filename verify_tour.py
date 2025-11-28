from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # 1. Load index.html
    # We use localhost:3002 because that's where the dev server runs
    page.goto('http://localhost:3002/index.html')

    # Mock window.showMainMenu to ensure UI updates happen even if API calls fail/are mocked
    page.evaluate("""
        window.showMainMenu = async () => {
             document.getElementById('app-view').classList.remove('hidden');
             document.getElementById('auth-view').classList.add('hidden');
             document.getElementById('extra-tools').classList.remove('hidden');
             document.getElementById('main-menu-tabs').classList.remove('hidden');
        };
    """)

    # 2. Mock login
    page.evaluate("""
        () => {
            const session = {
                user: { email: 'test@example.com', full_name: 'Test User', department: 'IT' },
                access_token: 'fake-token'
            };
            window.onLoginSuccess(session);
        }
    """)

    # 3. Wait for main menu to load
    page.wait_for_selector('#app-view', state='visible')

    # 4. Mock API responses to prevent errors
    page.route('**/api/getCourses', lambda route: route.fulfill(
        status=200,
        content_type='application/json',
        body='[{"id": "group1", "group_name": "Test Group", "courses": [{"id": "c1", "title": "Test Course", "description": "Desc", "progress": {"percentage": 0}}]}]'
    ))
    page.route('**/api/get-leaderboard', lambda route: route.fulfill(
        status=200,
        content_type='application/json',
        body='[]'
    ))
    page.route('**/api/getNotifications', lambda route: route.fulfill(
        status=200,
        content_type='application/json',
        body='[]'
    ))
    page.route('**/api/getUserProfileData', lambda route: route.fulfill(
        status=200,
        content_type='application/json',
        body='{"user": {"email": "test@example.com", "full_name": "Test User", "department": "IT"}, "stats": {"courses_assigned": 5, "courses_completed": 2, "average_score": 85, "total_time_minutes": 120}, "courses": [], "simulations": []}'
    ))

    # Force show extra tools if they are hidden
    page.evaluate("document.getElementById('extra-tools').classList.remove('hidden')")

    # 5. Start Tour
    start_tour_btn = page.locator('#start-tour-btn')
    start_tour_btn.wait_for(state='visible')
    start_tour_btn.click()

    # Wait for the character bubble to appear
    bubble = page.locator('#character-bubble')
    expect(bubble).to_be_visible(timeout=10000)

    # Step 1: Intro (Wait for running animation and text)
    # The text is "Приветствую!..."
    expect(bubble).to_contain_text("Приветствую!")
    page.screenshot(path='verification/step1_intro.png')

    # Click "Далее"
    bubble.get_by_text("Далее ➔").click()

    # Step 2: Notifications
    expect(bubble).to_contain_text("Начнем с важного")
    # Click the bell
    page.locator('#notifications-bell').click()
    page.wait_for_timeout(500) # Wait for step transition

    # Step 3: Profile
    expect(bubble).to_contain_text("Теперь заглянем в твой кабинет")
    # Click profile button
    page.locator('#profile-btn').click()

    # Step 4: Profile Explanation (Wait for profile view and delay)
    page.wait_for_timeout(1000) # Wait for delay in step 4
    expect(bubble).to_contain_text("Это твой Личный кабинет")
    page.screenshot(path='verification/step4_profile.png')

    # Click "Далее"
    bubble.get_by_text("Далее ➔").click()

    # Step 5: Back to Menu
    expect(bubble).to_contain_text("С профилем разобрались")
    # Click back button
    page.locator('#back-to-menu-btn').click()

    # Step 6: Tabs
    page.wait_for_timeout(1000) # Wait for delay in step 6
    expect(bubble).to_contain_text("Мы в главном меню")
    page.screenshot(path='verification/step6_tabs.png')

    # Click "Далее"
    bubble.get_by_text("Далее ➔").click()

    # Step 7: Final
    expect(bubble).to_contain_text("Чтобы начать учиться")
    page.screenshot(path='verification/step7_final.png')

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
