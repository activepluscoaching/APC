/* Teacher panel on the real teacher.html (jsdom): the redesigned clean home
   (welcome hero + 3-column launcher grid + আজকের ক্লাস, no work feed), bulk
   marking, grouping and paging. The Playwright spec covers CRUD end to end;
   this file covers the management layer added on top of it. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { teachingRepository, todayISO } from '../js/teaching-data.js';
import { adminStudents } from '../js/admin-data.js';
import { ROSTER_KEY } from '../js/office-data.js';
import { enabledClasses } from '../js/config.js';
import { TEACHER_ASSIGNMENTS_KEY } from '../js/teacher-assignments.js';
import { STAFF_ACCOUNTS, updateStaffProfile } from '../js/staff-auth.js';
import { openStaffPanel } from './staff-harness.mjs';

/* Bangla literals from different files can carry precomposed or decomposed
   nukta forms (ড়/য়) — compare in one normalization, like the architecture
   suite does. */
const nfc = value => String(value).normalize('NFC');

const shift = days => {
  const d = new Date(`${todayISO()}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
};
const settle = () => new Promise(resolve => setTimeout(resolve, 40));

let ctx;
const $ = sel => ctx.$(sel);
const $$ = sel => ctx.$$(sel);
const cards = sel => $$(`${sel} .teaching-card`);
/* Find an activity card inside a records tab (the home work feed was removed
   on 2026-10-21; every activity now lives on its own records screen). */
const recordCard = title => $$('#teacherRecordList .teaching-card').find(c => c.querySelector('h3')?.textContent === title);

before(async () => {
  ctx = await loadPage('teacher.html', {
    seed: { 'activePlus.demo.autofill.v1': 'off', [ROSTER_KEY]: JSON.stringify(adminStudents), [TEACHER_ASSIGNMENTS_KEY]: JSON.stringify(enabledClasses.map((className, index) => ({ id: `TAS-${index}`, teacherUsername: 'teacher.apc', teacherName: 'Test Teacher', className, group: '', subject: 'Test' }))) }
  });
  await openStaffPanel(ctx, 'teacher', {
    importPanel: () => import('../js/teacher.js'),
    shellId: 'teacherShell',
    /* The shell unhides before reload() has read the roster and assignments, so
       wait for the class pickers reload() rewrites — that is the first frame
       that carries real data, and every assertion below reads from it. */
    ready: () => [...$('#teacherClassFilter').options].some(option => option.textContent === 'সব নির্ধারিত শ্রেণি')
  });
  assert.equal($('#teacherShell').hidden, false, 'the panel must open');
});

test('an empty home reports honestly: no classes today, and stays clean', () => {
  assert.match($('#teacherTodayClasses').textContent, /আজ কোনো নির্ধারিত ক্লাস নেই/);
  assert.equal($('#teacherRecent'), null, 'the home carries no recent-work feed');
  assert.equal($('#teacherTodayClassCount').textContent, '০টি ক্লাস');
  assert.equal($('#navDot-academic').hidden, true, 'nothing pending anywhere yet');
});

test('the welcome hero shows the teacher name from the staff profile, never the topbar', async () => {
  /* A provisioned test account starts without a display name — the hero still
     greets politely; once the profile carries a name, the hero title and avatar
     initial update after the next data event. The role/id sub-card no longer
     lives on the hero (it stays on "আমার প্রোফাইল"), and the name must never
     appear a second time in the shared topbar. */
  assert.equal($('#teacherHomeTitle').textContent, 'স্বাগতম', 'no name on the account yet — a plain welcome');
  assert.equal($('.app-topbar .teacher-header-name'), null, 'the topbar has no name slot even before a name exists');
  const updated = await updateStaffProfile('teacher', { fullName: 'পরীক্ষা শিক্ষক' });
  assert.equal(updated.ok, true);
  ctx.window.dispatchEvent(new ctx.window.CustomEvent('teaching-data-updated'));
  await ctx.waitFor(() => $('#teacherHomeTitle').textContent === 'স্বাগতম, পরীক্ষা শিক্ষক');
  assert.equal($('#teacherHomeTitle').textContent, 'স্বাগতম, পরীক্ষা শিক্ষক');
  assert.equal($('#teacherHomeInitial').textContent, 'প', 'the hero avatar uses the name initial');
  assert.equal($('#teacherIdentityBadge'), null, 'the role/id sub-card was removed from the hero by owner request');
  assert.equal($('.app-topbar .teacher-header-name'), null, 'the name stays out of the topbar');
  // The decorative daily-work prompt card had no action and was removed from Home by owner request.
  assert.equal($('.teacher-hero-prompt'), null, 'the daily-work prompt card no longer appears on Home');
  assert.equal($('.teacher-welcome-note'), null, 'the daily-work note text is gone with its card');
});

test('home is welcome + one 3-column grid over existing screens + today, with no work feed', () => {
  const tiles = $$('#teacherHome .teacher-home-tile');
  // ২০২৬-১০-২০: উপস্থিতি/রুটিন টাইল হোম থেকে সরে ক্লাস হাব সাবমেনুতে গেছে।
  // "কাজ দিন" একাডেমিক হাব এখন হোমের প্রথম স্বতন্ত্র ফিচার-টাইল।
  assert.equal(tiles.length, 6, 'ছয়টি ফিচার-টাইল — ক্লাস উপস্থিতি হোমে থাকবে না');
  assert.ok($('.teacher-home-grid'), 'the grid container exists');
  assert.deepEqual(tiles.map(t => t.dataset.teacherView),
    ['academic', 'homework', 'suggestion', 'notice', 'online-exams', 'exam'],
    'প্রতিটি টাইল একটি বিদ্যমান স্ক্রিনে যায়');
  assert.equal($('#teacherHome [data-teacher-view="routine-view"]'), null,
    'হোম পেজে ক্লাস উপস্থিতির কোনো দরজা থাকবে না');
  const workHub = $('#teacherHome .teacher-home-tile[data-teacher-view="academic"]');
  assert.ok(workHub, '"কাজ দিন" হাবের স্বতন্ত্র হোম টাইল আছে');
  assert.equal(workHub.querySelector('.pay-tile-label').textContent.trim(), 'কাজ দিন');
  /* Home tiles are screen doors, never form doors — every create action now
     lives inside the কাজ দিন academic hub. */
  assert.equal($$('#teacherHome [data-new-activity], #teacherHome [data-new-notice]').length, 0,
    'হোম টাইল সরাসরি কোনো ফর্ম খোলে না');
  assert.equal($$('.teacher-home-extra').length, 0, 'ডুপ্লিকেট পিল-সারি সরানো হয়েছে');
  assert.ok($('#teacherTodayClasses'), 'আজকের ক্লাস section');
  assert.equal($('#teacherRecent'), null, 'হোম ক্লিন — কোনো সাম্প্রতিক-কাজ ফিড নেই');
});

test('the home homework tile opens the homework screen; its create button opens the form', async () => {
  const tile = $('#teacherHome .teacher-home-tile[data-teacher-view="homework"]');
  assert.equal(tile.dataset.newActivity, undefined, 'the tile is a screen door, not a form door');
  ctx.click(tile);
  await settle();
  assert.equal($('#teacherRecords').hidden, false, 'the homework records screen opens');
  assert.equal($('#teacherModalBackdrop').hidden, true, 'no form pops over the home screen');
  /* The create action stays one tap inside the screen it owns. */
  ctx.click($('#teacherNewActivity'));
  await settle();
  assert.equal($('#teacherModalBackdrop').hidden, false, 'the in-screen create button opens the reused form');
  assert.equal(nfc($('#teacherModalTitle').textContent), nfc('নতুন বাড়ির কাজ'));
  assert.ok($('#activity-title'), 'the normal assignment form is reused');
  ctx.click($('#teacherModalClose'));
  await settle();
  assert.equal($('#teacherModalBackdrop').hidden, true);
  ctx.click($('.admin-bottom [data-teacher-view="home"]'));
  await settle();
  assert.equal($('#teacherHome').hidden, false, 'Home navigation returns to the launcher');
});

test('the clean home has no work feed, while every activity stays reachable on its records tab', async () => {
  await teachingRepository.saveActivity({ type: 'routine', title: 'অতিরিক্ত ক্লাস', subject: 'গণিত', className: 'দশম শ্রেণি', date: shift(-1), time: '17:00', duration: 60, status: 'published', details: 'অনুশীলনী' });
  await teachingRepository.saveActivity({ type: 'homework', title: 'আজকের কাজ', subject: 'গণিত', className: 'দশম শ্রেণি', date: todayISO(), time: '20:00', status: 'published', details: 'অনুশীলনী ১' });
  await teachingRepository.saveActivity({ type: 'suggestion', title: 'খসড়া নোটিশ', subject: 'গণিত', className: 'দশম শ্রেণি', status: 'draft', details: 'নোট' });
  await settle();
  /* Home no longer renders any recent-work surface — the feed was removed, not
     the data. Pending counters and tab badges still reflect the same rows. */
  assert.equal($('#teacherRecent'), null, 'হোমপেজে কোনো সাম্প্রতিক-কাজ ফিড নেই');
  assert.equal($('#navDot-routine').textContent, '১', 'pending attendance still counts on its class seat');
  assert.equal($('#tabCount-homework').textContent, '১');
  // Academic work is reachable on its own records tab, with status + class line.
  ctx.click($('[data-type-tab="suggestion"]'));
  await settle();
  const draft = recordCard('খসড়া নোটিশ');
  assert.ok(draft, 'খসড়া সাজেশন তার রেকর্ডস ট্যাবে অক্ষত থাকে');
  assert.match(draft.querySelector('.teaching-status').textContent, /খসড়া/, 'status chip');
  assert.match(draft.querySelector('small').textContent, /দশম শ্রেণি/, 'class line');
  ctx.click($('[data-type-tab="homework"]'));
  await settle();
  assert.equal(recordCard('আজকের কাজ').querySelector('.teaching-status').textContent, 'প্রকাশিত');
  // Attendance never had a home surface to lose: it stays on the routine tab.
  ctx.click($('[data-type-tab="routine"]'));
  await settle();
  assert.ok(recordCard('অতিরিক্ত ক্লাস'), 'উপস্থিতি ক্লাস রেকর্ডস ট্যাবে অক্ষত থাকে');
  ctx.click($('.admin-bottom [data-teacher-view="home"]'));
  await settle();
  assert.equal($('#teacherHome').hidden, false);
});

test('future-dated work is not pending, and the records card shows its progress', async () => {
  await teachingRepository.saveActivity({ type: 'homework', title: 'পরের সপ্তাহের কাজ', subject: 'রসায়ন', className: 'দশম শ্রেণি', date: shift(7), time: '10:00', status: 'published', details: 'দ্বিতীয় অধ্যায়' });
  await settle();
  assert.equal($('#teacherRecent'), null, 'home no longer hosts a work feed');
  ctx.click($('[data-type-tab="homework"]'));
  await settle();
  const record = recordCard('পরের সপ্তাহের কাজ');
  assert.ok(record, 'the future-dated work is reachable on the homework records tab');
  assert.equal(record.querySelector('.teaching-progress-line').textContent, 'অগ্রগতি ০/২ জন');
  assert.equal(record.querySelector('.teaching-progress-line').classList.contains('idle'), true, 'a future deadline is idle, not flagged pending');
  ctx.click($('.admin-bottom [data-teacher-view="home"]'));
  await settle();
});

test('the উপস্থিতি ক্লাস tab opens the marking sheet and bulk fill marks the whole class', async () => {
  await teachingRepository.saveActivity({ type: 'routine', title: 'গতকালের ক্লাস', subject: 'গণিত', className: 'দশম শ্রেণি', date: shift(-1), time: '11:00', duration: 60, status: 'published', details: 'অনুশীলনী' });
  await settle();
  assert.equal($('#teacherRecent'), null, 'হোমে কাজ-ফিড নেই — উপস্থিতি শুধু রুটিন ট্যাবে আসে');
  assert.equal($('#navDot-routine').textContent, '২', 'দুটি উপস্থিতি বাকি');
  ctx.click($('[data-type-tab="routine"]'));
  await settle();
  const recordCard = $$('#teacherRecordList .teaching-card').find(c => c.querySelector('h3')?.textContent === 'গতকালের ক্লাস');
  ctx.click(recordCard.querySelector('.teaching-actions .primary'));
  assert.equal($('#teacherModalBackdrop').hidden, false);
  const fields = $$('[data-progress-id]');
  assert.equal(fields.length, 2, 'দশম শ্রেণি has two approved students');
  assert.match($('#teacherProgressSummary').textContent, /২ জনের ০ জন নথিভুক্ত • বাকি ২ জন/);

  const allPresent = $$('.teacher-quick-fill [data-quick-fill]').find(b => b.textContent === 'সবাই উপস্থিত');
  ctx.click(allPresent);
  assert.deepEqual(fields.map(f => f.value), ['present', 'present']);
  assert.match($('#teacherProgressSummary').textContent, /২ জনের ২ জন নথিভুক্ত • সব সম্পূর্ণ/);

  ctx.submit($('#teacherProgressForm'));
  await settle();
  assert.equal($('#teacherModalBackdrop').hidden, true);
  assert.equal($('#navDot-routine').textContent, '১', 'one attendance record is still open');
  const marked = $$('#teacherRecordList .teaching-card').find(c => c.querySelector('h3')?.textContent === 'গতকালের ক্লাস');
  assert.equal(marked.querySelector('.teaching-progress-line.pending'), null, 'the record card drops its pending line');
  assert.match(marked.querySelector('.teaching-progress-line').textContent, /২\/২ জন • সব নথিভুক্ত/);
  ctx.click($('.admin-bottom [data-teacher-view="home"]'));
  await settle();
  assert.equal($('#teacherRecent'), null, 'নথিভুক্তির পরেও হোমে কোনো কাজ-ফিড ফেরে না');
});

test('"শুধু বাকিরা" filters assignment evaluation rows and bulk fill respects the filter', async () => {
  ctx.click($('[data-type-tab="homework"]'));
  await settle();
  const card = $$('#teacherRecordList .teaching-card').find(c => c.querySelector('h3').textContent === 'আজকের কাজ');
  ctx.click(card.querySelector('[data-record-action="progress"]'));
  const fields = $$('[data-progress-id]');
  fields[0].value = 'done'; fields[0].dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
  assert.match($('#teacherProgressSummary').textContent, /২ জনের ১ জন নথিভুক্ত/);
  ctx.click($('#teacherOnlyMissing'));
  assert.deepEqual($$('[data-progress-row]').map(r => r.hidden), [true, false]);
  ctx.click($$('.teacher-quick-fill [data-quick-fill]').find(b => b.textContent === 'সবাই দেখা হয়েছে'));
  assert.equal(fields[0].value, 'done'); assert.equal(fields[1].value, 'reviewed');
  ctx.click($('#teacherOnlyMissing')); assert.deepEqual($$('[data-progress-row]').map(r => r.hidden), [false, false]);
  ctx.click($('#teacherModalClose'));
});

test('assignment tabs scope their saved records and report the status split', async () => {
  await teachingRepository.saveActivity({ type: 'homework', title: 'আগামীকালের কাজ', subject: 'পদার্থ', className: 'দশম শ্রেণি', date: shift(1), time: '10:00', status: 'draft', details: 'দ্বিতীয় অধ্যায়' });
  await settle(); ctx.click($('[data-type-tab="homework"]'));
  assert.equal($('#teacherRecords').hidden, false); assert.equal($('#teacherHome').hidden, true);
  assert.equal(nfc($('#teacherRecordsTitle').textContent), nfc('বাড়ির কাজ'));
  assert.equal($('[data-type-tab="homework"]').getAttribute('aria-selected'), 'true');
  assert.equal(nfc($('#teacherRecordCount').textContent), nfc('৩টি বাড়ির কাজ • প্রকাশিত ২ • খসড়া ১'));
  const labels = $$('#teacherRecordList .teacher-group-label').map(el => el.firstChild.textContent);
  assert.equal(labels[0], 'আজ'); assert.equal(labels[1], 'আগামীকাল'); assert.equal(labels.length, 3);
  assert.equal($('#tabCount-homework').textContent, '৩');
});

test('a long list pages instead of scrolling forever', async () => {
  for (let i = 0; i < 17; i += 1) {
    await teachingRepository.saveActivity({ type: 'suggestion', title: `সাজেশন ${i + 1}`, subject: 'গণিত', className: 'দশম শ্রেণি', status: 'published', details: 'নোট' });
  }
  await settle();
  ctx.click($('[data-type-tab="suggestion"]'));
  await settle();

  assert.equal(cards('#teacherRecordList').length, 15);
  assert.equal($('#teacherRecordMore').hidden, false);
  assert.equal($('#teacherRecordMore').textContent, 'আরও ৩টি সাজেশন দেখুন');
  ctx.click($('#teacherRecordMore'));
  assert.equal(cards('#teacherRecordList').length, 18);
  assert.equal($('#teacherRecordMore').hidden, true);

  // A new search starts from the first page again.
  ctx.type($('#teacherRecordSearch'), 'সাজেশন ১');
  assert.ok(cards('#teacherRecordList').length < 18);
});

test('the student roster still needs a search before listing anyone', () => {
  ctx.click($('[data-teacher-view="students"]'));
  assert.equal($('#teacherStudents').hidden, false);
  assert.equal(cards('#teacherStudentList').length, 0);
  ctx.type($('#teacherStudentSearch'), 'AP-1024');
  assert.equal(cards('#teacherStudentList').length, 1);
  assert.match($('#teacherStudentCount').textContent, /১ জন অনুমোদিত শিক্ষার্থী/);
});

test('attendance marking from the উপস্থিতি ক্লাস tab clears its pending line when all present is saved', async () => {
  await teachingRepository.saveActivity({ type: 'routine', title: 'আজকের গণিত ক্লাস', subject: 'গণিত', className: 'দশম শ্রেণি', date: todayISO(), time: '09:00', duration: 60, status: 'published', details: 'অনুশীলনী' });
  await settle();
  ctx.click($('.admin-bottom [data-teacher-view="home"]'));
  await settle();
  assert.equal($('#teacherRecent'), null, 'হোমপেজে কখনো কাজ-ফিড থাকবে না — উপস্থিতি রুটিন ট্যাবেই');
  ctx.click($('[data-type-tab="routine"]'));
  await settle();
  const findRoutineCard = () => $$('#teacherRecordList .teaching-card').find(c => c.querySelector('h3')?.textContent === 'আজকের গণিত ক্লাস');
  assert.match(findRoutineCard().querySelector('.teaching-progress-line').textContent, /উপস্থিতি বাকি/);
  ctx.click(findRoutineCard().querySelector('.teaching-actions .primary'));
  const allPresent = $$('.teacher-quick-fill [data-quick-fill]').find(b => b.textContent === 'সবাই উপস্থিত');
  ctx.click(allPresent); ctx.submit($('#teacherProgressForm')); await settle();
  assert.equal(findRoutineCard().querySelector('.teaching-progress-line.pending'), null);
  assert.equal($('#navDot-routine').textContent, '১', 'only the older open record remains');
});

test('the records screen keeps the class scope picker the home no longer needs', async () => {
  const select = () => $('#teacherClassFilter');
  const pick = value => {
    select().value = value;
    select().dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
  };
  assert.equal(select().options[0].value, 'all');
  assert.ok(select().options.length > 5, 'the picker offers every class the app runs');

  // Both classes below have approved students, so both pieces of work are real.
  await teachingRepository.saveActivity({ type: 'homework', title: 'দশম শ্রেণির কাজ', subject: 'গণিত', className: 'দশম শ্রেণি', date: todayISO(), time: '20:00', status: 'published', details: 'অধ্যায় ২' });
  await teachingRepository.saveActivity({ type: 'homework', title: 'অনার্সের কাজ', subject: 'বাংলা', className: 'অনার্স ১ম বর্ষ', date: todayISO(), time: '20:00', status: 'published', details: 'রচনা' });
  await settle();
  ctx.click($('[data-type-tab="homework"]'));
  await settle();
  const titles = () => $$('#teacherRecordList .teaching-card h3').map(el => el.textContent);
  assert.ok(titles().includes('দশম শ্রেণির কাজ') && titles().includes('অনার্সের কাজ'));

  pick('দশম শ্রেণি');
  assert.equal(titles().includes('দশম শ্রেণির কাজ'), true);
  assert.equal(titles().includes('অনার্সের কাজ'), false, 'another class drops out of the list');

  pick('all');
  assert.ok(titles().includes('অনার্সের কাজ'), 'সব নির্ধারিত শ্রেণি brings everything back');
  assert.equal($('#teacherTodayClassCount').textContent, '০টি ক্লাস', 'no manager routine is seeded in this panel');
});

test('Teacher Settings is the shared five-group hub, with no duplicated control', () => {
  /* §29 — one Settings structure for every role. The Teacher's profile card,
     password row and theme switch stay; the hub fills the rest, including the
     notification group the Teacher page already had. */
  const hub = $('[data-settings-hub="teacher"]');
  assert.ok(hub, 'teacher settings hub missing');
  assert.deepEqual([...hub.querySelectorAll('[data-settings-group]')].map(section => section.dataset.settingsGroup),
    ['account', 'notification', 'app', 'security', 'data']);
  assert.equal($$('#darkModeToggle').length, 1, 'one theme switch (the page\'s own)');
  assert.equal($$('[data-settings-toggle="theme"]').length, 0, 'the hub must not add a second theme switch');
  assert.equal(hub.querySelectorAll('[data-settings-row="profile"]').length, 1, 'profile');
  assert.equal(hub.querySelectorAll('[data-settings-row="password"]').length, 1, 'password');
  for (const key of ['install', 'device', 'session', 'offline', 'storage']) {
    assert.equal(hub.querySelectorAll(`[data-settings-row="${key}"]`).length, 1, key);
  }
  assert.equal(hub.querySelector('[data-settings-group="notification"]').dataset.settingsOwner, 'notification');
});

test('Teacher Settings re-entry clears a previously open group and keeps one active screen', async () => {
  const hub = $('[data-settings-hub="teacher"]');
  await ctx.waitFor(() => Boolean(hub.querySelector('[data-settings-groups]')));
  const nav = hub.querySelector('[data-settings-groups]');
  const groups = [...hub.querySelectorAll('[data-settings-group]')];
  const openProfile = async () => {
    ctx.click($('.admin-bottom [data-teacher-view="more"]'));
    await ctx.waitFor(() => $('#teacherMore').hidden === false);
    ctx.click($('#teacherMore [data-teacher-view="profile"]'));
    await ctx.waitFor(() => $('#teacherProfile').hidden === false);
  };

  await openProfile();
  ctx.click(hub.querySelector('[data-settings-open="security"]'));
  await ctx.flush(2);
  assert.equal(hub.querySelector('[data-settings-group="security"]').hidden, false);
  assert.equal(nav.hidden, true);

  ctx.click($('.admin-bottom [data-teacher-view="home"]'));
  await ctx.waitFor(() => $('#teacherHome').hidden === false);
  await openProfile();
  assert.equal($$('.teacher-view:not([hidden])').length, 1, 'exactly one Teacher screen is visible');
  assert.equal(nav.hidden, false, 're-entering Settings restores the group menu');
  assert.ok(groups.every(group => group.hidden), 'no stale Security group remains visible');
  assert.equal($('.admin-bottom [aria-current="page"]').dataset.teacherView, 'more');

  ctx.click(hub.querySelector('[data-settings-open="account"]'));
  await ctx.flush(2);
  assert.equal(hub.querySelector('[data-settings-group="account"]').hidden, false);
  assert.equal(hub.querySelector('[data-settings-group="security"]').hidden, true);
  ctx.click($('.admin-bottom [data-teacher-view="home"]'));
  await ctx.waitFor(() => $('#teacherHome').hidden === false);
  await openProfile();
  assert.equal(nav.hidden, false, 'a repeated Account → Settings return is idempotent');
  assert.ok(groups.every(group => group.hidden));
  ctx.click($('.admin-bottom [data-teacher-view="home"]'));
});

test('the grid doors open their own screens and the routine lives on one screen', async () => {
  /* ২০২৬-১০-২০: routine/attendance no longer has a home tile — its only door
     is the ক্লাস hub submenu (read-only routine with attendance sessions). */
  ctx.click($('.admin-bottom [data-teacher-view="classes"]'));
  await settle();
  assert.equal($('#teacherClasses').hidden, false);
  ctx.click($('#teacherClasses .teacher-submenu [data-teacher-view="routine-view"]'));
  await settle();
  assert.equal($('#teacherRoutine').hidden, false, 'উপস্থিতি door opens the routine screen');
  const tabs = $$('.teacher-routine-tabs [data-routine-tab]');
  assert.equal(tabs.length, 9, 'নয়টি বিভাগ এক সারিতে');
  assert.equal($('#teacherRoutineToday'), null, 'the nine separate pages are gone');
  ctx.click($('.teacher-routine-tabs [data-routine-tab="exam"]'));
  await settle();
  assert.equal($('.teacher-routine-tabs [data-routine-tab="exam"]').getAttribute('aria-selected'), 'true');
  assert.equal($('.teacher-routine-tabs [data-routine-tab="today"]').getAttribute('aria-selected'), 'false');
  ctx.click($('.admin-bottom [data-teacher-view="home"]'));
  await settle();
  ctx.click($('#teacherHome [data-teacher-view="homework"]'));
  await settle();
  assert.equal($('#teacherRecords').hidden, false, 'বাড়ির কাজ door opens the records screen');
  ctx.click($('.admin-bottom [data-teacher-view="home"]'));
  await settle();
  /* উপকরণ now lives under the কাজ দিন hub instead of a home tile. */
  ctx.click($('#teacherHome .teacher-home-tile[data-teacher-view="academic"]'));
  await settle();
  ctx.click($('#teacherAcademic [data-teacher-view="courses"]'));
  await settle();
  assert.equal($('#teacherCourses').hidden, false, 'উপকরণ door opens its own screen');
  ctx.click($('.admin-bottom [data-teacher-view="home"]'));
  await settle();
  assert.equal($('#teacherHome').hidden, false, 'bottom nav brings the teacher back home');
  /* The new suggestion home tile opens the suggestion records screen. */
  ctx.click($('#teacherHome .teacher-home-tile[data-teacher-view="suggestion"]'));
  await settle();
  assert.equal($('#teacherRecords').hidden, false);
  assert.equal($('[data-type-tab="suggestion"]').getAttribute('aria-selected'), 'true');
});

test('the exam seat lands on one CTA and four doors, not a nine-tile shelf', async () => {
  assert.ok($('.teacher-cta'), 'দ্রুত MCQ-র প্রধান CTA');
  const chips = $$('#teacherExamHub .day-tab');
  assert.equal(chips.length, 4, 'চারটি বিভাগ-দরজা');
  assert.equal($$('#teacherExamHub .pay-tile').length, 0, 'the nine-tile shelf is gone');
  ctx.click($('.teacher-cta'));
  await settle();
  assert.equal($('#teacherOnlineExams').hidden, false);
  assert.equal($('#teacherExamWorkspace').hidden, false, 'CTA opens the existing exam workspace');
  assert.ok($('#teacherExamWorkspace [data-exam-form]'), 'the quick MCQ CTA opens the existing MCQ form directly');
  assert.equal($('#teacherExamWorkspace [name="lateMinutes"]').value, '5', 'fast mode uses the five-minute late-entry default');
  const start = new Date($('#teacherExamWorkspace [name="startAt"]').value).getTime();
  const end = new Date($('#teacherExamWorkspace [name="endAt"]').value).getTime();
  assert.ok(end - start >= 19 * 60000 && end - start <= 21 * 60000, 'fast mode defaults to twenty minutes');
  assert.equal($('#teacherExamWorkspace [data-quick-step="0"]').hidden, false, 'wizard starts at step one');
  const form = $('#teacherExamWorkspace [data-exam-form]');
  form.elements.title.value = 'দ্রুত পরীক্ষা';
  form.elements.className.value = enabledClasses[0];
  form.elements.className.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
  await settle();
  const subject = form.elements.namedItem('subject');
  subject.value = [...subject.options].find(option => option.value)?.value || '';
  ctx.click($('#teacherExamWorkspace [data-quick-next]'));
  assert.equal($('#teacherExamWorkspace [data-quick-step="1"]').hidden, false, 'valid identity opens step two');
  ctx.click($('#teacherExamWorkspace [data-quick-next]'));
  assert.match($('#teacherExamWorkspace [data-quick-error]').textContent, /প্রশ্নের ফরম্যাট মিলেনি/u,
    'invalid question format receives a Bengali message');
  form.elements.template.value = 'প্রশ্ন: ২+২ কত?\nA: ৩\nB: ৪\nC: ৫\nD: ৬\nউত্তর: B';
  form.elements.template.dispatchEvent(new ctx.window.Event('input', { bubbles: true }));
  ctx.click($('#teacherExamWorkspace [data-quick-next]'));
  assert.equal($('#teacherExamWorkspace [data-quick-step="2"]').hidden, false, 'a valid question opens step three');
  assert.equal(form.querySelector('button[type="submit"]').hidden, false, 'draft save appears only at the final step');
  ctx.click($('#teacherExamWorkspace [data-quick-prev]'));
  ctx.click($('#teacherExamWorkspace [data-quick-method="single"]'));
  const method = $('#teacherExamWorkspace [data-quick-method-panel="single"]');
  method.querySelector('[data-quick-one-text]').value = 'বাংলাদেশের রাজধানী কোনটি?';
  method.querySelector('[data-quick-one-a]').value = 'ঢাকা';
  method.querySelector('[data-quick-one-b]').value = 'চট্টগ্রাম';
  method.querySelector('[data-quick-one-c]').value = 'রাজশাহী';
  method.querySelector('[data-quick-one-d]').value = 'খুলনা';
  method.querySelector('[data-quick-one-answer]').value = 'A';
  ctx.click(method.querySelector('[data-quick-one-add]'));
  assert.match(form.elements.template.value, /প্রশ্ন: বাংলাদেশের রাজধানী কোনটি/u,
    'the one-at-a-time builder appends a valid question in the existing exam template format');
  ctx.click($('#teacherExamWorkspace [data-quick-next]'));
  assert.equal($('#teacherExamWorkspace [data-quick-step="2"]').hidden, false, 'questions from both entry modes validate');
});

after(() => ctx?.window.close());
