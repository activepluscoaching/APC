const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

test('staged Firestore reader never reads with the production config or default local mode', async ({ page }) => {
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:8000/')
    ? route.continue() : route.abort());
  await page.goto('/index.html?backend=firebase');
  const prod = await page.evaluate(async () => (await import('/sync/cloud-read.js')).stagedCloudReader.ownProfile());
  expect(prod).toEqual({ ok: false, reason: 'dev-emulator-required' });
  await page.goto('/index.html?backend=local');
  const local = await page.evaluate(async () => (await import('/sync/cloud-read.js')).stagedCloudReader.ownProfile());
  expect(local).toEqual({ ok: false, reason: 'local-backend' });
});

test('Firebase opt-in does not accept the legacy login or registration form', async ({ page }) => {
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:8000/')
    ? route.continue() : route.abort());
  await page.goto('/index.html?backend=firebase');
  await expect(page.locator('#loginForm')).toBeVisible();
  expect(await page.evaluate(async () => (await import('/sync/cloud-access.js')).backendMode())).toBe('firebase');
  await page.locator('#loginMobile').fill('admin.apc');
  await page.locator('#loginPin').fill('local-password');
  await page.locator('#loginForm').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect(page.locator('#authMessage')).toContainText('Firebase প্যানেল বন্ধ');
  await page.locator('[data-auth-tab="register"]').first().click();
  await page.locator('#registrationForm').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect(page.locator('#authMessage')).toContainText('Firebase নিবন্ধন বন্ধ');
  expect(await page.evaluate(() => sessionStorage.getItem('apc.backend'))).toBe('firebase');
});
