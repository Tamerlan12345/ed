import time
from playwright.sync_api import sync_playwright, expect

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = context.new_page()

    try:
        # 1. Login
        page.goto("http://localhost:3002")
        expect(page.get_by_placeholder("Рабочий Email")).to_be_visible(timeout=10000)
        page.get_by_placeholder("Рабочий Email").fill("test1@cic.kz")
        page.get_by_placeholder("Пароль").fill("123456")
        page.get_by_role("button", name="Войти").click()

        # 2. Assign a course from the catalog
        catalog_tab = page.get_by_role("button", name="📚 Каталог")
        expect(catalog_tab).to_be_visible(timeout=10000)
        catalog_tab.click()

        start_learning_btn = page.get_by_role("button", name="Начать изучение").first
        expect(start_learning_btn).to_be_visible(timeout=15000)
        page.on("dialog", lambda dialog: dialog.accept())
        start_learning_btn.click()
        time.sleep(2) # Give time for alert and subsequent reload call

        # 3. WORKAROUND: Reload the page to fix app state
        page.reload()

        # 4. Navigate to the presentation
        expect(page.get_by_role("button", name="📥 Назначенные")).to_be_visible(timeout=15000)

        first_course = page.locator(".menu-item:not(:has-text('🔒'))").first
        expect(first_course).to_be_visible(timeout=15000)
        first_course.click()

        study_button = page.get_by_role("button", name="📖 Изучить материал")
        expect(study_button).to_be_visible(timeout=10000)
        study_button.click()

        # 5. Take screenshot of the embedded presentation
        expect(page.locator(".presentation-slider")).to_be_visible(timeout=10000)
        time.sleep(1)
        page.screenshot(path="jules-scratch/verification/final_verification.png")

        print("Verification script completed successfully.")

    except Exception as e:
        print(f"An error occurred during verification: {e}")
        page.screenshot(path="jules-scratch/verification/error.png")
    finally:
        browser.close()

with sync_playwright() as p:
    run_verification(p)
