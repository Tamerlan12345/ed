from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Admin verification
    page.goto("http://localhost:3002/admin.html")
    page.get_by_placeholder("Пароль").fill("123123")
    page.get_by_role("button", name="Войти").click()
    page.wait_for_selector("#panel-view")
    page.screenshot(path="jules-scratch/verification/admin_dashboard.png")

    # User verification
    page.goto("http://localhost:3002/index.html")
    page.get_by_placeholder("Рабочий Email").fill("test@test.com")
    page.get_by_placeholder("Пароль").fill("123123")
    page.get_by_role("button", name="Войти").click()
    page.wait_for_selector("#app-view")
    page.screenshot(path="jules-scratch/verification/user_dashboard.png")

    context.close()
    browser.close()

with sync_playwright() as playwright:
    run(playwright)