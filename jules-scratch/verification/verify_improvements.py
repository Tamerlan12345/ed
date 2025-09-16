import time
from playwright.sync_api import sync_playwright, expect

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 375, 'height': 812})
    page = context.new_page()

    try:
        # 1. Login
        page.goto("http://localhost:3002")
        expect(page.get_by_placeholder("Рабочий Email")).to_be_visible(timeout=10000)
        page.get_by_placeholder("Рабочий Email").fill("test1@cic.kz")
        page.get_by_placeholder("Пароль").fill("123456")
        page.get_by_role("button", name="Войти").click()

        # 2. Take a screenshot of the main menu
        # Wait for the main menu to be visible (even if it's empty)
        expect(page.get_by_role("button", name="📥 Назначенные")).to_be_visible(timeout=15000)

        # Give a moment for any final rendering
        time.sleep(1)

        page.screenshot(path="jules-scratch/verification/verification.png")

        print("Verification script completed. Screenshot of the main menu has been taken.")

    except Exception as e:
        print(f"An error occurred during verification: {e}")
        page.screenshot(path="jules-scratch/verification/error.png")
    finally:
        browser.close()

with sync_playwright() as p:
    run_verification(p)
