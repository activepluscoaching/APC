/* Modern colour pass guards.

   The school's flat baseline is deliberately grey — that is why it looked dated.
   The colour pass (css/ui-interior.css § 3) is the layer that gives the same
   screens a 2020s look: one second brand hue, five tints, a brand bar before
   headings, tinted tiles, a ring gauge. This file pins the rules that keep that
   layer safe:

     • the palette (both themes) is still the only place a colour is defined
     • every tint used by a class has its soft partner in BOTH themes
     • the colour pass paints with background-IMAGE only, so it layers over the
       glass surfaces instead of replacing them — a flat engine keeps its card
     • it lives in the skin file, screen only, so print stays flat ink
     • the primary action is painted once (the old glass-only gradient is gone)
     • the progress ring still reads the --progress variable the dashboard sets
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const foundation = read('css/foundation.css');
const skin = read('css/ui-interior.css');

/** The declared value of one custom property inside one rule block. */
function token(css, selector, property) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(block, `no rule for ${selector}`);
  const found = block[1].match(new RegExp(`${property}\\s*:\\s*([^;]+);`));
  assert.ok(found, `${property} is not declared for ${selector}`);
  return found[1].trim();
}

test('both themes carry the second brand hue and all five tints', () => {
  for (const selector of [':root', 'html[data-theme=dark]']) {
    assert.match(token(foundation, selector, '--brand-2'), /^#[0-9a-f]{6}$/i,
      `${selector}: the second brand hue is missing`);
    for (const tone of ['blue', 'mint', 'amber', 'violet', 'rose']) {
      assert.match(token(foundation, selector, `--tone-${tone}`), /^#[0-9a-f]{6}$/i,
        `${selector}: --tone-${tone} is missing`);
      // A tint is always a wash (rgba) — never another solid surface colour.
      assert.match(token(foundation, selector, `--tone-${tone}-soft`), /^rgba\(/,
        `${selector}: --tone-${tone}-soft must be a translucent wash`);
    }
    assert.match(token(foundation, selector, '--ring-track'), /^rgba\(/,
      `${selector}: the ring needs its own track wash`);
  }
  // The two themes must not share the same accent black-on-black.
  assert.notEqual(token(foundation, ':root', '--brand-2'), token(foundation, 'html[data-theme=dark]', '--brand-2'),
    'the dark theme reuses the light accent verbatim');
});

test('the colour pass paints layers, never new surfaces, and stays in the skin', () => {
  // Screen only: it lives inside the skin's @media screen block like everything
  // else that is presentation-only.
  assert.match(skin.trimStart(), /^\/\*[\s\S]*?\*\/\s*@media screen \{/);
  const pass = skin.slice(skin.indexOf('3 ── Colour pass'), skin.indexOf('4 ── Asked for less transparency'));
  assert.ok(pass.length > 800, 'the colour pass disappeared from the skin');

  // background-IMAGE only: a background-color here would replace the glass pane
  // and the flat fallback, taking the card's material with it.
  const colourLayers = [...pass.matchAll(/background-color\s*:/g)].length;
  assert.equal(colourLayers, 0,
    'the colour pass sets a background-color — it must only add background-image layers');
  const imageLayers = [...pass.matchAll(/background-image\s*:/g)].length;
  assert.ok(imageLayers >= 8, `the colour pass lost its washes (${imageLayers} left)`);

  // No nested CSS: older WebViews drop the whole block on a syntax error.
  let depth = 0;
  for (const character of pass) {
    if (character === '{') { depth += 1; assert.equal(depth, 1, 'a nested rule sneaked into the colour pass'); }
    else if (character === '}') { depth -= 1; assert.ok(depth >= 0, 'unbalanced braces in the colour pass'); }
  }
  assert.equal(depth, 0, 'unbalanced braces in the colour pass');
});

test('every tone class and every tinted component is wired to the tokens', () => {
  const pass = skin.slice(skin.indexOf('3 ── Colour pass'), skin.indexOf('4 ── Asked for less transparency'));
  for (const tone of ['blue', 'mint', 'amber', 'violet', 'rose']) {
    assert.match(pass, new RegExp(`--tone: var\\(--tone-${tone}\\)`),
      `the ${tone} tone class no longer sets the tone colour`);
    assert.match(pass, new RegExp(`--tone-soft: var\\(--tone-${tone}-soft\\)`),
      `the ${tone} tone class no longer sets the wash`);
  }
  // The tiles the class names promise: dashboard stat tiles and feature tiles
  // must both take the tone wash and the tone icon.
  for (const selector of ['.admin-stat-tile', '.admin-feature-tile']) {
    assert.ok(pass.includes(selector), `${selector} lost its colour`);
  }
  assert.match(pass, /\.admin-feature-tile:nth-child\(5n\+2\)/, 'feature tiles are back to one colour');
  // The brand bar and the gradient primary must both be in the pass.
  assert.match(pass, /\.dashboard-section-heading h2::before/, 'the section brand bar is gone');
  assert.match(pass, /button\.primary[^{]*\{[^}]*linear-gradient\(135deg, var\(--color-primary\), var\(--brand-2\)\)/,
    'the primary action lost its brand gradient');
});

test('one gradient primary, one ring gauge, and the ring still follows the dashboard', () => {
  // The glass block used to paint its own dark-fade primary; the pass is the
  // single source now, so the button cannot end up with two stacked gradients.
  const paints = [...skin.matchAll(/linear-gradient\(135deg, var\(--color-primary\), var\(--brand-2\)\)/g)].length;
  assert.equal(paints, 1, `the primary action is painted ${paints} times (expected once)`);
  assert.doesNotMatch(skin, /linear-gradient\(180deg, rgba\(0,0,0,0\), rgba\(0,0,0,\.16\)\)/,
    'the old glass-only primary gradient is back');

  // The ring is a conic arc over a track, driven by the --progress variable the
  // dashboard already writes (js/student-dashboard.js).
  assert.match(skin, /\.progress-ring\s*\{[^}]*conic-gradient\(from -90deg,[^}]*var\(--progress, 0deg\)/,
    'the progress ring is no longer a gauge');
  assert.match(read('js/student-dashboard.js'), /--progress',\s*`\$\{percent \* 3\.6\}deg`\)/,
    'the dashboard stopped feeding the ring');

  // The colour pass never touches layout on its own: no width/height rules for
  // the app's action rows, so the school button rule stays the one authority.
  const pass = skin.slice(skin.indexOf('3 ── Colour pass'), skin.indexOf('4 ── Asked for less transparency'));
  assert.doesNotMatch(pass, /grid-template-columns/, 'the colour pass is arranging the button rows');
});
