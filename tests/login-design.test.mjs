/* Login design (index.html #authScreen) — the living sky stays untouched;
   the sheet over it gets a haloed logo plate, a lifted active tab, taller
   fields with a visible focus ring, and a submit that reads as the page's
   one action.

   Static guards on the shipped skin (login behaviour — credential checks,
   registration steps, the sky state machine — is covered by the login and
   auth-sky suites):
     • every §29 rule is scoped to .auth-screen and built from foundation
       tokens only, so the student app behind the login inherits none of it
     • the sky rules (photo states, orb arc, season washes) are not
       re-declared by the design pass
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('the login sheet is polished inside .auth-screen only, from tokens only', () => {
  const css = read('css/ui-wallet.css');
  const section = css.slice(css.indexOf('/* 29 '), css.indexOf('/* §30 '));
  const rules = section.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const selector of rules.match(/^[^{}]+\{/gm) || []) {
    assert.ok(selector.includes('.auth-screen'), `rule escapes the auth screen: ${selector.trim()}`);
  }
  assert.doesNotMatch(rules, /#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i, 'login colours belong in foundation.css');
  assert.ok(rules.includes('background: var(--auth-card-bg);'),
    'the outer login card is a clean single surface card');
  assert.ok(rules.includes('background: var(--color-primary); color: var(--color-on-accent);'),
    'the active tab uses the filled green brand pill');
  assert.ok(rules.includes('.auth-panel.active {\n  border: 0; border-radius: 0; padding: 0;'),
    'no nested inner card frame inside the login card');
  assert.ok(rules.includes('outline: 3px solid var(--pay-disc);'), 'focused fields get a visible ring');
  assert.match(rules, /\.auth-screen \.auth-submit \{\s*min-height: 46px;/, 'the submit is a clean compact action');
  assert.doesNotMatch(css, /assets\/sky\//, 'noisy sky photographs are replaced by the clean minimal canvas');
  assert.match(css, /\.auth-sky,\s*\.auth-orb,\s*\.auth-cloud,\s*\.auth-sky::before\s*\{\s*display:\s*none;\s*\}/,
    'sky orb and drifting cloud bands are hidden');
});

test('the sky machine itself is not re-painted by the design pass', () => {
  const css = read('css/ui-wallet.css');
  const section29 = css.slice(css.indexOf('/* 29 '), css.indexOf('/* §30 '));
  assert.doesNotMatch(section29, /data-sky|data-celestial|data-season|auth-orb|auth-cloud|background-image/,
    'no sky state, orb or photograph rule is re-declared');
  const html = read('index.html');
  assert.match(html, /id="authScreen" data-sky="clear-day"/, 'the sky still boots into its day state');
  assert.match(html, /id="loginForm"/, 'the login form is unchanged');
  assert.match(html, /id="authMessage" role="status" hidden/, 'the message slot is unchanged');
});
