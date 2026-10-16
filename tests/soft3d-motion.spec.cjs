const {test,expect}=require('./fixtures.cjs');
const {enterStudentApp}=require('./portal-session.cjs');
test.use({serviceWorkers:'block'});
for(const reducedMotion of ['no-preference','reduce'])test(`soft3d motion ${reducedMotion}`,async({page})=>{
 await page.emulateMedia({reducedMotion});await page.setViewportSize({width:390,height:844});await enterStudentApp(page);
 const icons=page.locator('#studentServices svg[data-icon-set="active-plus-soft3d"]');
 await expect(icons).toHaveCount(6);
 await expect(icons.first()).toHaveCSS('animation-name',reducedMotion==='reduce'?'none':'apc-soft3d-idle');
 if(reducedMotion==='no-preference')expect(await icons.nth(1).evaluate(el=>getComputedStyle(el).animationDelay)).not.toBe('0s');
 await page.locator('#studentServices [data-view="exams"]').click();await expect(page.locator('#examsView')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
