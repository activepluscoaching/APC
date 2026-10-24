const {test,expect}=require('./fixtures.cjs');
const {enterStudentApp}=require('./portal-session.cjs');
test.use({serviceWorkers:'block',reducedMotion:'reduce'});
for(const theme of ['light','dark']) for(const width of [320,390,1024]) test(`Settings More theme ${theme} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:844});await enterStudentApp(page);
 await page.locator('.bottom-nav [data-view="profile"]').click();
 await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 const root=page.locator('#profileView');
 await expect(page.locator('#settingsView')).toHaveCount(0);
 await expect(root.locator('[data-view="settings"]')).toHaveCount(0);
 for(const key of ['profile','offline','session','storage']) await expect(root.locator(`[data-settings-row="${key}"]`)).toHaveCount(1);
 const toggle=root.locator('#moreDarkModeToggle');await toggle.check();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await toggle.uncheck();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 const trusted=root.locator('#moreTrustedDeviceToggle');await trusted.check();await trusted.uncheck();
 await root.locator('[data-action="show-offline"]').click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
