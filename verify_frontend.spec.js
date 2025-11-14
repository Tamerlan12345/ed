const { test, expect } = require('@playwright/test');

test('Admin panel screenshot bypassing login', async ({ page }) => {
  await page.goto('file:///app/admin.html');

  // Bypass login by directly showing the panel
  await page.evaluate(() => {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('panel-view').classList.remove('hidden');
  });

  // Wait for the courses view to be visible to ensure the app has initialized
  await page.waitForSelector('#courses-view');

  // Now that the panel is visible, we need to trigger the editor rendering
  // The editor is rendered when a course is loaded for editing.
  // Since we don't have a course, we'll just check for the main panel elements.

  // Take a screenshot of the admin panel
  await page.screenshot({ path: 'admin_panel_after_login_bypass.png' });

  // Optional: Check if a key element from the admin panel is visible
  const coursesTab = await page.locator('#courses-tab-btn');
  await expect(coursesTab).toBeVisible();
});
