/* Teacher panel — Tailwind pipeline + the picture hero (2026-10-21 rewrite).
   ----------------------------------------------------------------------------
   The owner asked for the teacher interface to be rebuilt with Tailwind and for
   the Home hero to be the picture itself: "স্বাগতম, <teacher name>" and the
   daily line sit inside the image card, and the gradient card that used to sit
   behind the artwork is gone. These assertions lock that structure and the
   scoped build it depends on. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const html = read('teacher.html');
const page = new JSDOM(html).window.document;

test('the teacher panel loads one scoped Tailwind sheet instead of an inline style block', () => {
  const links = [...page.querySelectorAll('link[rel="stylesheet"]')].map(link => link.getAttribute('href'));
  assert.equal(links.filter(href => href.startsWith('css/teacher-panel.css')).length, 1,
    'the compiled Tailwind sheet is linked exactly once');
  assert.equal(links.at(-1).split('?')[0], 'css/teacher-panel.css',
    'the teacher sheet loads after the canonical cascade');
  assert.doesNotMatch(html, /<style[\s>]/i, 'no presentation lives inside teacher.html any more');
  assert.doesNotMatch(html, /\sstyle="/, 'no inline styles sneak back into the markup');
});

test('the Tailwind build is teacher-only: preflight off, everything scoped to .teacher-reference', () => {
  const config = read('tailwind.config.cjs');
  assert.match(config, /corePlugins:\s*\{\s*preflight:\s*false\s*\}/, 'preflight stays off for the shared cascade');
  assert.match(config, /important:\s*'\.teacher-reference'/, 'every utility is prefixed with the teacher body class');
  assert.match(config, /'\.\/teacher\.html'/, 'the markup is scanned for utilities');
  assert.equal(page.body.className.trim(), 'teacher-reference', 'the scope class is still on the teacher body');

  const source = read('css/tailwind/teacher.src.css');
  assert.match(source, /@tailwind base;/, 'the base layer is declared');
  assert.match(source, /@tailwind components;/, 'the components layer is declared');
  assert.match(source, /@tailwind utilities;/, 'the utilities layer is declared');
  assert.match(source, /--t-scrim-ink:/, 'the hero scrim ink is a token, not a literal');

  const compiled = read('css/teacher-panel.css');
  assert.match(compiled, /\.teacher-reference #teacherHome \.teacher-home-intro\{/, 'the hero rule is scoped');
  assert.match(compiled, /object-fit:cover/, 'the hero artwork fills the card');
  assert.match(html, /class="teacher-hero-content [^"]*min-h-\[var\(--t-hero-min-h\)\]/,
    'the overlay text zone is laid out with Tailwind utilities');
  assert.match(compiled, /\.teacher-reference \.text-on-hero\{color:var\(--pay-on-hero\)\}/,
    'the greeting colour is a scoped Tailwind colour utility');
  /* Nothing may escape the scope: the first selector of the sheet is teacher-only. */
  assert.doesNotMatch(compiled, /(^|\})\.teacher-home-intro\{/,
    'no unscoped teacher rule reaches the other portals');
});

