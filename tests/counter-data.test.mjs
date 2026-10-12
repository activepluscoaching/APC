import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import { KEYS } from '../js/database.js';
import { clearStaffSession } from '../js/staff-auth.js';
import { searchCounterStudents, listCounterTodayTransactions, saveCounterPayment, counterReceiptView } from '../js/counter-data.js';
import { monthLabel, dateLabel } from '../js/finance-data.js';
let ctx;
const person={id:'AP-1024',name:'রাইসা ইসলাম',nameEn:'Raisa Islam',uniqueRoll:'261001001',className:'দশম শ্রেণি',group:'বিজ্ঞান',mobile:'01700000000',guardianMobile:'01800000000',fatherName:'PRIVATE-GUARDIAN',address:'PRIVATE-ADDRESS',monthlyFee:8888,pinHash:'PRIVATE-SECRET',status:'approved'};
before(async()=>{
 ctx=await loadPage('payment.html',{seed:{'activePlus.demo.autofill.v1':'off',[KEYS.students]:JSON.stringify([person]),[KEYS.transactions]:'[]'}});
 await provisionStaff('payment');seedStaffSession(ctx.window,'payment');
});
test('names, IDs and existing unique rolls return only identity projections',async()=>{
 for(const query of ['রাইসা','RAISA','ap1024','AP-1024','২৬১০০১০০১']) {
  const rows=await searchCounterStudents(query);
  assert.deepEqual(rows,[{id:person.id,name:person.name,uniqueRoll:person.uniqueRoll}]);
 }
 for(const query of ['', ' ', '*', 'PRIVATE-GUARDIAN','PRIVATE-ADDRESS','দশম শ্রেণি','বিজ্ঞান']) assert.deepEqual(await searchCounterStudents(query),[],query);
});
test('student/guardian phone lookup returns only masked contact fields',async()=>{
 for(const query of ['01700000000','০১৭০০০০০০০০','+8801700000000','01800000000']) {const rows=await searchCounterStudents(query);assert.equal(rows[0].id,person.id);assert.equal(rows[0].mobileMasked,'0170***0000');assert.equal(rows[0].guardianMobileMasked,'0180***0000');assert.doesNotMatch(JSON.stringify(rows),/01700000000|01800000000|PRIVATE-/);}
});

