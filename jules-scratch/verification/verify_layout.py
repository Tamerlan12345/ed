from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        page.goto("http://localhost:3002")

        # Log in
        page.get_by_placeholder("Рабочий Email").fill("test@test.com")
        page.get_by_placeholder("Пароль").fill("password")
        page.get_by_role("button", name="Войти").click()

        # Wait for main menu to load
        expect(page.get_by_role("heading", name="Главное Меню")).to_be_visible(timeout=10000)

        # Click on the first course
        # Using a more robust selector to get the first menu item that is not completed
        first_course = page.locator(".menu-item:not(.completed)").first
        expect(first_course).to_be_visible(timeout=10000)
        first_course.click()

        # Wait for presentation view to load
        expect(page.get_by_role("button", name="Назад в меню")).to_be_visible(timeout=10000)

        # Expect the new sidebar to be visible
        expect(page.locator(".actions-sidebar")).to_be_visible()

        # Expect the presentation wrapper to be visible
        expect(page.locator(".presentation-wrapper")).to_be_visible()

        # Take a screenshot
        page.screenshot(path="jules-scratch/verification/verification.png")

        print("Screenshot taken successfully.")

    except Exception as e:
        print(f"An error occurred: {e}")
        page.screenshot(path="jules-scratch/verification/error.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
