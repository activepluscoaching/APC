const { test, expect } = require('./fixtures.cjs');
const { enterStudentApp } = require('./portal-session.cjs');
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
for (const width of [320, 390, 1024]) {
  test(`study results summary and return route at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await enterStudentApp(page);
    await page.locator('.bottom-nav [data-view="courses"]').click();
    await page.locator('#studySections [data-study-section="results"]').click();
    await expect(page.locator('#studyResultsView')).toBeVisible();
    await expect(page.locator('#studyResultAverage')).toHaveText('—');
    await expect(page.locator('#studyResultHighest')).toHaveText('—');
    await expect(page.locator('#studyResultExamTotal')).toHaveText('০');
    await expect(page.locator('#studyResultsList')).toContainText('কোনো ফলাফল প্রকাশ');
    await expect(page.locator('.bottom-nav [data-view="courses"]')).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#studyResultsView .pay-back').click();
    await expect(page.locator('#coursesView')).toBeVisible();
  });
}
