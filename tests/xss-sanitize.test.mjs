/* XSS prevention: one escaping module for every innerHTML sink, plus the
   admin-authored maintenance message and the CSP meta on every page. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { escapeHtml, escapeAttr, safeUrl, cleanText } from '../js/sanitize.js';
import { loadPage } from './jsdom-harness.mjs';

test('escapeHtml neutralises every HTML-significant character', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('"quoted" & \'single\''), '&quot;quoted&quot; &amp; &#39;single&#39;');
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
  assert.equal(escapeAttr('<b>'), '&lt;b&gt;');
  // Bengali text passes through untouched.
  assert.equal(escapeHtml('রাইসা ইসলাম'), 'রাইসা ইসলাম');
});

test('safeUrl allows only http(s) and relative links', () => {
  assert.equal(safeUrl('https://example.com/notes'), 'https://example.com/notes');
  assert.equal(safeUrl('http://example.com'), 'http://example.com');
  assert.equal(safeUrl('/local/path'), '/local/path');
  assert.equal(safeUrl('notes/page.html'), 'notes/page.html');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('JaVaScRiPt:alert(1)'), '');
  assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(safeUrl('vbscript:msgbox(1)'), '');
  assert.equal(safeUrl('https://user:pass@example.com'), 'https://user:pass@example.com');
  assert.equal(safeUrl(''), '');
  assert.equal(safeUrl(null), '');
});

test('cleanText strips control characters and caps length', () => {
  assert.equal(cleanText('  hello\u0007 world  '), 'hello world');
  assert.equal(cleanText('a'.repeat(50), { max: 10 }), 'a'.repeat(10));
  assert.equal(cleanText('tab\there'), 'tab here');
  assert.equal(cleanText(null), '');
});

test('every page carries a restrictive Content-Security-Policy', () => {
  for (const page of ['index.html', 'admin.html', 'teacher.html', 'payment.html']) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    const match = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
    assert.ok(match, `${page} needs a CSP meta tag`);
    const policy = match[1];
    assert.match(policy, /default-src 'self'/);
    assert.match(policy, /script-src 'self'/);
    assert.match(policy, /object-src 'none'/);
    assert.match(policy, /base-uri 'self'/);
    // No wildcard script sources, no unsafe-eval.
    assert.equal(/script-src[^;]*\*/.test(policy), false);
    assert.equal(/unsafe-eval/.test(policy), false);
  }
});

test('an admin-authored maintenance message cannot inject markup', async () => {
  const payload = '<img src=x onerror="window.__xss = true">';
  const ctx = await loadPage('index.html', {
    seed: {
      'activePlus.demo.autofill.v1': 'off',
      'active-plus-app-config-v1': JSON.stringify({ maintenanceMode: true, maintenanceMessage: payload })
    }
  });
  await import('../js/main.js');
  await ctx.flush();
  const banner = ctx.$('#authMaintenanceBanner');
  assert.ok(banner, 'the maintenance banner is shown');
  // The payload renders as text, never as an element, and nothing runs.
  assert.equal(ctx.$('#authMaintenanceBanner img'), null);
  assert.equal(banner.textContent.includes('onerror'), true);
  assert.equal(ctx.window.__xss, undefined);
  // A plain message is still shown in full, escaped output and all.
  assert.equal(escapeHtml('সিস্টেম আপডেট চলছে'), 'সিস্টেম আপডেট চলছে');
  // Both banner hosts share one sink, and that sink escapes the message —
  // no raw interpolation of the admin text anywhere in the module.
  const source = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const sinks = source.match(/\$\{escapeHtml\(message\)\}/g) || [];
  assert.equal(sinks.length, 1, 'the shared maintenance banner escapes the admin message once');
  assert.equal(/\$\{cfg\.maintenanceMessage\}/.test(source), false);
  assert.equal(/\$\{[^}]*maintenanceMessage[^}]*\}/.test(source), false, 'the admin message is never interpolated raw');
  ctx.dom.window.close();
});

test('no module keeps a private escaping helper that could drift', () => {
  for (const file of ['js/admin.js', 'js/payment.js', 'js/finance-receipt.js', 'js/teaching-data.js', 'js/exam-ui.js']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const privateEscapers = source.match(/const\s+(escapeHtml|escapeText|escape)\s*=/g) || [];
    assert.deepEqual(privateEscapers, [], `${file} must import the shared escaper`);
  }
});
