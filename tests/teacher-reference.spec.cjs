const { test, expect } = require('./fixtures.cjs');
const { enterPortal } = require('./portal-session.cjs');
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
for (const width of [320, 390, 1024]) {
  test(`teacher dashboard reference keeps routes and homework creation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await enterPortal(page, 'teacher');
    await expect(page.locator('#teacherHome')).toBeVisible();
    await expect(page.locator('#teacherHome .teacher-home-tile')).toHaveCount(6);
    expect(await page.locator('.teacher-home-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(3);
    await expect(page.locator('#teacherHomeStudentTotal')).toBeVisible();
    await expect(page.locator('#notificationButton')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.admin-bottom [data-teacher-view="classes"]').click();
    await expect(page.locator('#teacherClasses')).toBeVisible();
    await page.locator('.admin-bottom [data-teacher-view="students"]').click();
    await expect(page.locator('#teacherStudents')).toBeVisible();
    await page.locator('.admin-bottom [data-teacher-view="home"]').click();
    await page.locator('.teacher-home-tile[data-teacher-view="homework"]').click();
    await expect(page.locator('#teacherRecords')).toBeVisible();
  });
}
