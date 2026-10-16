const { test, expect } = require('./fixtures.cjs');
const { enterStudentApp } = require('./portal-session.cjs');
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
for (const width of [320, 390, 1024]) {
  test(`More identity, routes and synchronized settings at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await enterStudentApp(page);
    await page.locator('.bottom-nav [data-view="profile"]').click();
    await expect(page.locator('#moreStudentName')).toHaveText('রাইসা');
    await expect(page.locator('#moreStudentId')).toHaveText('AP-1024');
    await expect(page.locator('#profileView > nav.more-menu > button')).toHaveCount(4);
    await page.locator('#moreDarkModeToggle').check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#darkModeToggle')).toBeChecked();
    await page.locator('#moreDarkModeToggle').uncheck();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.locator('#moreTrustedDeviceToggle').check();
    await expect(page.locator('#trustedDeviceToggle')).toBeChecked();
    await page.locator('#moreTrustedDeviceToggle').uncheck();
    await expect(page.locator('#trustedDeviceToggle')).not.toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#profileView [data-view="my-profile"]').click();
    await expect(page.locator('#myProfileView')).toBeVisible();
    await page.locator('.bottom-nav [data-view="profile"]').click();
    await page.locator('#profileView [data-view="student-fee"]').click();
    await expect(page.locator('#studentFeeView')).toBeVisible();
    await page.locator('.bottom-nav [data-view="profile"]').click();
    await page.locator('#profileView [data-action="logout"]').click();
    await expect(page.locator('#logoutModal')).toBeVisible();
  });
}
