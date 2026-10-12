const {test,expect}=require('./fixtures.cjs');
const {enterPortal,enterStudentApp}=require('./portal-session.cjs');
for(const width of [320,390,768,1280])for(const role of ['login','admin','manager','teacher','payment','student']){
 test(`${role} minimal shell at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:844});
 if(role==='login')await page.goto('/index.html');else if(role==='student')await enterStudentApp(page);else await enterPortal(page,role);
 await expect(page.locator(role==='login'?'#loginForm':role==='student'?'#appShell':role==='payment'?'#payShell':`#${role}Shell`)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.locator('use,symbol,img[src*="icons/glass"],img[src*="icons/admin"]')).toHaveCount(0);
 const nav=page.locator('.admin-bottom:visible button,.bottom-nav:visible button');
 expect(await nav.count()).toBeLessThanOrEqual(5);
 for(let i=0;i<await nav.count();i++) {await nav.nth(i).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 });
}
