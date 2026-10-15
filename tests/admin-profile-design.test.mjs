/* Admin Profile design — the identity card is a hero over a styled detail
   grid, not an unstyled definition list.

   Static guards on the shipped files (the behavioural profile contract —
   editable name/mobile/email, locked Login User ID — lives in
   admin-profile-user-id.test.mjs):
     • js/admin.js renders the avatar/name/username hero and a semantic <dl>
     • css/ui-wallet.css (the last, active skin) actually styles .profile-list
       and .profile-row, scoped to the Admin profile view
     • the session card carries copy plus a labelled logout button with an icon,
       and the account forms explain themselves with a hint line
     • no new palette: the profile rules compose foundation tokens only
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('the identity card renders an avatar hero and a semantic detail list', () => {
  const js = read('js/admin.js');
  const render = js.slice(js.indexOf('async function renderAdminProfile()'));
  const body = render.slice(0, render.indexOf('\n}\n', render.indexOf('host.innerHTML')));
  assert.match(body, /admin-profile-avatar/, 'initials avatar');
  assert.match(body, /admin-profile-identity/, 'name + username identity block');
  assert.match(body, /escapeHtml\(displayName\)/, 'the name is escaped before it is painted');
  assert.match(body, /<dl class="profile-list">/, 'details are a real definition list');
  assert.match(body, /<div class="profile-row"><dt>/, 'each row is a dt/dd pair');
  assert.doesNotMatch(body, /Current Admin/, 'the old arrow badge copy is gone');
});

test('the wallet skin styles the profile detail grid, scoped to the Admin profile', () => {
  const css = read('css/ui-wallet.css');
  const scope = '.admin-view[data-view-panel="profile"]';
  assert.match(css, new RegExp(`\\${scope.replace('[', '\\[').replace(']', '\\]')} \\.profile-list \\{[^}]*display: grid;`), 'detail grid is laid out');
  assert.ok(css.includes(`${scope} .profile-row {`), 'rows are styled tiles');
  assert.ok(css.includes(`${scope} .profile-row dt {`), 'labels are styled');
  assert.ok(css.includes(`${scope} .profile-row dd {`), 'values are styled');
  assert.ok(css.includes('.admin-profile-avatar {'), 'avatar is styled');
  assert.ok(css.includes('.admin-session-card {'), 'session row is aligned');
  // Palette rule: the profile block composes tokens, never raw colours.
  const block = css.slice(css.indexOf('/* 19 '));
  const declarations = block.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(declarations, /#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i, 'profile colours belong in foundation.css');
});

test('the profile markup explains the session and the account forms', () => {
  const html = read('admin.html');
  const profile = html.slice(html.indexOf('data-view-panel="profile"'), html.indexOf('<!-- More:'));
  assert.match(profile, /class="profile-page-sub"/, 'the page says what lives here');
  assert.match(profile, /admin-session-card/, 'session is its own row');
  assert.match(profile, /id="adminAccountLogout"[^>]*>[\s\S]*?data-icon="logout"/, 'logout carries its icon');
  assert.equal((profile.match(/admin-card-hint/g) || []).length, 2, 'both account forms carry a hint');
  assert.ok(profile.indexOf('id="adminProfileForm"') > profile.indexOf('id="adminProfileCard"'),
    'the edit form still follows the identity card');
});
