/* Capture the actual compact Today class card, with synthetic student accounts.
 * Local app server on :8000 required. Does not add real classes or touch an account. */
const { chromium, expect } = require('@playwright/test');
const { enterStudentApp } = require('../tests/portal-session.cjs');
const fs = require('fs');
const path = require('path');
(async () => {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath:process.env.CHROMIUM_EXECUTABLE } : {}),
    args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote']
  });
  const output = path.join(__dirname,'..','preview','today-class-145');
  fs.mkdirSync(output,{recursive:true});
  try {
    for (const viewport of [{width:320,height:740},{width:390,height:844},{width:412,height:915}]) for (const theme of ['light','dark']) {
      const context = await browser.newContext({ baseURL:process.env.APC_PREVIEW_URL || 'http://127.0.0.1:8000',
        viewport,serviceWorkers:'block',reducedMotion:'reduce',locale:'bn-BD',timezoneId:'Asia/Dhaka' });
      await context.addInitScript(theme => {
        localStorage.setItem('activePlus.demo.autofill.v1','off');
        localStorage.setItem('active-plus-appearance-v2',theme);
      },theme);
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date('2026-10-01T10:00:00Z'));
      await enterStudentApp(page);
      await expect(page.locator('#appShell')).toBeVisible();
      await expect(page.locator('#dashboardRoutineList')).toHaveAttribute('data-state','empty');
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path:path.join(output,`home-${theme}-${viewport.width}.png`)});
      if (viewport.width === 390) {
        await page.locator('#dashboardChallengeCard').scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(output,`study-${theme}-390.png`)});
      }
      await context.close();
    }
    console.log('Eight real-app synthetic captures saved:',output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode=1; });
