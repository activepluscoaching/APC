/* Reproduce the six real-app empty-home images, using disposable synthetic
   student contexts only. Start the app on :8000; node tools/capture-student-home.cjs.
   Optional APC_PREVIEW_URL / CHROMIUM_EXECUTABLE; install Playwright's browser
   locally or supply the sandbox executable. Never seeds a production profile. */
const { chromium, expect } = require('@playwright/test');
const { enterStudentApp } = require('../tests/portal-session.cjs');
const path = require('path');
const fs = require('fs');
const BASE = process.env.APC_PREVIEW_URL || 'http://127.0.0.1:8000';
const OUT = path.resolve(__dirname, '../preview/student-home-141');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
    args: ['--no-sandbox','--disable-dev-shm-usage','--no-zygote']
  });
  for (const viewport of [{width:320,height:740},{width:390,height:844},{width:412,height:915}]) {
    for (const theme of ['light','dark']) {
      const context = await browser.newContext({ baseURL: BASE, viewport, serviceWorkers:'block',
        locale:'bn-BD', timezoneId:'Asia/Dhaka', reducedMotion:'reduce' });
      await context.addInitScript(theme => {
        localStorage.setItem('activePlus.demo.autofill.v1','off');
        localStorage.setItem('active-plus-appearance-v2',theme);
      }, theme);
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date('2026-10-01T10:00:00Z'));
      await enterStudentApp(page);
      await expect(page.locator('#dashboardRoutineList')).toHaveAttribute('data-state','empty');
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(() => page.evaluate(() => {
        const card = document.querySelector('.dashboard-empty-card').getBoundingClientRect();
        const fab = document.querySelector('.bottom-nav>:nth-child(3) .nav-chip').getBoundingClientRect();
        return card.bottom < fab.top - 4;
      })).toBe(true);
      const file = `home-empty-${theme}-${viewport.width}.png`;
      await page.screenshot({ path:path.join(OUT,file) });
      console.log('saved',file);
      await context.close();
    }
  }
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
