const {test,expect}=require('./fixtures.cjs');
const {enterStudentApp}=require('./portal-session.cjs');
test.use({serviceWorkers:'block',reducedMotion:'reduce'});
for(const width of [320,390,1024])test(`daily quote visible ${width}`,async({page})=>{
 await page.setViewportSize({width,height:844});await enterStudentApp(page);
 const card=page.locator('#dailyQuoteCard');

 expect(await card.evaluate(el=>Boolean(el.compareDocumentPosition(document.getElementById('studentServices')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
 await expect(card).toBeVisible();await card.scrollIntoViewIfNeeded();await expect(card).toBeInViewport();
 await page.screenshot({path:`/tmp/daily-quote-${width}.png`});
});
