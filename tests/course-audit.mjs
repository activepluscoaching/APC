/* "আমার কোর্স" (student courses view) audit — run with the preview server up:
     python3 -m http.server 8080 --bind 0.0.0.0   (repo root)
     LD_LIBRARY_PATH=/tmp/apc-browser-libs/lib node tests/course-audit.mjs

   It seeds a signed-in student with one of each activity type plus an exam
   score, then measures the real rendered view in three configurations
   (light 390, AMOLED 390, AMOLED 320): horizontal overflow, card count, state
   pills, filter chips and their behaviour, the collapse/expand contract, and
   the completion flow. Screenshots land in preview/audit-courses-*.png.
   It is a browser check, not part of `npm test` (which runs *.test.mjs only). */
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8080';
const browser = await chromium.launch({ executablePath: '/tmp/chromium', args: ['--no-sandbox','--disable-dev-shm-usage','--no-zygote'] });

const STUDENT = { id: 's260930002-audit', name: 'নাদিয়া আক্তার', className: 'দশম শ্রেণি' };
const SEED = ({ dark, student }) => {
  const now = new Date().toISOString();
  const iso = n => new Date(Date.now() - n * 86400000).toISOString();
  localStorage.setItem('active-plus-appearance-v2', dark ? 'dark' : 'light');
  localStorage.setItem('activePlus.demo.autofill.v1', 'off');
  localStorage.setItem('active-plus-student-v1', JSON.stringify({ id: student.id, name: student.name, className: student.className }));
  localStorage.setItem('active-plus-account-v1', JSON.stringify({ username: 'nadia', status: 'active', student: { id: student.id, name: student.name, className: student.className } }));
  localStorage.setItem('activePlus.admin.notices.v1', JSON.stringify([]));
  localStorage.setItem('activePlus.manager.teacherAssignments.v1', JSON.stringify([{ id: 'TAS1', teacherUsername: 'teacher.apc', teacherName: 'রফিক স্যার', className: student.className, group: '', subject: 'গণিত' }]));
  const base = { className: student.className, group: '', status: 'published', teacherId: 'TCH-001', teacherName: 'রফিক স্যার', createdAt: iso(5), updatedAt: now };
  localStorage.setItem('activePlus.teaching.v1', JSON.stringify({ version: 1, activities: [
    { ...base, id: 'A1', type: 'homework', title: 'গণিত অনুশীলনী ৩.২', subject: 'গণিত', date: '2026-10-05', time: '17:00', duration: 0, totalMarks: 0, details: 'প্রথম ১০টি প্রশ্ন খাতায় লিখে আনো।', room: '', resourceURL: 'https://example.com/note.pdf', progress: { [student.id]: { value: 'done', updatedAt: now } } },
    { ...base, id: 'A2', type: 'homework', title: 'ইংরেজি রচনা: আমার বিদ্যালয় ও আমার শিক্ষকদের কথা', subject: 'ইংরেজি', date: '2026-10-06', time: '10:00', duration: 0, totalMarks: 0, details: 'কমপক্ষে ২০০ শব্দ।', room: '', resourceURL: '', progress: {} },
    { ...base, id: 'A3', type: 'routine', title: 'নিয়মিত ইংরেজি ক্লাস', subject: 'ইংরেজি', date: '2026-10-02', time: '10:00', duration: 60, totalMarks: 0, details: '', room: '১০১ নম্বর কক্ষ', resourceURL: '', progress: { [student.id]: { value: 'present', updatedAt: now } } },
    { ...base, id: 'A4', type: 'suggestion', title: 'বই পড়ার পরামর্শ', subject: 'সাধারণ', date: '2026-10-01', time: '', duration: 0, totalMarks: 0, details: 'প্রতিদিন ৩০ মিনিট পড়ো।', room: '', resourceURL: '', progress: {} }
  ] }));
  for (const k of ['boot.v1', 'rules.v1']) localStorage.setItem(`activePlus.notifications.${k}:student:${student.id}`, JSON.stringify({ version: k === 'rules.v1' ? 2 : 1, at: Date.now() - 60000 }));
  localStorage.setItem(`activePlus.notifications.inapp.v1:student:${student.id}`, JSON.stringify({ version: 1, at: 0, keys: [] }));
};

