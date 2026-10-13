/* PWA manifest + theme contract:
   • background_color is the app's light canvas (css/foundation.css --color-bg —
     the real token file; there is no css/tokens.css), theme_color is the green
     primary the brand describes (the palette's green token);
   • every shipped page's <meta name="theme-color"> matches the manifest;
   • orientation is not locked to portrait;
   • the manifest shortcuts ./#routine and ./#results really resolve to student
     views (results opens the ফলাফল tab inside পরীক্ষা). */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPage } from './jsdom-harness.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

function token(name) {
  const css = read('css/foundation.css');
  const root = css.match(/:root\{([\s\S]*?)\n\}/);
  assert.ok(root, 'foundation.css keeps the light palette in :root');
  const found = root[1].match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  assert.ok(found, `${name} is not declared in the light palette`);
  return found[1].trim();
}

let setView;
let viewRouteFromHash;
let ctx;

before(async () => {
  ctx = await loadPage('index.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  ({ setView, viewRouteFromHash } = await import('../js/shell.js'));
});

test('manifest colors come from the real palette: white canvas, green primary', () => {
  assert.equal(manifest.background_color.toLowerCase(), token('--color-bg').toLowerCase(),
    'background_color must be the light canvas token');
  assert.equal(manifest.theme_color.toLowerCase(), token('--color-success').toLowerCase(),
    'theme_color must be the palette green (the brand primary)');
  // The runtime theme switcher keeps the same green in light mode.
  const appearance = read('js/appearance.js');
  assert.ok(appearance.includes(`light: '${manifest.theme_color}'`), 'appearance.js THEME_COLOR.light matches the manifest');
  assert.ok(appearance.includes("dark: '#000000'"), 'AMOLED stays true black');
});

test('every shipped page\'s theme-color meta matches the manifest', () => {
  for (const page of ['index.html', 'admin.html', 'manager.html', 'teacher.html', 'payment.html']) {
    const meta = read(page).match(/<meta name="theme-color" content="([^"]+)">/);
    assert.ok(meta, `${page} has no theme-color meta`);
    assert.equal(meta[1].toLowerCase(), manifest.theme_color.toLowerCase(), `${page}: meta drifts from the manifest`);
  }
});

test('orientation is unlocked and the shortcuts keep their routes', () => {
  assert.ok(manifest.orientation === 'any' || manifest.orientation === undefined,
    `orientation is locked to ${manifest.orientation}`);
  const shortcuts = Object.fromEntries(manifest.shortcuts.map(entry => [entry.name, entry.url]));
  for (const url of ['./#routine', './#results']) {
    assert.ok(Object.values(shortcuts).includes(url), `manifest keeps the ${url} shortcut`);
    const route = url.replace('./#', '');
    assert.equal(viewRouteFromHash(`#${route}`), route, `${url} resolves to a student view`);
    assert.ok(read('index.html').includes(`id="${route}View"`) || route === 'results',
      `${url} has a panel to open`);
  }
});

test('./#routine and ./#results really open their views', () => {
  setView(viewRouteFromHash('#routine'), { history: 'replace' });
  assert.equal(ctx.$('#routineView').classList.contains('active'), true);
  assert.equal(ctx.window.location.hash, '#routine');

  setView(viewRouteFromHash('#results'), { history: 'replace' });
  assert.equal(ctx.$('#examResultsView').classList.contains('active'), true,
    'the #results shortcut opens the ফলাফল page inside পরীক্ষা');
  setView('home', { history: 'replace' });
});
