/* Real-app synthetic evidence for phone masks, running T IDs and private
   financial reports. No production accounts/ledger/configuration are touched. */
const {chromium,expect}=require('@playwright/test');
const {seed}=require('../tests/portal-session.cjs');
const fs=require('fs'),path=require('path');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote']});
 const out=path.join(__dirname,'..','preview','counter-147');fs.mkdirSync(out,{recursive:true});
 try {
  for(const theme of ['light','dark']) {
   const context=await browser.newContext({baseURL:process.env.APC_PREVIEW_URL||'http://127.0.0.1:8000',viewport:{width:390,height:844},serviceWorkers:'allow',timezoneId:'Asia/Dhaka',reducedMotion:'reduce'});
   await context.addInitScript(theme=>{localStorage.setItem('activePlus.demo.autofill.v1','off');localStorage.setItem('active-plus-appearance-v2',theme);},theme);
   const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-10-01T10:00:00Z'));
   await page.goto('/offline-roles.html');await seed(page,'payment');
   await page.evaluate(()=>{
    localStorage.setItem('activePlus.admin.students.v1',JSON.stringify([{id:'DEMO-0001',name:'পরীক্ষার নমুনা শিক্ষার্থী',uniqueRoll:'261001001',className:'দশম শ্রেণি',group:'বিজ্ঞান',mobile:'01712345678',guardianMobile:'01898765432',monthlyFee:1000,address:'PRIVATE-ADDRESS',fatherName:'PRIVATE-FATHER'}]));
    localStorage.setItem('activePlus.admin.transactions.v1','[]');
   });
   await page.goto('/payment.html');await expect(page.locator('#paymentMain')).toHaveAttribute('data-counter-ready','true');await expect(page.locator('.launch-screen')).toHaveCount(0);await page.evaluate(()=>document.fonts.ready);
   await page.screenshot({path:path.join(out,`today-${theme}.png`)});
   await page.locator('#payStudentSearch').fill('01898765432');await page.locator('#paySearchResults .fee-search-result').click();
   await page.screenshot({path:path.join(out,`phone-${theme}.png`)});
   await page.locator('#payProfileCollect').click();await page.locator('#payFeeAmount').fill('800');await page.locator('#paySaveButton').click();await expect(page.locator('#payReceiptBackdrop')).toBeVisible();
   await expect(page.locator('#payReceiptBody')).toContainText('T26001');await page.screenshot({path:path.join(out,`receipt-${theme}.png`)});
   await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});
   if(theme==='light') {
    await context.setOffline(true);const waiting=page.waitForEvent('download');await page.locator('#payReceiptDownload').click();await (await waiting).saveAs(path.join(out,'R261001001.pdf'));
   }
   await page.locator('#payReceiptClose').click();await page.locator('[data-counter-view="reports"]').click();
   await page.locator('#paymentReports select[name="report"]').selectOption('fee.transactions');await page.locator('#paymentReports input[name="includeMobile"]').check();
   await page.screenshot({path:path.join(out,`reports-${theme}.png`)});
   await page.locator('#paymentReports button[type="submit"]').click();await expect(page.locator('#paymentReports .rc-pdf-preview')).toBeVisible();
   await page.locator('#paymentReports .rc-pdf-preview').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`preview-${theme}.png`)});
   if(theme==='light')for(const format of ['pdf','csv']) {
    const waiting=page.waitForEvent('download');await page.locator(`[data-counter-download="${format}"]`).click();await (await waiting).saveAs(path.join(out,`masked-payment-report.${format}`));
   }
   await context.close();
  }
  console.log('Ten synthetic screenshots, transaction receipt and masked report PDF/CSV:',out);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
