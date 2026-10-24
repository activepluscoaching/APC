/* The logo's background follows the theme — behaviour, not just files.

   The artwork is a white-paper drawing; on the AMOLED canvas that plate glared.
   js/theme-logos.js swaps in the dark sibling (same drawing, light strokes)
   before the first paint, follows the live toggle, and covers logos that are
   created after load (the launch screen, the install toast). The file-level
   guards live in tests/amoled-theme.test.mjs; this one runs the script. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SCRIPT = readFileSync(new URL('../js/theme-logos.js', import.meta.url), 'utf8');
const LIGHT = 'assets/icons/logo-128.png';
const DARK = 'assets/icons/logo-128-dark.png';

function page({ stored = null, logos = 2 } = {}) {
  const dom = new JSDOM(
    `<body>${Array.from({ length: logos }, () => `<img src="${LIGHT}" width="38" height="38">`).join('')}</body>`,
    { runScripts: 'outside-only', url: 'https://app.local/' }
  );
  const { window } = dom;
  if (stored) window.localStorage.setItem('active-plus-appearance-v2', stored);
  window.eval(SCRIPT);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return window;
}

const sources = window => [...window.document.images].map(image => image.getAttribute('src'));

test('the first paint grabs the artwork the stored theme needs', () => {
  assert.deepEqual(sources(page({ stored: 'light' })), [LIGHT, LIGHT]);
  assert.deepEqual(sources(page({ stored: 'dark' })), [DARK, DARK]);
  // No stored choice = the app's first run = light, exactly like the theme.
  assert.deepEqual(sources(page()), [LIGHT, LIGHT]);
});

test('flipping the theme swaps the logo both ways, live', () => {
  const window = page({ stored: 'light' });
  const flip = theme => window.dispatchEvent(new window.CustomEvent('apc:theme', { detail: theme }));
  flip('dark');
  assert.deepEqual(sources(window), [DARK, DARK]);
  flip('light');
  assert.deepEqual(sources(window), [LIGHT, LIGHT]);
});

test('logos created after load (launch screen, toast) are covered too', () => {
  const window = page({ stored: 'dark' });
  const late = window.document.createElement('img');
  late.src = LIGHT;
  window.document.body.append(late);
  window.dispatchEvent(new window.Event('pageshow'));
  assert.equal(late.getAttribute('src'), DARK, 'a late logo kept the white plate');
  // The public hook re-paints on demand as well — every logo, no exceptions.
  window.document.body.insertAdjacentHTML('beforeend', `<img src="${LIGHT}">`);
  window.apcThemeLogos();
  assert.deepEqual(sources(window), [DARK, DARK, DARK, DARK]);
});

test('the swapper never touches an image that is not the logo', () => {
  const window = page({ stored: 'dark' });
  const other = window.document.createElement('img');
  other.src = 'assets/icons/icon-192.png';
  window.document.body.append(other);
  window.dispatchEvent(new window.Event('pageshow'));
  assert.equal(other.getAttribute('src'), 'assets/icons/icon-192.png');
});

test('a broken storage (private mode) still renders the light artwork', () => {
  const dom = new JSDOM(`<body><img src="${LIGHT}"></body>`, { runScripts: 'outside-only', url: 'https://app.local/' });
  const { window } = dom;
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  window.eval(SCRIPT);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  assert.equal(sources(window)[0], LIGHT, 'a blocked store must not break the logo');
});
