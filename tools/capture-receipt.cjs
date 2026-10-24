/* Generate a clearly labelled synthetic sample through the real offline PWA.
 * Run a local HTTP server first. No transaction is saved or production account used.
 * LD_LIBRARY_PATH=/tmp/al2023/lib CHROMIUM_EXECUTABLE=/tmp/chromium node tools/capture-receipt.cjs */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote']
  });
  try {
    const context = await browser.newContext({ baseURL: process.env.APC_BASE_URL || 'http://127.0.0.1:8000', serviceWorkers: 'allow' });
    await context.addInitScript(() => localStorage.setItem('activePlus.demo.autofill.v1', 'off'));
    const page = await context.newPage();
    await page.goto('/index.html');
    await page.waitForFunction(() => document.querySelector('#loginForm')?.dataset.loginReady === 'true');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
      const { STORAGE_KEYS } = await import('/js/config.js');
      localStorage.setItem(STORAGE_KEYS.appConfig, JSON.stringify({
        tagline: 'শিখতে থাকো, এগিয়ে যাও, কলেজ রোড, দিনাজপুর সদর',
        campusAddress: 'কলেজ রোড, দিনাজপুর সদর • কলেজ রোড, দিনাজপুর সদর'
      }));
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.clearBrowserCache');
    await cdp.detach();
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#loginForm')?.dataset.loginReady === 'true');
    const files = await page.evaluate(async () => {
      if (navigator.onLine) throw new Error('Sample must be generated offline');
      const { createReceiptPDF, createReceiptPNG } = await import('/js/finance-receipt.js');
      const tx = {
        id: 'SAMPLE-OFFLINE', receiptNo: 'SAMPLE-OFFLINE', date: '২ অক্টোবর ২০২৬',
        studentName: 'নমুনা শিক্ষার্থী', studentId: 'DEMO-0001', className: 'দশম শ্রেণি',
        feeType: 'মাসিক বেতন', month: 'অক্টোবর ২০২৬', method: 'নগদ', trxRef: 'SAMPLE-REF',
        amount: 800, status: 'approved', collectedBy: 'নমুনা কাউন্টার',
        note: 'পরীক্ষার নমুনা — এটি প্রকৃত লেনদেন নয়'
      };
      const pdf = await createReceiptPDF(tx), png = await createReceiptPNG(tx);
      return { pdf: Array.from(new Uint8Array(await pdf.arrayBuffer())), png: Array.from(new Uint8Array(await png.arrayBuffer())) };
    });
    const output = path.join(__dirname, '..', 'preview', 'receipt-143');
    fs.mkdirSync(output, { recursive: true });
    for (const ext of ['pdf','png']) fs.writeFileSync(path.join(output, `simple-statement-offline.${ext}`), Buffer.from(files[ext]));
    console.log('Synthetic monochrome PDF/PNG generated after a cold offline reload:', output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