test('the hero is the picture: greeting and daily line sit inside the image card', () => {
  const hero = page.querySelector('#teacherHome .teacher-home-intro');
  assert.ok(hero, 'the Home hero exists');
  assert.equal(hero.hasAttribute('data-home-intro'), true, 'the status surface still anchors after the hero');

  const scene = hero.querySelector('.teacher-hero-scene');
  const art = hero.querySelector('#teacherHeroArt');
  assert.ok(scene && art, 'the day/night classroom artwork is in the hero');
  assert.equal(art.getAttribute('src'), 'assets/images/teacher-hero/welcome-day.webp');
  assert.equal(art.getAttribute('data-hero-card'), 'welcome');
  assert.equal(art.getAttribute('width'), '828');
  assert.equal(art.getAttribute('height'), '462');
  assert.equal(scene.contains(art), true, 'the image is the scene background');
  assert.ok(scene.querySelector('.teacher-hero-scene-scrim'), 'a scrim keeps the text readable on the picture');
  assert.equal(scene.getAttribute('aria-hidden'), 'true', 'the artwork stays decorative');

  const content = hero.querySelector('.teacher-hero-content');
  assert.ok(content, 'the overlay text zone exists');
  assert.equal(hero.querySelectorAll(':scope > .teacher-hero-content').length, 1,
    'the overlay is the only text zone in the card');

  const title = hero.querySelector('h1#teacherHomeTitle');
  const warm = hero.querySelector('p.teacher-hero-warm');
  assert.ok(content.contains(title), 'স্বাগতম sits inside the picture card');
  assert.ok(content.contains(warm), 'the daily line sits inside the picture card');
  assert.equal(title.textContent.trim(), 'স্বাগতম', 'the no-JS fallback greeting is still plain স্বাগতম');
  assert.equal(warm.textContent.trim(), 'আপনার পাঠদান ও শিক্ষার্থীদের অগ্রযাত্রায় আজকের দিনটি হোক ফলপ্রসূ।',
    'the no-JS fallback keeps the advice library head line');
  assert.ok(content.querySelector('.admin-hero-icon #teacherHomeInitial'), 'the identity initial stays on the picture');
  assert.ok(content.querySelector('.teacher-hero-glint'), 'the day/night glint stays on the picture');

  /* One celestial marker only (owner report: the old day artwork carried its own
     sun beside the day/night chip, so two suns showed at once). The artwork is
     sky/clouds by day and stars by night; the chip is what changes with the
     clock, driven by js/teacher.js. */
  assert.equal(scene.querySelectorAll('svg, img:not(#teacherHeroArt), [data-icon]').length, 0,
    'the artwork layer holds nothing but the picture and its scrim');
  const glints = hero.querySelectorAll('.teacher-hero-glint');
  assert.equal(glints.length, 1, 'exactly one time-of-day marker on the card');
  assert.ok(glints[0].querySelector('#teacherHeroGlint'), 'the marker is the swappable sun/moon icon');
  const teacherJs = read('js/teacher.js');
  assert.match(teacherJs, /isDay \? 'sun' : 'moon'/, 'the marker follows the Dhaka clock');
  assert.match(teacherJs, /teacher-hero-\$\{mode\}\.webp/, 'the picture swaps with the same clock');

  /* The old card: a padded gradient surface with a framed picture inside it. It
     must be gone — the picture is the surface, and the text floats over it. */
  const compiled = read('css/teacher-panel.css');
  const ruleFor = selector => {
    const start = compiled.indexOf(selector);
    assert.ok(start >= 0, `${selector} is declared`);
    return compiled.slice(start, compiled.indexOf('}', start));
  };
  const cardRule = ruleFor('.teacher-reference #teacherHome .teacher-home-intro{');
  assert.doesNotMatch(cardRule, /padding:/, 'the card no longer boxes the picture in padding');
  assert.doesNotMatch(cardRule, /background-image/, 'the gradient card behind the artwork is removed');
  assert.match(cardRule, /background:var\(--pay-hero-a\)/, 'the flat hero colour is only the image fallback');
  assert.match(cardRule, /overflow:hidden/, 'the picture is clipped to the card radius');
  const sceneRule = ruleFor('.teacher-reference #teacherHome .teacher-home-intro .teacher-hero-scene{');
  assert.doesNotMatch(sceneRule, /border-radius/, 'the scene is no longer a framed picture inside a card');
  assert.match(sceneRule, /position:absolute/, 'the scene fills the card behind the text');
});

