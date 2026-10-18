const {test,expect}=require('./fixtures.cjs');
for(const width of [320,390,768])test(`header-free login, registration and recovery at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:740});await page.goto('/index.html');
 await expect(page.locator('.launch-screen')).toHaveCount(0,{timeout:5000});
 await expect(page.locator('#authScreen header,#firebaseDiagnosticButton')).toHaveCount(0);
 await expect(page.locator('.auth-brand img')).toBeVisible();
 await page.locator('[data-auth-tab=register]').first().click();await expect(page.locator('#registerPanel')).toBeVisible();await expect(page.locator('#loginPanel')).toBeHidden();
 await expect(page.locator('[data-registration-step="1"]')).toBeVisible();
 await page.locator('[data-auth-tab=login]').first().click();await page.locator('#forgotPinButton').click();await expect(page.locator('#recoveryModal')).toBeVisible();
 await page.locator('#recoveryMobile').fill('student.name');await page.locator('#recoveryQuestion').selectOption({index:1});await page.locator('#recoveryAnswer').fill('পরীক্ষা');
 await page.locator('#recoveryForm button[type=submit]').click();await expect(page.locator('#authMessage')).toContainText('অ্যাকাউন্ট');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('launch screen only contains brand and tagline and releases with stalled network',async({page})=>{
 await page.route('https://www.gstatic.com/**',r=>r.abort());
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('.launch-screen img')).toHaveAttribute('alt','Active Plus Coaching');
 await expect(page.locator('.launch-screen')).toContainText('শিখতে থাকো, এগিয়ে যাও');
 await expect(page.locator('.launch-screen')).toHaveCount(0,{timeout:5000});
 await page.locator('[data-auth-tab=register]').first().click();await expect(page.locator('#registerPanel')).toBeVisible();
});
test('existing student can reset with security answer then sign in with new password',async({page})=>{
 await page.goto('/index.html');
 await page.evaluate(async()=>{
  const {persistAccount}=await import('/js/storage.js');
  await persistAccount({username:'recovery.student',mobile:'01712345678',registrationMobile:'01712345678',pin:'123456',securityQuestion:'তোমার শৈশবের ডাকনাম কী?',securityAnswer:'রাইসা',status:'active',student:{id:'QA-RECOVERY',name:'রাইসা',className:'দশম শ্রেণি'}});
 });
 await page.reload();await page.locator('#forgotPinButton').click();
 await page.locator('#recoveryMobile').fill('recovery.student');await page.locator('#recoveryQuestion').selectOption({label:'তোমার শৈশবের ডাকনাম কী?'});await page.locator('#recoveryAnswer').fill('রাইসা');await page.locator('#recoveryForm button[type=submit]').click();
 await expect(page.locator('#recoveryPasswordStep')).toBeVisible();await expect(page.locator('#recoveryStudentSummary')).toContainText('রাইসা');
 await page.locator('#recoveryPin').fill('654321');await page.locator('#recoveryPinConfirm').fill('654321');await page.locator('#recoveryPasswordForm button[type=submit]').click();
 await expect(page.locator('#authMessage')).toContainText('নতুন পাসওয়ার্ড সংরক্ষণ');
 await page.locator('#loginPin').fill('654321');await page.locator('#loginForm button[type=submit]').click();await expect(page.locator('#appShell')).toBeVisible();
});
test('mobile auth stays inside viewport without a notification permission banner',async({page})=>{
 await page.setViewportSize({width:360,height:640});
 await page.goto('/index.html');
 await expect(page.locator('#loginForm')).toHaveAttribute('data-login-ready','true');
 await expect(page.locator('#apcNotifyBar')).toHaveCount(0);
 const bounds=await page.locator('#authScreen').boundingBox();
 expect(bounds.y).toBe(0);expect(bounds.height).toBe(640);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('back and cached-page restoration keep an authenticated student in the app',async({page})=>{
 await page.goto('/index.html');
 await page.evaluate(async()=>{
  const storage=await import('/js/storage.js');
  await storage.persistAccount({username:'back.student',mobile:'01712345678',pin:'123456',status:'active',student:{id:'QA-BACK',name:'শিক্ষার্থী'}});
  await storage.persistSession(true);
 });
 await page.reload();
 await expect(page.locator('#appShell')).toBeVisible();
 await page.evaluate(async()=>{const {setView}=await import('/js/shell.js');setView('profile');});
 await page.goBack();
 await expect(page.locator('#appShell')).toBeVisible();
 await expect(page.locator('#authScreen')).toBeHidden();
 /* The panel is its own page now (student.html): a persisted restore lands
    there, and the login screen is not even in the document any more. */
 await page.evaluate(()=>{
  document.querySelector('#appShell').hidden=true;
  window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
 });
 await expect(page.locator('#appShell')).toBeVisible();
 await expect(page.locator('#authScreen')).toHaveCount(0);
});

test('login password offers letters and digits even before role lookup completes',async({page})=>{
 await page.goto('/index.html');
 const pin=page.locator('#loginPin');
 await expect(pin).toHaveAttribute('inputmode','text');
 await page.locator('#loginMobile').fill('student.name');
 await pin.focus();
 await expect(pin).toHaveAttribute('inputmode','text');
 await page.locator('#loginMobile').fill('manager.apc');
 await expect(pin).toHaveAttribute('inputmode','text');
 // Student registration still requires a 4–6 digit PIN by design.
 await expect(page.locator('#regPin')).toHaveAttribute('inputmode','numeric');
});

for (const width of [320, 390]) test(`login password show/hide responds immediately at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  // The entry fail-safe loads before main.js; keep the module slow to verify
  // the visible toggle does not depend on the rest of app startup.
  await page.route('**/js/main.js*', async route => {
    await new Promise(resolve => setTimeout(resolve, 1800));
    await route.continue();
  });
  await page.goto('/index.html', { waitUntil: 'commit' });
  const input = page.locator('#loginPin');
  const toggle = page.locator('[data-toggle-pin="loginPin"]');
  await expect(input).toBeVisible({ timeout: 5000 });
  await expect(input).toHaveAttribute('type', 'password');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await page.locator('#loginForm').getAttribute('data-login-ready')).toBeNull();

  await input.fill('Abc12345');
  await toggle.click();
  await expect(input).toHaveAttribute('type', 'text');
  await expect(input).toHaveValue('Abc12345');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAttribute('aria-label', 'পাসওয়ার্ড লুকান');
  await expect(toggle).toHaveClass(/is-visible/);
  const slash = await toggle.evaluate(button => {
    const style = getComputedStyle(button, '::after');
    return { width: style.width, background: style.backgroundColor };
  });
  expect(slash.width).toBe('22px');
  expect(slash.background).not.toBe('rgba(0, 0, 0, 0)');
  await toggle.click();
  await expect(input).toHaveAttribute('type', 'password');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveAttribute('aria-label', 'পাসওয়ার্ড দেখুন');

  // It still toggles exactly once after the regular login module initializes.
  await expect(page.locator('#loginForm')).toHaveAttribute('data-login-ready', 'true', { timeout: 15000 });
  await toggle.click();
  await expect(input).toHaveAttribute('type', 'text');
  await expect(input).toHaveValue('Abc12345');
});
