from playwright.sync_api import sync_playwright

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Verify User Login Page Branding
        print("Verifying User Login Page...")
        page.goto("http://localhost:3002/index.html")
        page.wait_for_selector("#auth-view")

        # Take screenshot of user login
        page.screenshot(path="verification/user_login.png")
        print("User login screenshot saved.")

        # 2. Verify Admin Login Page Branding
        print("Verifying Admin Login Page...")
        page.goto("http://localhost:3002/admin.html")
        page.wait_for_selector("#login-view")

        # Take screenshot of admin login
        page.screenshot(path="verification/admin_login.png")
        print("Admin login screenshot saved.")

        browser.close()

if __name__ == "__main__":
    verify_frontend()