const problems = [];
const note = (ok, message) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${message}`); if (!ok) problems.push(message); };

for (const [tag, dark, width] of [['light', false, 390], ['amoled', true, 390], ['320', true, 320]]) {
  console.log(`\n===== ${tag} (${width}px) =====`);
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, baseURL: BASE });
  await ctx.addInitScript(SEED, { dark, student: STUDENT });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 120)));
  await page.goto(`${BASE}/index.html`);
  await page.waitForTimeout(1300);
  await page.evaluate(() => {
    const auth = document.querySelector('.auth-screen'); if (auth) auth.hidden = true;
    document.getElementById('appShell').hidden = false;
  });
  await page.click('.bottom-link[data-view="courses"]');
  await page.waitForTimeout(300);
  // Refresh through the module the page itself uses, so the DOM is exactly the
  // one the app paints (same bidi ordering, same Bengali digits).
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('teaching-data-updated'));
  });
  // Wait for the module's own (async) paint before measuring anything.
  await page.waitForFunction(() => document.querySelectorAll('#learningList .learning-card').length === 4, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);

  const audit = await page.evaluate(() => {
    const $ = s => document.querySelector(s);
    const $$ = s => [...document.querySelectorAll(s)];
    const box = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const summary = $$('#learningSummary > div').map(d => d.textContent.trim().replace(/\s+/g, ' '));
    const chips = $$('#learningFilters button').map(b => ({ text: b.textContent.trim().replace(/\s+/g, ' '), pressed: b.getAttribute('aria-pressed'), box: box(b) }));
    const cards = $$('#learningList .learning-card');
    const first = cards[0];
    const q = (root, sel) => root.querySelector(sel) ? root.querySelector(sel).textContent.trim().replace(/\s+/g, ' ') : null;
    const info = {
      heading: { title: q($('#coursesTitle') ?? document, '#coursesTitle'), count: q(document, '#learningCount') },
      examLink: $('#coursesView .exam-link') ? { text: $('#coursesView .exam-link').textContent.trim().replace(/\s+/g, ' '), box: box($('#coursesView .exam-link')) } : null,
      summary,
      summaryBoxes: $$('#learningSummary > div').map(box),
      chips,
      cardCount: cards.length,
      firstCard: first ? {
        kind: q(first, '.teaching-kind'), state: q(first, '.learning-state'), title: q(first, '.learning-card-title'),
        subject: q(first, '.learning-subject'), brief: q(first, '.learning-brief'),
        chevron: first.querySelector('.learning-chevron') ? box(first.querySelector('.learning-chevron')) : null,
        expanded: first.querySelector('.learning-card-toggle').getAttribute('aria-expanded'),
        detailsHidden: first.querySelector('.learning-card-details').hidden,
        box: box(first)
      } : null,
      titles: cards.map(c => q(c, '.learning-card-title')),
      states: cards.map(c => q(c, '.learning-state')),
      pendingComplete: $$('#learningList [data-complete-homework]').map(b => b.textContent.trim()),
      overflowRight: $$('#coursesView *').filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => el.className || el.tagName).slice(0, 6),
      scrollW: document.documentElement.scrollWidth,
      viewport: innerWidth,
      emptyVisible: !$('#learningList .teacher-empty')?.hidden && Boolean($('#learningList .teacher-empty')) && !$('#learningList .teacher-empty')?.offsetParent === false
    };
    info.emptyText = $('#learningList .teacher-empty')?.textContent.trim() || null;
    return info;
  });

  note(audit.scrollW === audit.viewport, `no horizontal scroll (scrollWidth ${audit.scrollW} vs ${audit.viewport})`);
  note(audit.overflowRight.length === 0, `nothing sticks out of the viewport: ${JSON.stringify(audit.overflowRight)}`);
  note(audit.cardCount === 4, `four published items listed (got ${audit.cardCount})`);
  // Bengali glyphs can arrive composed or decomposed; compare after NFC and
  // with the whitespace the DOM keeps between <strong> and <span> removed.
  const squash = list => list.map(t => t.replace(/\s+/g, '').normalize('NFC'));
  const [totalTile, pendingTile, doneTile] = squash(audit.summary);
  note(totalTile === '৪মোটকাজ'.normalize('NFC'), `total tile: ${audit.summary[0]}`);
  note(pendingTile === '১বাড়িরকাজবাকি'.normalize('NFC'), `pending tile: ${audit.summary[1]}`);
  note(doneTile === '১বাড়িরকাজসম্পন্ন'.normalize('NFC'), `done tile: ${audit.summary[2]}`);
  const chipText = squash(audit.chips.map(c => c.text));
  const expected = ['সব৪', 'নম্বরওফলাফল০', 'বাড়িরকাজ২', 'একাডেমিকনোটিশ১', 'রুটিন১']
    .map(text => text.normalize('NFC'));
  note(JSON.stringify(chipText) === JSON.stringify(expected), `filter chips: ${JSON.stringify(chipText)} vs ${JSON.stringify(expected)}`);
  note(audit.firstCard?.expanded === 'false' && audit.firstCard?.detailsHidden === true, `first card starts collapsed (expanded=${audit.firstCard?.expanded}, hidden=${audit.firstCard?.detailsHidden})`);
  note((audit.firstCard?.chevron?.w ?? 0) >= 28 && (audit.firstCard?.chevron?.h ?? 0) >= 28, `chevron is a tappable disc: ${JSON.stringify(audit.firstCard?.chevron)}`);
  note(audit.states.includes('সম্পন্ন') && audit.states.some(s => s.includes('কাজ বাকি') || s.includes('উপস্থিত') || s.includes('মূল্যায়ন')), `state pills: ${JSON.stringify(audit.states)}`);
  note(audit.pendingComplete.length === 1, `exactly one incomplete homework offers the complete button: ${JSON.stringify(audit.pendingComplete)}`);
  note(errors.length === 0, `no page errors: ${JSON.stringify(errors)}`);

  // open the second card (the pending homework) and check the revealed details
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#learningList .learning-card')];
    const target = cards.find(c => c.querySelector('[data-complete-homework]'));
    target?.querySelector('.learning-card-toggle')?.click();
  });
  await page.waitForTimeout(400);
  const open = await page.evaluate(() => {
    const card = [...document.querySelectorAll('#learningList .learning-card')].find(c => c.querySelector('.learning-card-details:not([hidden])'));
    if (!card) return null;
    const q = (sel) => card.querySelector(sel)?.textContent.trim().replace(/\s+/g, ' ') || null;
    const box = el => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
    return {
      title: q('.learning-card-title'),
      meta: [...card.querySelectorAll('.learning-meta > div')].map(d => d.textContent.trim().replace(/\s+/g, ' ')),
      metaBoxes: [...card.querySelectorAll('.learning-meta > div')].map(box),
      teacher: q('.learning-teacher'),
      note: q('.learning-action-note'),
      button: q('[data-complete-homework]'),
      buttonBox: box(card.querySelector('[data-complete-homework]')),
      detailsBox: box(card.querySelector('.learning-card-details')),
      expanded: card.querySelector('.learning-card-toggle').getAttribute('aria-expanded')
    };
  });
  console.log('opened card:', JSON.stringify(open));
  note(open && open.expanded === 'true', 'card expands');
  note(!!open?.note, `the "not a submission" note is shown`);
  note((open?.buttonBox?.h ?? 0) >= 44, `complete button is a full-height control (${open?.buttonBox?.h}px)`);
  await page.screenshot({ path: `preview/audit-courses-${tag}-open.png` });

  // Marking homework done must flip the pill, the summary and the button.
  if (width === 390 && !dark) {
    await page.click('#learningList [data-complete-homework]');
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => {
      const q = s => document.querySelector(s)?.textContent.trim().replace(/\s+/g, '') || null;
      return {
        summary: [...document.querySelectorAll('#learningSummary > div')].map(d => d.textContent.replace(/\s+/g, '').normalize('NFC')),
        states: [...document.querySelectorAll('#learningList .learning-state')].map(s => s.textContent.trim()),
        buttons: document.querySelectorAll('#learningList [data-complete-homework]').length,
        chipHomework: document.querySelector('#learningFilters button[data-learning-filter="homework"]')?.textContent.replace(/\s+/g, '')
      };
    });
    console.log('after completion:', JSON.stringify(after));
    note(after.summary[1] === '০বাড়িরকাজবাকি'.normalize('NFC') && after.summary[2] === '২বাড়িরকাজসম্পন্ন'.normalize('NFC'), 'summary updates after completion');
    note(after.buttons === 0, 'the complete button disappears once done');
    await page.click('#learningFilters button[data-learning-filter="routine"]');
    await page.waitForTimeout(300);
  }

  // switch to the routine filter, then to an empty one
  await page.click('#learningFilters button[data-learning-filter="routine"]');
  await page.waitForTimeout(400);
  const routine = await page.evaluate(() => ({
    cards: document.querySelectorAll('#learningList .learning-card').length,
    titles: [...document.querySelectorAll('#learningList .learning-card-title')].map(t => t.textContent.trim()),
    pressed: document.querySelector('#learningFilters button[aria-pressed="true"]')?.textContent.trim()
  }));
  note(routine.cards === 1 && /^(রুটিন|উপস্থিতি)/.test(routine.pressed || ''), `routine filter shows one card: ${JSON.stringify(routine)}`);

  await page.click('#learningFilters button[data-learning-filter="exam"]');
  await page.waitForTimeout(400);
  const empty = await page.evaluate(() => {
    const box = document.querySelector('#learningList .teacher-empty');
    return { text: box?.textContent.trim() || null, visible: Boolean(box && box.offsetParent !== null) };
  });
  note(empty.visible, `empty filter shows a readable empty state: ${JSON.stringify(empty)}`);

  // 320px: check the opened card content again after a resize
  if (width === 320) {
    await page.click('#learningFilters button[data-learning-filter="homework"]');
    await page.waitForTimeout(300);
    await page.evaluate(() => [...document.querySelectorAll('#learningList .learning-card')].forEach(c => { if (c.querySelector('.learning-card-toggle[aria-expanded="false"]')) c.querySelector('.learning-card-toggle').click(); }));
    await page.waitForTimeout(300);
    const narrow = await page.evaluate(() => {
      const out = [];
      for (const card of document.querySelectorAll('#learningList .learning-card')) {
        out.push({ w: Math.round(card.getBoundingClientRect().w ?? card.getBoundingClientRect().width), right: Math.round(card.getBoundingClientRect().right) });
      }
      const meta = [...document.querySelectorAll('.learning-meta')].map(m => Math.round(m.getBoundingClientRect().width));
      return { out, meta, scrollW: document.documentElement.scrollWidth, viewport: innerWidth };
    });
    note(narrow.scrollW === narrow.viewport, `320px: still no horizontal scroll (${narrow.scrollW})`);
    const summaryCols = await page.evaluate(() => getComputedStyle(document.querySelector('#learningSummary')).gridTemplateColumns);
    note(summaryCols.split(' ').length === 3, `320px: summary keeps three tiles in one row (${summaryCols})`);
    const emptyBoxes = await page.evaluate(() => [...document.querySelectorAll('#learningList .teacher-empty')].map(el => el.getBoundingClientRect().width | 0));
    console.log('  320px empty-state widths', JSON.stringify(emptyBoxes));
    console.log('  320px cards:', JSON.stringify(narrow.out), 'meta widths', JSON.stringify(narrow.meta));
    await page.screenshot({ path: 'preview/audit-courses-320-open.png' });
  }

  // Filter state from the checks above would hide the new exam card; go back to
  // "সব" first, exactly as a student would.
  await page.click('#learningFilters button[data-learning-filter="all"]');
  await page.waitForTimeout(300);

  // A pathological long unbroken title and an exam with a score: nothing may
  // push the page sideways and the score pill must read in Bengali.
  const stress = await page.evaluate(async () => {
    const now = new Date().toISOString();
    const db = JSON.parse(localStorage.getItem('activePlus.teaching.v1'));
    const base = db.activities[0];
    db.activities.push({ ...base, id: 'A-LONG', type: 'homework', title: 'A'.repeat(40) + 'সুপারলম্বাশিরোনাম' + 'B'.repeat(40), subject: 'গণিত', progress: {} });
    db.activities.push({ ...base, id: 'A-EXAM', type: 'exam', title: 'অর্ধবার্ষিক পরীক্ষা', subject: 'গণিত', time: '09:00', totalMarks: 100, duration: 90, details: 'সব অধ্যায়।', progress: { [JSON.parse(localStorage.getItem('active-plus-student-v1')).id]: { value: 78.5, updatedAt: now } } });
    localStorage.setItem('activePlus.teaching.v1', JSON.stringify(db));
    window.dispatchEvent(new Event('teaching-data-updated'));
    return true;
  });
  await page.waitForTimeout(900);
  const stressView = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    viewport: innerWidth,
    overflow: [...document.querySelectorAll('#learningList *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => el.className).slice(0, 4),
    exam: [...document.querySelectorAll('#learningList .learning-card')].map(c => ({ kind: c.querySelector('.teaching-kind')?.textContent.trim(), state: c.querySelector('.learning-state')?.textContent.trim(), brief: c.querySelector('.learning-brief')?.textContent.trim() })).filter(e => e.kind === 'নম্বর ও ফলাফল')
  }));
  console.log('stress:', JSON.stringify(stressView));
  note(stressView.scrollW === stressView.viewport && stressView.overflow.length === 0, `long title + exam card keep the page inside the viewport`);
  note(stressView.exam.length === 1 && /প্রাপ্ত নম্বর/.test(stressView.exam[0].brief || ''), `exam card shows the score in Bengali: ${JSON.stringify(stressView.exam)}`);
  await page.screenshot({ path: `preview/audit-courses-${tag}-stress.png` });

  await page.screenshot({ path: `preview/audit-courses-${tag}.png` });
  await ctx.close();
}

console.log(`\n===== ${problems.length === 0 ? 'ALL CHECKS PASSED' : problems.length + ' PROBLEM(S)'} =====`);
problems.forEach(p => console.log(' - ' + p));
await browser.close();
