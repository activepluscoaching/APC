/* Admin Dashboard design — the backup banner is built from palette tokens,
   the lone quick-access tile reads as a full action row, staff rows carry an
   avatar, and the hero greets the signed-in Admin by name.

   Static guards on the shipped files (behaviour — counts, the backup-overdue
   rule, routing — is covered by the panel-shell / storage-safety suites):
     • #backupReminder carries no inline colours; css/ui-wallet.css styles it
       and the dashboard's toned snapshot tiles from foundation tokens only
     • the is-wide feature tile spans the grid as a horizontal action row, and
       the "দ্রুত অ্যাক্সেস" label hides when the permission grid is empty
     • staff-overview quick actions speak Bengali, like the rest of the panel,
       and each row opens with an initials avatar
     • the dashboard welcome uses the signed-in account's name, and the
       maintenance flag carries no emoji
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('the backup reminder is a token banner with an icon and a pill action, never inline colours', () => {
  const html = read('admin.html');
  const reminder = html.match(/<div class="admin-backup-reminder"[^>]*id="backupReminder"[^>]*>/);
  assert.ok(reminder, 'the reminder is a styled banner, not a bare paragraph');
  assert.doesNotMatch(reminder[0], /style=/, 'no inline style on the banner');
  const block = html.slice(html.indexOf('id="backupReminder"'), html.indexOf('</div>', html.indexOf('id="backupReminder"')));
  assert.match(block, /data-icon="backup"/, 'the banner carries the backup icon');
  assert.match(block, /<a class="admin-backup-action" href="#backup">/, 'the export action stays a #backup link');

  const css = read('css/ui-wallet.css');
  assert.ok(css.includes('.admin-backup-reminder {'), 'the skin styles the banner');
  assert.ok(css.includes('.admin-backup-action {'), 'the skin styles the pill action');
  const section = css.slice(css.indexOf('/* 20 ')).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(section, /#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i, 'dashboard colours belong in foundation.css');
});

test('snapshot tiles are toned and the lone quick-access tile spans as an action row', () => {
  const css = read('css/ui-wallet.css');
  assert.match(css, /\.admin-view\[data-view-panel="dashboard"\] \.admin-stat-tile \{\s*background-image: linear-gradient\(140deg, var\(--tone-soft/,
    'each snapshot tile washes in its own tone');
  assert.match(css, /\.admin-feature-grid \.admin-feature-tile\.is-wide \{\s*grid-column: 1 \/ -1; flex-direction: row;/,
    'an odd last tile spans the row horizontally instead of sitting in one column');
  assert.match(css, /:has\(#adminFeatureGrid\[hidden\]\) > \.pay-section-label \{ display: none; \}/,
    'the quick-access label hides with an empty permission grid');
});

test('staff overview rows open with an avatar and speak Bengali', () => {
  const js = read('js/staff-overview.js');
  assert.match(js, /staff-overview-avatar/, 'each row paints an initials avatar');
  assert.doesNotMatch(js, />View<|>Edit<|'Deactivate'|'Activate'/, 'no English quick actions remain');
  for (const label of ['দেখুন', 'সম্পাদনা', 'নিষ্ক্রিয় করুন', 'সক্রিয় করুন']) {
    assert.ok(js.includes(label), `quick action "${label}" is Bengali`);
  }
  assert.ok(read('css/ui-wallet.css').includes('.staff-overview-avatar {'), 'the avatar is styled');
});

test('second pass: haloed hero, tone-ruled tiles, staggered quick access, soft staff rows', () => {
  const css = read('css/ui-wallet.css');
  const scope = '.admin-view[data-view-panel="dashboard"]';
  assert.ok(css.includes(`${scope} .admin-hero-icon { box-shadow: 0 0 0 6px var(--pay-hero-chip); }`),
    'the hero mark sits in a soft hero halo');
  assert.ok(css.includes(`${scope} .pay-portal-kicker {`), 'the kicker reads as a chip on the hero');
  assert.ok(css.includes('box-shadow: inset 0 4px 0 var(--tone, transparent), var(--pay-shadow);'),
    'each snapshot tile is ruled in its own tone');
  assert.ok(css.includes(`${scope} .admin-hero-stats .tile-value { font-size: 26px; }`),
    'snapshot numbers carry the card');
  assert.ok(css.includes('@keyframes admin-tile-in'), 'quick-access tiles arrive with a short rise');
  assert.ok(css.includes('animation-delay: calc(var(--tile-index, 0) * 45ms);'),
    'the stagger spends the --tile-index the shell sets per tile');
  assert.ok(!read('admin.html').includes('staffOverviewHome'),
    'the staff overview no longer mounts on the home (owner decision 2026-10-14)');
  const section = css.slice(css.indexOf('/* 25 ')).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(section, /#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i,
    'second-pass dashboard colours belong in foundation.css');
});

test('owner design 2026-10-16: separate toned stat cards and a half-row quick tile', () => {
  const css = read('css/ui-wallet.css');
  const scope = '.admin-view[data-view-panel="dashboard"]';
  assert.match(css, new RegExp(`${scope.replaceAll('[', '\\[').replaceAll(']', '\\]')} \\.admin-hero-stats \\{\\s*gap: 10px;`),
    'the snapshot tiles sit apart, not in one divided strip');
  assert.match(css, /\.admin-hero-stats \.admin-stat-tile \{[^}]*border-radius: 16px;/, 'each tile is its own card');
  assert.match(css, /\.admin-hero-stats \.admin-stat-tile \{[^}]*inset 0 4px 0 var\(--tone/, 'each card is ruled in its tone');
  assert.ok(css.includes(`${scope} .admin-hero-icon { border-radius: 14px; }`), 'the hero mark is a rounded square');
  assert.ok(css.includes(`${scope} .pay-portal-kicker { display: none; }`), 'the welcome leads, the kicker steps aside');
  assert.match(css, /\.admin-hero::after \{[^}]*var\(--tone-mint\)/, 'a teal wash closes the band');
  assert.ok(css.includes(`${scope} .admin-feature-grid .admin-feature-tile.is-wide {`),
    'the lone quick tile is governed on the dashboard');
  assert.match(css, /\.admin-feature-tile\.is-wide \{\s*grid-column: auto; flex-direction: column;/,
    'the lone tile keeps its own half of the row');
  assert.match(css, /\.admin-feature-tile \{[^}]*min-height: 112px;/, 'the quick tile is a standing card');
});

test('the hero greets the signed-in Admin by name and the maintenance flag has no emoji', () => {
  const js = read('js/admin.js');
  assert.match(js, /welcome\.textContent = adminName \? `স্বাগতম, \$\{adminName\}`/, 'the welcome follows the account name');
  assert.doesNotMatch(js, /⚠️/, 'no emoji in the maintenance flag');
  assert.match(js, /রক্ষণাবেক্ষণ মোড চালু আছে/, 'the flag still says maintenance is on');
});
