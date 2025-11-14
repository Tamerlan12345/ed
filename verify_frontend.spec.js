const { test, expect } = require('@playwright/test');

test('Admin panel screenshot with TinyMCE toggled', async ({ page }) => {
  await page.goto('file:///app/admin.html');

  // Bypass login by directly showing the panel
  await page.evaluate(() => {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('panel-view').classList.remove('hidden');
  });

  // Wait for the courses view to be visible to ensure the app has initialized
  await page.waitForSelector('#courses-view');

  // Click the create course button to show the form where the editor is
  await page.click('#show-create-form-btn');

  // Click the toggle button to enable TinyMCE
  await page.click('#toggle-editor-btn');

  // Wait for TinyMCE to initialize
  await page.waitForSelector('.tox-tinymce');

  // Take a screenshot of the admin panel with TinyMCE enabled
  await page.screenshot({ path: 'admin_panel_with_tinymce.png' });

  // Optional: Check if a key element from the admin panel is visible
  const coursesTab = await page.locator('#courses-tab-btn');
  await expect(coursesTab).toBeVisible();
});
