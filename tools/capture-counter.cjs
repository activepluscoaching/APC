/* Synthetic capture of the actual minimal counter. No production records or
 * accounts are used. Start a local app server before running this file. */
const { chromium, expect } = require('@playwright/test');
const { seed } = require('../tests/portal-session.cjs');
const fs=require('fs'),path=require('path');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote']});
 const output=path.join(__dirname,'..','preview','counter-146');fs.mkdirSync(output,{recursive:true});
 try {
  for(const theme of ['light','dark']) {
   const context=await browser.newContext({baseURL:process.env.APC_PREVIEW_URL || 'http://127.0.0.1:8000',viewport:{width:390,height:844},serviceWorkers:'allow',reducedMotion:'reduce',timezoneId:'Asia/Dhaka'});
   await context.addInitScript(theme=>{localStorage.setItem('activePlus.demo.autofill.v1','off');localStorage.setItem('active-plus-appearance-v2',theme);},theme);
   const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-10-01T10:00:00Z'));
   await page.goto('/offline-roles.html');await seed(page,'payment');
   await page.evaluate(()=>{
    localStorage.setItem('activePlus.admin.students.v1',JSON.stringify([{id:'DEMO-0001',name:'পরীক্ষার নমুনা শিক্ষার্থী',uniqueRoll:'261001001',className:'PRIVATE-CLASS',mobile:'01700000000',guardianMobile:'01800000000',monthlyFee:8888}]));
    localStorage.setItem('activePlus.admin.transactions.v1','[]');
   });
   await page.goto('/payment.html');await expect(page.locator('#paymentMain')).toHaveAttribute('data-counter-ready','true');await page.evaluate(()=>document.fonts.ready);await expect(page.locator('.launch-screen')).toHaveCount(0);
   await page.screenshot({path:path.join(output,`today-${theme}.png`)});
   await page.locator('#payStudentSearch').fill('261001001');await page.locator('#paySearchResults .fee-search-result').click();
   await page.screenshot({path:path.join(output,`identity-${theme}.png`)});
   await page.locator('#payProfileCollect').click();await page.locator('#payFeeAmount').fill('800');
   await page.screenshot({path:path.join(output,`payment-${theme}.png`)});
   if(theme==='light') {
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});
    const cdp=await context.newCDPSession(page);await cdp.send('Network.clearBrowserCache');await cdp.detach();await context.setOffline(true);
   }
   await page.locator('#paySaveButton').click();await expect(page.locator('#payReceiptBackdrop')).toBeVisible();
   await page.screenshot({path:path.join(output,`receipt-${theme}.png`)});
   if(theme==='light') {
    const waiting=page.waitForEvent('download');await page.locator('#payReceiptDownload').click();const pdf=await waiting;
    expect(pdf.suggestedFilename()).toBe('R261001001.pdf');await pdf.saveAs(path.join(output,'R261001001.pdf'));
   }
   await context.close();
  }
  console.log('Eight synthetic counter captures and exact-format sample PDF:',output);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
