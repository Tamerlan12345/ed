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

    # Wait for navigation to the panel
    expect(page).to_have_url("http://localhost:3002/admin.html")
    expect(page.get_by_role("heading", name="Панель управления")).to_be_visible()

    # Click on the edit button for the first course
    page.locator('.course-card .actions-cell button').first.click()

    # Wait for the form to load
    expect(page.get_by_role("heading", name="Редактирование:")).to_be_visible()

    # Take a screenshot of the voice selector
    voice_selector = page.locator("#voiceSelector")
    expect(voice_selector).to_be_visible()

    # Take a screenshot of the whole form for context
    page.locator("#course-form-container").screenshot(path="jules-scratch/verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)