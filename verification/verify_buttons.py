
from playwright.sync_api import Page, expect, sync_playwright
import os

def test_header_buttons(page: Page):
    cwd = os.getcwd()
    file_url = f"file://{cwd}/index.html"
    print(f"Navigating to {file_url}")
    page.goto(file_url)

    # Bypass login by manipulating the DOM
    page.evaluate("""() => {
        document.getElementById('auth-view').classList.add('hidden');
        document.getElementById('app-view').classList.remove('hidden');
    }""")

    # Wait for the buttons to be visible
    profile_btn = page.locator("#profile-btn")
    logout_btn = page.locator("#logout-btn")

    expect(profile_btn).to_be_visible()
    expect(logout_btn).to_be_visible()

    # Check for the new text inside the buttons
    expect(profile_btn).to_contain_text("Профиль")
    expect(logout_btn).to_contain_text("Выйти")

    # Check for icons
    expect(profile_btn.locator("i.fa-user-circle")).to_be_visible()
    expect(logout_btn.locator("i.fa-right-from-bracket")).to_be_visible()

    # Take a screenshot of the header area inside the app-view
    header = page.locator("#app-view .window-header")
    if header.count() > 0:
        header.screenshot(path="verification/header_buttons.png")
        print("Screenshot of header saved to verification/header_buttons.png")
    else:
        page.screenshot(path="verification/full_page.png")
        print("Screenshot of full page saved to verification/full_page.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 720})
        try:
            test_header_buttons(page)
        except Exception as e:
            print(f"Test failed: {e}")
        finally:
            browser.close()
