from playwright.sync_api import sync_playwright
import os

def verify_branding():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Verify User Login Page
        page.goto('http://localhost:3002/index.html')
        page.wait_for_selector('#auth-view')
        page.screenshot(path='verification/user_login.png')
        print('User login screenshot taken')

        # Verify Admin Login Page
        page.goto('http://localhost:3002/admin.html')
        page.wait_for_selector('#login-view')
        page.screenshot(path='verification/admin_login.png')
        print('Admin login screenshot taken')

        browser.close()

if __name__ == '__main__':
    verify_branding()
