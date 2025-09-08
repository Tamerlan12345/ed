import re
from playwright.sync_api import sync_playwright, expect

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # 1. Navigate to the admin page and log in
            page.goto("http://localhost:8888/admin.html")
            expect(page.get_by_placeholder("Пароль")).to_be_visible()
            page.get_by_placeholder("Пароль").fill("123456")
            page.get_by_role("button", name="Войти").click()

            # 2. Wait for the main panel and create a new course
            expect(page.get_by_role("button", name="Управление курсами")).to_be_visible(timeout=10000)
            page.get_by_role("button", name="Создать новый курс").click()

            # 3. Fill in the course details
            form_container = page.locator("#course-form-container")
            expect(form_container).to_be_visible()
            form_container.get_by_placeholder("ID курса").fill("test-upload-course")
            form_container.get_by_placeholder("Название курса").fill("Automated Test Course")

            # 4. Upload the file
            file_path = "ПС-29 Правила ДС грузов.pdf"
            page.locator("#file-uploader").set_input_files(file_path)

            # 5. Process the file
            page.get_by_role("button", name="Загрузить и обработать файл").click()

            # 6. Assert that the text was extracted
            source_text_area = page.locator("#source-text")
            expect(source_text_area).not_to_be_empty(timeout=20000)
            expect(source_text_area).to_contain_text("ПРАВИЛА")

            # 7. Take a screenshot
            page.screenshot(path="jules-scratch/verification/verification.png")
            print("Verification script completed successfully.")

        except Exception as e:
            print(f"An error occurred: {e}")
            page.screenshot(path="jules-scratch/verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run_verification()
