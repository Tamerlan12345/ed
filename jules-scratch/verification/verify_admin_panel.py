import re
from playwright.sync_api import sync_playwright, expect

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # 1. Navigate to the admin panel
        page.goto("http://localhost:3002/admin.html")

        # 2. Log in
        page.locator("#admin-email").fill("admin@cic.kz")
        page.get_by_placeholder("Пароль").fill("123456")
        page.get_by_role("button", name="Войти").click()

        # 3. Navigate to the Group Management tab
        # Wait for the main panel to be visible
        expect(page.get_by_role("heading", name="Панель управления")).to_be_visible(timeout=10000)
        page.get_by_role("button", name="Управление группами").click()

        # 4. Click the "Create New Group" button
        page.get_by_role("button", name="Создать новую группу").click()

        # 5. Assert that the new form elements are visible
        expect(page.get_by_label("Срок прохождения (в днях)")).to_be_visible()
        expect(page.get_by_label("Видимость: Группа видна пользователям в каталоге")).to_be_visible()
        expect(page.get_by_label("Строгий порядок: Требовать последовательного прохождения курсов")).to_be_visible()

        # Also check that the course lists are now UL elements
        expect(page.locator("ul#all-courses-list")).to_be_visible()
        expect(page.locator("ul#group-courses-list")).to_be_visible()

        # 6. Take a screenshot
        page.screenshot(path="jules-scratch/verification/verification.png")

        print("Verification script completed successfully and screenshot taken.")

    except Exception as e:
        print(f"An error occurred during verification: {e}")
        # Take a screenshot on error for debugging
        page.screenshot(path="jules-scratch/verification/error.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run_verification(playwright)
