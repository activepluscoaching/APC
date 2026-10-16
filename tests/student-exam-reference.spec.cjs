const { test, expect } = require('./fixtures.cjs');
const { enterStudentApp } = require('./portal-session.cjs');
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
for (const width of [320, 390, 1024]) {
  test(`exam reference grid preserves routes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await enterStudentApp(page);
    await page.locator('.bottom-nav [data-view="exams"]').click();
    await expect(page.locator('#examsView')).toBeVisible();
    await expect(page.locator('#examTabs .pay-tile')).toHaveCount(9);
    expect(await page.locator('#examTabs').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(3);
    await expect(page.locator('#examHubLiveList')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#examTabs [data-exam-tab="live"]').click();
    await expect(page.locator('#examLiveView')).toBeVisible();
    await page.locator('.bottom-nav [data-view="exams"]').click();
    await page.locator('#examTabs [data-view="exam-bank"]').click();
    await expect(page.locator('[data-view-panel="exam-bank"]')).toBeVisible();
  });
}
