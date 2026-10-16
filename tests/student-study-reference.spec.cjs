const { test, expect } = require('./fixtures.cjs');
const { enterStudentApp } = require('./portal-session.cjs');
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
for (const width of [320, 390, 1024]) {
  test(`study reference grid and existing routes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await enterStudentApp(page);
    await page.locator('.bottom-nav [data-view="courses"]').click();
    await expect(page.locator('#coursesView')).toBeVisible();
    await expect(page.locator('#studySections .pay-tile')).toHaveCount(9);
    expect(await page.locator('#studySections').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(3);
    await expect(page.locator('#studyTodayList')).toContainText('কোনো চলমান অধ্যায় নেই');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#studySections [data-study-section="courses"]').click();
    await expect(page.locator('#myCoursesView')).toBeVisible();
    await page.locator('.bottom-nav [data-view="courses"]').click();
    await page.locator('#studySections [data-study-section="practice"]').click();
    await expect(page.locator('[data-view-panel="study-practice"]')).toBeVisible();
  });
}
