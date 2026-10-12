import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {loadPage} from './jsdom-harness.mjs';
import {provisionStaff,seedStaffSession} from './staff-harness.mjs';
import {KEYS} from '../js/database.js';
import {clearStaffSession} from '../js/staff-auth.js';
import {COUNTER_PAYMENT_REPORTS,buildCounterPaymentReport,counterReportCSV} from '../js/counter-report-data.js';
import {counterPhone,maskCounterPhone} from '../js/counter-privacy.js';
import {searchCounterStudents} from '../js/counter-data.js';
import {REPORTS} from '../js/report-catalog.js';
import {dateLabel,monthLabel} from '../js/finance-data.js';
let ctx;
const person={id:'S1',name:'নমুনা শিক্ষার্থী',uniqueRoll:'261001001',className:'দশম শ্রেণি',group:'বিজ্ঞান',mobile:'01712345678',guardianMobile:'01898765432',fatherName:'PRIVATE-FATHER',address:'PRIVATE-ADDRESS',pinHash:'PRIVATE-SECRET',monthlyFee:1000};
const now=new Date(),month=monthLabel(now);
const row=(id,amount,status)=>({id,transactionNo:id,receiptNo:id.replace('T','R'),studentId:person.id,studentName:person.name,feeType:'মাসিক বেতন',month,amount,status,method:'নগদ (Cash)',collectedBy:'পেমেন্ট কাউন্টার',recordedAt:now.getTime(),date:dateLabel(now),note:'PRIVATE-NOTE',mobile:person.mobile,guardianMobile:person.guardianMobile,address:person.address});
before(async()=>{ctx=await loadPage('payment.html',{seed:{[KEYS.students]:JSON.stringify([person,{...person,id:'S2',name:'অনির্ধারিত ফি',monthlyFee:null}]),[KEYS.transactions]:JSON.stringify([row('T26001',400,'approved'),row('T26002',600,'pending'),row('T26003',300,'rejected')])}});await provisionStaff('payment');seedStaffSession(ctx.window,'payment');});
test('all existing Fee/Cash report types are offered; no student/academic/staff report entry',()=>{
 assert.deepEqual(new Set(COUNTER_PAYMENT_REPORTS.map(item=>item.id)),new Set(REPORTS.filter(item=>['fee','cash'].includes(item.category)).map(item=>item.id)));
 assert.equal(COUNTER_PAYMENT_REPORTS.length,20);
});
test('BD/Bengali/E.164 phones mask exactly their central three digits',()=>{
 assert.equal(counterPhone('+880 1712-345678'),'01712345678');
 for(const value of ['01712345678','০১৭১২৩৪৫৬৭৮','+8801712345678'])assert.equal(maskCounterPhone(value),'0171***5678');
 assert.equal(maskCounterPhone('01898765432'),'0189***5432');
 assert.equal(maskCounterPhone('PRIVATE'),'—');assert.equal(maskCounterPhone('123'),'—');
});
test('student/guardian phone lookups return the matching identity with masks, never raw numbers',async()=>{
 for(const query of ['01712345678','০১৭১২৩৪৫৬৭৮','+8801712345678','01898765432']) {
  const matches=await searchCounterStudents(query);assert.equal(matches[0].id,'S1');
  assert.equal(matches[0].mobileMasked,'0171***5678');assert.equal(matches[0].guardianMobileMasked,'0189***5432');
  assert.doesNotMatch(JSON.stringify(matches),/01712345678|01898765432|PRIVATE-/);
 }
 assert.deepEqual(await searchCounterStudents('0171'),[],'phone prefixes do not enumerate contacts');
});
test('every financial report payload and CSV is privacy-safe, including optional contacts',async()=>{
 const before=ctx.window.localStorage.getItem(KEYS.transactions);
 for(const def of COUNTER_PAYMENT_REPORTS) {
  const result=await buildCounterPaymentReport(def.id,{period:'all',studentId:def.mode==='student'?'S1':'',includeMobile:true});
  const text=JSON.stringify(result)+'\n'+counterReportCSV(result);
  assert.doesNotMatch(text,/01712345678|01898765432|PRIVATE-FATHER|PRIVATE-ADDRESS|PRIVATE-SECRET|PRIVATE-NOTE/ ,def.id);
  assert.equal(result.id,def.id);assert.ok(result.tables.length);
  if(result.tables[0].columns.some(column=>column.label.includes('মাস্ক'))&&result.tables[0].rows.length)assert.match(text,/0171\*\*\*5678/);
 }
 assert.equal(ctx.window.localStorage.getItem(KEYS.transactions),before,'reporting is read-only');
});
test('contacts are omitted by default and masked when explicitly requested',async()=>{
 const plain=await buildCounterPaymentReport('fee.transactions',{period:'all'});
 assert.doesNotMatch(JSON.stringify(plain),/মাস্ক|0171|0189/);
 const masked=await buildCounterPaymentReport('fee.transactions',{period:'all',includeMobile:true});
 assert.match(JSON.stringify(masked),/0171\*\*\*5678/);assert.match(JSON.stringify(masked),/0189\*\*\*5432/);
});
test('approved collection, pending/rejected rows and due mathematics stay distinct; missing fees are not guessed',async()=>{
 const txs=await buildCounterPaymentReport('fee.transactions',{period:'all'});
 assert.equal(txs.tables[0].rows.length,3);assert.ok(txs.summary.some(pair=>pair[0]==='অনুমোদিত আদায়'&&pair[1]==='৳৪০০'));
 const due=await buildCounterPaymentReport('fee.due-list',{period:'monthly',month:`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`});
 assert.equal(due.tables[0].rows.length,1);assert.ok(due.tables[0].rows[0].includes('৳৬০০'));
 assert.match(due.notes.join(' '),/নির্ধারিত নেই/);
 for(const [key,label]of[['cash.pending','অনুমোদন বাকি'],['cash.approved','অনুমোদিত'],['cash.rejected','বাতিল']]) {
  const result=await buildCounterPaymentReport(key,{period:'all'});assert.equal(result.tables[0].rows.length,1);assert.ok(result.tables[0].rows[0].includes(label));
 }
});
test('date ranges, student selections and own history cannot be widened accidentally',async()=>{
 const other={...row('OTHER',200,'approved'),counterUsername:'other.apc'};
 ctx.window.localStorage.setItem(KEYS.transactions,JSON.stringify([other,row('OWN',400,'approved')]));
 const own=await buildCounterPaymentReport('cash.own-history',{period:'all'});assert.equal(own.tables[0].rows.length,1);
 await assert.rejects(()=>buildCounterPaymentReport('fee.student-wise'),/নির্বাচন/);
 await assert.rejects(()=>buildCounterPaymentReport('fee.transactions',{period:'custom',from:'2026-10-02',to:'2026-10-01'}),/তারিখ/);
 await assert.rejects(()=>buildCounterPaymentReport('student.profile'),/পেমেন্ট/);
 await assert.rejects(()=>buildCounterPaymentReport('fee.transactions',{period:'daily',date:'2026-02-30'}),/তারিখ/);
});
test('CSV escapes spreadsheet formulas instead of executing user-controlled names',()=>{
 const text=counterReportCSV({title:'নমুনা',period:'সব',summary:[],notes:[],tables:[{title:'টেবিল',columns:[{label:'নাম'}],rows:[['=HYPERLINK("https://evil.example")'],['+1'],['@foo']]}]});
 assert.match(text,/"'=HYPERLINK/);assert.match(text,/"'\+1"/);assert.match(text,/"'@foo"/);
});
test('corrupt sources are not erased and an ended/other-role session cannot build reports',async()=>{
 const before=ctx.window.localStorage.getItem(KEYS.transactions);ctx.window.localStorage.setItem(KEYS.transactions,'broken');
 await assert.rejects(()=>buildCounterPaymentReport('fee.transactions'));assert.equal(ctx.window.localStorage.getItem(KEYS.transactions),'broken');ctx.window.localStorage.setItem(KEYS.transactions,before);
 clearStaffSession('payment');seedStaffSession(ctx.window,'teacher');await assert.rejects(()=>buildCounterPaymentReport('fee.transactions'),{code:'ACCESS_DENIED'});
});
