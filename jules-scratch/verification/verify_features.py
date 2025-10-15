import re
from playwright.sync_api import sync_playwright, expect

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    def handle_console(msg):
        print(f"Browser console: {msg.text()}")
    page.on("console", handle_console)

    try:
        # 1. Login
        page.goto("http://localhost:3002")
        page.get_by_placeholder("Рабочий Email").fill("centr-cool@mail.ru")
        page.get_by_placeholder("Пароль").fill("Tamerlan25")
        page.get_by_role("button", name="Войти").click()
        expect(page.get_by_role("heading", name="Главное Меню")).to_be_visible(timeout=10000)
        page.pause() # Pause to inspect

        # 2. Verify Dialogue Simulator Enhancement
        page.get_by_role("button", name="Диалоговый тренажер").click()
        expect(page.get_by_role("heading", name="Настройка тренажера")).to_be_visible()
        page.get_by_role("button", name="Начать диалог").click()
        expect(page.get_by_placeholder("Ваш ответ...")).to_be_visible()
        page.get_by_placeholder("Ваш ответ...").fill("My first response")
        page.get_by_role("button", name="Отправить").click()
        page.get_by_role("button", name="Завершить и получить оценку").click()
        expect(page.get_by_role("heading", name="Оценка диалога")).to_be_visible()

        # Take a screenshot of the dialogue evaluation
        page.screenshot(path="jules-scratch/verification/dialogue_evaluation.png")

        # 3. Verify Test History Feature
        page.get_by_role("button", name="Начать заново").click()
        page.get_by_role("button", name="Назад в меню").click()
        expect(page.get_by_role("heading", name="Главное Меню")).to_be_visible()

        # Find a course and start the test
        page.locator(".menu-item", has_text="Страхование жилья").click()
        page.get_by_role("button", name="Начать тестирование").click()

        # Answer the questions
        for _ in range(3): # Assuming there are 3 questions
            page.locator(".answer").first.click()
            page.get_by_role("button", name="Следующий вопрос").click()

        expect(page.get_by_role("heading", name="Результаты тестирования")).to_be_visible()

        # Take a screenshot of the test results
        page.screenshot(path="jules-scratch/verification/test_results.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run_verification(playwright)