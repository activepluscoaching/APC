/* Latest counter privacy requirement supersedes automatic contact sharing.
   Shared PNG/PDF APIs remain for other roles, but counter never fetches/prints
   a student/guardian number or opens a number-bearing WhatsApp URL. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPage } from './jsdom-harness.mjs';
import { receiptMarkup } from '../js/finance-receipt.js';
import { counterReceiptView } from '../js/counter-data.js';

test('the counter exposes only PDF download, with no automatic contact/chat actions',async()=>{
 const ctx=await loadPage('payment.html');
 for(const selector of ['#payReceiptWhatsApp','#payReceiptWhatsAppLabel','#payReceiptCopy','#payReceiptNew','.receipt-download-hint']) assert.equal(ctx.$(selector),null,selector);
 assert.ok(ctx.$('#payReceiptDownload'));
 const source=readFileSync(new URL('../js/payment.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/wa\.me|whatsappTarget|guardianMobile(?!Masked)|createReceiptPNG|receiptStudent|navigator\.share/);
});
test('a receipt of an imported/private student record prints only approved transaction/identity fields',async()=>{
 await loadPage('payment.html');
 const safe=counterReceiptView({id:'TX',receiptNo:'R261001001',studentId:'AP-1024',studentName:'নমুনা',uniqueRoll:'261001001',className:'PRIVATE-CLASS',mobile:'01700000000',guardianMobile:'01800000000',fatherName:'PRIVATE-GUARDIAN',address:'PRIVATE-ADDRESS',feeType:'মাসিক বেতন',month:'অক্টোবর ২০২৬',method:'নগদ',date:'১ অক্টোবর ২০২৬',amount:800,status:'pending',collectedBy:'পেমেন্ট কাউন্টার'});
 const html=receiptMarkup(safe);
 assert.match(html,/R261001001/);assert.match(html,/AP-1024/);assert.match(html,/ইউনিক রোল/);
 assert.doesNotMatch(html,/PRIVATE|01700000000|01800000000|শ্রেণি/);
 assert.match(html,/অনুমোদন বাকি/);
});
