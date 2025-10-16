from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Go to the admin page
    page.goto("http://localhost:3002/admin.html")

    # Log in
    page.wait_for_selector("#admin-email")
    page.locator("#admin-email").fill("centr-cool@mail.ru")
    page.locator("#admin-password").fill("Tamerlan25")
    page.get_by_role("button", name="Войти").click()

    # Wait for navigation to the panel and for courses to load
    expect(page.get_by_role("heading", name="Панель управления")).to_be_visible()
    expect(page.locator(".course-card")).to_have_count(10, timeout=10000)

    # Take a screenshot of the courses view
    page.locator("#courses-view").screenshot(path="jules-scratch/verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)