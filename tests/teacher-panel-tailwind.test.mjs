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
  assert.equal(art.getAttribute('src'), 'assets/teacher-hero/teacher-hero-day.webp');
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
