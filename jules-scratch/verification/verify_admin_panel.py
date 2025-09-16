import re
from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # 1. Navigate to the admin page and log in
        page.goto("http://localhost:3002/admin.html")
        page.get_by_placeholder("Пароль").fill("123456")
        page.get_by_role("button", name="Войти").click()

        # Wait for navigation to the panel
        expect(page.get_by_role("heading", name="Панель управления")).to_be_visible()

        # 2. Go to course management
        page.get_by_role("button", name="Управление курсами").click()

        # Wait for the table to load
        expect(page.get_by_role("cell", name="Название", exact=True)).to_be_visible()

        # 3. Find the first course and click "Редактировать"
        first_edit_button = page.locator('button:has-text("Редактировать")').first
        expect(first_edit_button).to_be_visible()

        # Get the course title to verify later
        row = page.locator('tr', has=first_edit_button).first
        original_title = row.locator('td').first.inner_text()

        first_edit_button.click()

        # 4. Verify the WYSIWYG editor is populated
        wysiwyg_editor = page.locator("#wysiwyg-editor")
        expect(wysiwyg_editor).to_be_visible()
        # Check that the editor is not just showing the "empty" message
        expect(wysiwyg_editor).not_to_have_text("Контент пуст или имеет неверный формат.")
        # A more robust check would be to see if it contains a slide
        expect(page.locator(".wysiwyg-slide").first).to_be_visible()


        # 5. Change the title
        title_input = page.locator("#course-title")
        expect(title_input).to_have_value(original_title)
        new_title = f"{original_title} - Edited"
        title_input.fill(new_title)

        # 6. Click "ОПУБЛИКОВАТЬ"
        page.get_by_role("button", name="ОПУБЛИКОВАТЬ").click()

        # 7. Verify the course list updates with the new title
        expect(page.get_by_role("cell", name=new_title)).to_be_visible()

        # 8. Take a screenshot
        page.screenshot(path="jules-scratch/verification/admin_panel_verification.png")

        print("Verification script completed successfully.")

    except Exception as e:
        print(f"An error occurred: {e}")
        page.screenshot(path="jules-scratch/verification/error.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