test('an empty/general search never dumps the roster and broad matches are capped',async()=>{
 const roster=Array.from({length:30},(_,i)=>({...person,id:`AP-${i}`,uniqueRoll:String(i+100)}));
 ctx.window.localStorage.setItem(KEYS.students,JSON.stringify(roster));
 assert.equal((await searchCounterStudents('রাইসা')).length,10);
 assert.deepEqual(await searchCounterStudents('র'),[]);
 ctx.window.localStorage.setItem(KEYS.students,JSON.stringify([person]));
});
test('today means this local day and this counter, not history, future or another collector',async()=>{
 const now=new Date(), old=new Date(now.getTime()-86400000), future=new Date(now.getTime()+86400000);
 const base={id:'TODAY',studentId:person.id,studentName:person.name,receiptNo:'R-TODAY',amount:800,collectedBy:'পেমেন্ট কাউন্টার',recordedAt:now.getTime(),className:'PRIVATE-CLASS',mobile:person.mobile,guardianMobile:person.guardianMobile,address:person.address,note:'PRIVATE-NOTE'};
 const rows=[base,{...base,id:'OLD',recordedAt:old.getTime()},{...base,id:'FUTURE',recordedAt:future.getTime()},{...base,id:'OTHER',counterUsername:'other-counter'},{...base,id:'ADMIN',collectedBy:'এডমিন'},{...base,id:'LEGACY',recordedAt:undefined,date:dateLabel(now)}];
 ctx.window.localStorage.setItem(KEYS.transactions,JSON.stringify(rows));
 const allowed=await listCounterTodayTransactions();
 assert.deepEqual(new Set(allowed.map(row=>row.id)),new Set(['TODAY','LEGACY']));
 for(const row of allowed) for(const field of ['className','mobile','guardianMobile','address','note','monthlyFee','group']) assert.equal(field in row,false,field);
 // Supplying a past date cannot widen the public counter API.
 assert.deepEqual(await listCounterTodayTransactions(old),allowed);
 assert.equal(ctx.window.localStorage.getItem(KEYS.transactions),JSON.stringify(rows));
 ctx.window.localStorage.setItem(KEYS.transactions,'[]');
});
test('receipt projections strip PII even from historical/imported transactions',()=>{
 const safe=counterReceiptView({...person,studentId:person.id,studentName:person.name,amount:800,receiptNo:'R261001001',reviewNote:'PRIVATE-REASON'});
 assert.equal(safe.studentId,person.id);
 for(const key of ['className','group','mobile','guardianMobile','fatherName','address','monthlyFee','pinHash','reviewNote']) assert.equal(key in safe,false,key);
});
test('a simple save is durable/pending, exact-numbered and returns no full ledger/profile',async()=>{
 const result=await saveCounterPayment({studentId:person.id,amount:'৮০০',feeType:'মাসিক বেতন',month:monthLabel(),method:'নগদ (Cash)',status:'approved',className:'FORGED',mobile:'FORGED'});
 assert.equal(result.transaction.amount,800);assert.equal(result.transaction.status,'pending');
 assert.match(result.transaction.receiptNo,/^R\d{9}$/);
 assert.equal('className' in result.transaction,false);
 assert.equal('mobile' in result.transaction,false);
 const stored=JSON.parse(ctx.window.localStorage.getItem(KEYS.transactions));
 assert.equal(stored[0].className,person.className,'the authoritative financial record keeps its real class for Manager reporting');
 assert.equal(stored[0].status,'pending');
 assert.equal(stored[0].mobile,undefined);assert.equal(stored[0].address,undefined);
 assert.equal(result.today[0].receiptNo,stored[0].receiptNo);
});
test('forged IDs, invalid amounts and unlisted methods cannot create a payment',async()=>{
 const fields={studentId:person.id,amount:800,feeType:'মাসিক বেতন',month:monthLabel(),method:'নগদ (Cash)'};
 const before=ctx.window.localStorage.getItem(KEYS.transactions);
 for(const extra of [{studentId:'NO-STUDENT'},{amount:0},{amount:-1},{amount:'800.5'},{method:'FORGED'},{feeType:'FORGED'}]) await assert.rejects(()=>saveCounterPayment({...fields,...extra}));
 assert.equal(ctx.window.localStorage.getItem(KEYS.transactions),before);
});
test('corrupt roster/ledger stays intact and is not overwritten by a new payment',async()=>{
 const old=ctx.window.localStorage.getItem(KEYS.students);
 ctx.window.localStorage.setItem(KEYS.students,'broken');
 await assert.rejects(()=>searchCounterStudents('রাইসা'));assert.equal(ctx.window.localStorage.getItem(KEYS.students),'broken');
 ctx.window.localStorage.setItem(KEYS.students,old);
 const ledger=ctx.window.localStorage.getItem(KEYS.transactions);
 ctx.window.localStorage.setItem(KEYS.transactions,'broken');
 await assert.rejects(()=>listCounterTodayTransactions());
 await assert.rejects(()=>saveCounterPayment({studentId:person.id,amount:800,feeType:'মাসিক বেতন',month:monthLabel(),method:'নগদ (Cash)'}));
 assert.equal(ctx.window.localStorage.getItem(KEYS.transactions),'broken');ctx.window.localStorage.setItem(KEYS.transactions,ledger);
});
test('expired/missing and other staff-role sessions cannot use the counter API',async()=>{
 clearStaffSession('payment');seedStaffSession(ctx.window,'manager');
 await assert.rejects(()=>searchCounterStudents('রাইসা'),{code:'ACCESS_DENIED'});
 await assert.rejects(()=>listCounterTodayTransactions(),{code:'ACCESS_DENIED'});
 await assert.rejects(()=>saveCounterPayment({studentId:person.id,amount:800}),{code:'ACCESS_DENIED'});
});