test('ক্লাস uses Home-style hero banner and three full-width action cards with primary data hidden', () => {
  const view = page.querySelector('#teacherClasses');
  assert.ok(view.querySelector('.teacher-home-intro .teacher-hero-scene'), 'ক্লাস starts with the Home-style hero banner');
  assert.equal(view.querySelector('#teacherClassesTitle')?.textContent.trim(), 'ক্লাস ও পাঠদান');
  const cards = [...view.querySelectorAll('.teacher-classes-actions .teacher-action-card')];
  assert.equal(cards.length, 3, 'three Home-style action cards');
  assert.match(cards[0].textContent, /আমার ক্লাস ও বিষয়/);
  assert.match(cards[0].textContent, /ট্যাপ করে এই ক্লাসের কাজে যান/);
  assert.equal(cards[0].getAttribute('data-teacher-view'), 'homework');
  assert.match(cards[1].textContent, /রুটিন ও সময়সূচি/);
  assert.equal(cards[1].getAttribute('data-teacher-view'), 'routine-view');
  assert.match(cards[2].textContent, /একাডেমিক কার্যক্রম/);
  assert.equal(cards[2].getAttribute('data-teacher-view'), 'academic');
  const panel = view.querySelector('#teacherClassPanel');
  assert.ok(panel, 'class panel exists');
  assert.equal(panel.hidden, true, 'primary class list data stays hidden');
  assert.ok(view.querySelector('#teacherClassPanel #teacherClassList'), 'the class list remains mounted inside the hidden panel');

  const examsView = page.querySelector('#teacherOnlineExams');
  assert.ok(examsView.querySelector('.teacher-home-intro .teacher-hero-scene [data-hero-card="exam"]'),
    'পরীক্ষা starts with the Class-style 3D hero banner');
  assert.equal(examsView.querySelector('#teacherOnlineExamsTitle')?.textContent.trim(), 'পরীক্ষা ও মূল্যায়ন');
  const examCards = [...examsView.querySelectorAll('#teacherExamActions .teacher-action-card')];
  assert.equal(examCards.length, 2, 'two full-width action cards on পরীক্ষা');
  assert.equal(examCards[0].getAttribute('data-teacher-exam'), 'new-mcq');
  assert.equal(examCards[1].getAttribute('data-teacher-exam'), 'home');
  assert.equal(examsView.querySelectorAll('#teacherExamHub .day-tab').length, 4, 'four section chips below the action cards');
  assert.equal(examsView.querySelector('.teacher-local-note')?.hidden, true, 'approval note is hidden by default');
  assert.equal(examsView.querySelector('#teacherExamWorkspace')?.hidden, true, 'exam workspace is hidden by default');

  const hub = page.querySelector('#teacherHome .teacher-academic-hub');
  assert.ok(hub, 'Home carries the academic feature card');
  assert.equal(hub.getAttribute('data-teacher-view'), 'academic', 'the card opens the academic hub screen');
  assert.match(hub.textContent, /একাডেমিক কার্যক্রম/);
  assert.match(hub.getAttribute('aria-label'), /[ঀ-৿]/, 'the card carries a Bengali aria-label');
  assert.equal(hub.tagName, 'BUTTON', 'the card is a real button');
  assert.ok(page.querySelector('#teacherHome .teacher-home-actions .teacher-action-card[data-new-activity="homework"]'),
    'Home keeps its create-first cards beside the new hub');
  assert.equal(page.querySelector('#teacherAcademicTitle').textContent.trim(), 'একাডেমিক কার্যক্রম',
    'the academic screen names itself after the feature');

  const compiled = read('css/teacher-panel.css');
  assert.match(compiled, /#teacherHome \.teacher-academic-hub\{/, 'the Home hub card is styled');
});

test('the ক্লাস screen renders full-width hero class cards with subject chips and 3D class artwork', () => {
  const teacherJs = read('js/teacher.js');
  assert.match(teacherJs, /class="teacher-class-hero-main"/, 'class cards render hero main body');
  assert.match(teacherJs, /class="teacher-class-subject-chip"/, 'subjects render as direct chips');
  assert.match(teacherJs, /class="teacher-class-hero-art"/, 'class cards carry 3D class artwork');
  const compiled = read('css/teacher-panel.css');
  assert.match(compiled, /teacher-class-hero-main/, 'the hero class card main column is styled');
  assert.match(compiled, /teacher-class-subject-chip/, 'the subject chip is styled');
  assert.match(compiled, /teacher-class-hero-art/, 'the 3D artwork box is styled');
  const classesView = page.querySelector('#teacherClasses');
  assert.ok(classesView.querySelector('#teacherClassCount'), 'the heading carries a count chip');
});

test('both hero illustrations ship at the card\'s 828×462 size, day and night', () => {
  const heroSubjects = ['welcome', 'classroom', 'attendance', 'exam', 'homework', 'notice'];
  for (const subject of heroSubjects) {
    assert.ok(page.querySelector(`[data-hero-card="${subject}"]`), `teacher.html mounts the ${subject} 3D hero card`);
    for (const mode of ['day', 'night']) {
      const file = `assets/images/teacher-hero/${subject}-${mode}.webp`;
      assert.ok(existsSync(path.join(root, file)), `${file} exists`);
      const buffer = readFileSync(path.join(root, file));
      assert.ok(buffer.length <= 100 * 1024, `${file} stays within the 100 KB mobile budget`);
      assert.equal(buffer.toString('ascii', 0, 4), 'RIFF', `${file} is a RIFF container`);
      assert.equal(buffer.toString('ascii', 8, 12), 'WEBP', `${file} is WebP`);
      assert.equal(buffer.toString('ascii', 12, 16), 'VP8 ', `${file} is a lossy WebP`);
      const start = buffer.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
      assert.ok(start > 0, `${file} carries a VP8 frame header`);
      const width = buffer.readUInt16LE(start + 3) & 0x3fff;
      const height = buffer.readUInt16LE(start + 5) & 0x3fff;
      assert.deepEqual([width, height], [828, 462], `${file} matches the markup's intrinsic size`);
    }
  }
  for (const mode of ['day', 'night']) {
    const file = `assets/teacher-hero/teacher-hero-${mode}.webp`;
    assert.ok(existsSync(path.join(root, file)), `${file} exists`);
    /* RIFF/WEBP header, then the VP8/VP8L/VP8X chunk; the pixel size is read
       from the plain-lossy VP8 header this export uses. */
    const buffer = readFileSync(path.join(root, file));
    assert.equal(buffer.toString('ascii', 0, 4), 'RIFF', `${file} is a RIFF container`);
    assert.equal(buffer.toString('ascii', 8, 12), 'WEBP', `${file} is WebP`);
    assert.equal(buffer.toString('ascii', 12, 16), 'VP8 ', `${file} is a lossy WebP`);
    const start = buffer.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
    assert.ok(start > 0, `${file} carries a VP8 frame header`);
    const width = buffer.readUInt16LE(start + 3) & 0x3fff;
    const height = buffer.readUInt16LE(start + 5) & 0x3fff;
    assert.deepEqual([width, height], [828, 462], `${file} matches the markup's intrinsic size`);
  }
  /* The markup must keep the same intrinsic size as the files, so the card
     never reflows before the picture decodes. */
  const art = page.querySelector('#teacherHeroArt');
  assert.deepEqual([art.getAttribute('width'), art.getAttribute('height')], ['828', '462']);
  assert.ok(existsSync(path.join(root, 'assets/teacher-hero/README.md')),
    'the artwork rules (no sun/moon in the scene) are documented beside the files');
});

test('every teacher view has a full 3D hero card with daily advice, date pill, glint, and hidden top back button', () => {
  const views = [...page.querySelectorAll('.teacher-view')];
  assert.equal(views.length, 11, 'all 11 teacher views are audited');
  for (const view of views) {
    const hero = view.querySelector(':scope > .home-dashboard-intro.teacher-home-intro');
    assert.ok(hero, `${view.id} starts with a full 3D Hero Card`);
    assert.ok(hero.querySelector('.teacher-hero-scene img.teacher-hero-art[data-teacher-hero-art][data-hero-card]'),
      `${view.id} hero card carries 3D artwork`);
    assert.ok(hero.querySelector('.teacher-hero-scene .teacher-hero-scene-scrim'),
      `${view.id} hero card carries readability scrim`);
    assert.ok(hero.querySelector('.teacher-hero-scene .teacher-hero-scene-sheen'),
      `${view.id} hero card carries sheen layer`);
    const content = hero.querySelector(':scope > .teacher-hero-content');
    assert.ok(content, `${view.id} hero card has .teacher-hero-content inside the card`);
    assert.ok(content.querySelector('[data-teacher-hero-date]'),
      `${view.id} hero card has a date pill`);
    assert.ok(content.querySelector('.teacher-hero-glint'),
      `${view.id} hero card has a sun/moon glint`);
    const h1 = content.querySelector('.teacher-hero-welcome h1');
    const advice = content.querySelector('.teacher-hero-welcome p.teacher-hero-advice');
    assert.ok(h1 && h1.textContent.trim().length > 0, `${view.id} hero card has a heading inside the card`);
    assert.ok(advice && advice.textContent.trim().length > 0, `${view.id} hero card has an advice line inside the card`);
    const backBtn = hero.querySelector('.pay-back');
    if (backBtn) {
      assert.equal(backBtn.hidden, true, `${view.id} top back button is hidden`);
    }
  }
  const moreCards = [...page.querySelectorAll('#teacherMore .teacher-more-actions .teacher-action-card')];
  assert.equal(moreCards.length, 6, 'আরও has 6 full-width action cards');
  assert.equal(page.querySelector('#teacherProfile > #teacherProfileCard')?.tagName, 'ARTICLE',
    'আমার প্রোফাইল card sits directly on #teacherProfile outside the collapsed settings groups');
});

test('single-theme Tailwind tokens unify cards, inputs, empty states, and Bengali date fields across all screens', () => {
  const compiled = read('css/teacher-panel.css');
  assert.match(compiled, /html:not\(\[data-theme=dark\]\) \.teacher-reference\{[^}]*--color-bg:#f8fafc/,
    'light theme uses the unified slate-50 page background');
  assert.match(compiled, /input\[type=date\]\[data-date-bn\]:not\(\[data-date-bn=""\]\):not\(:focus\):before\{content:attr\(data-date-bn\)/,
    'date inputs render their Bengali formatted date via data-date-bn');
});

test('the committed stylesheet is what the Tailwind build produces', { skip: !existsSync(path.join(root, 'node_modules/.bin/tailwindcss')) }, () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'apc-teacher-css-')), 'teacher-panel.css');
  try {
    execFileSync(path.join(root, 'node_modules/.bin/tailwindcss'), [
      '-c', 'tailwind.config.cjs',
      '-i', 'css/tailwind/teacher.src.css',
      '-o', out,
      '--minify'
    ], { cwd: root, stdio: 'pipe' });
    assert.equal(readFileSync(out, 'utf8'), read('css/teacher-panel.css'),
      'run `npm run build:teacher-css` and commit the result');
  } finally {
    rmSync(path.dirname(out), { recursive: true, force: true });
  }
});
