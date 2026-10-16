const { test, expect } = require('./fixtures.cjs');
const { enterStudentApp } = require('./portal-session.cjs');
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
for (const width of [320, 390, 1024]) {
  test(`class hub and attendance stay usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await enterStudentApp(page);
    await page.locator('.bottom-nav [data-view="courses"]').click();
    await page.locator('.study-class-link').click();
    await expect(page.locator('#classesView')).toBeVisible();
    await expect(page.locator('#classHub .pay-tile')).toHaveCount(9);
    expect(await page.locator('#classHub').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(3);
    await expect(page.locator('.bottom-nav [data-view="courses"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#classMonthAttendanceRate')).toHaveText('—');
    await expect(page.locator('#classMonthAttendanceNote')).toContainText('কোনো তথ্য নেই');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#classHub [data-view="class-attendance"]').click();
    await expect(page.locator('#classAttendanceView')).toBeVisible();
    await page.locator('#classAttendanceView .pay-back').click();
    await expect(page.locator('#classesView')).toBeVisible();
    await page.locator('#classHub [data-view="class-today"]').click();
    await expect(page.locator('#classTodayView')).toBeVisible();
  });
}
