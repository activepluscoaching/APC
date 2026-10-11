/* Maintenance mode on the student app.

   Regression: the flag was read as a loose truthy value, so a config that had
   travelled through sync / backup merge with `maintenanceMode: "false"` (or any
   other non-boolean) put every device under a permanent "সিস্টেম রক্ষণাবেক্ষণ
   চলছে" banner — with no control anywhere in the app to switch it off again.

   Covered here:
     • the flag is a strict boolean (maintenanceState, the one shared reader)
     • on = a notice inside the login card and inside the signed-in column
     • off = both notices are removed, live, without a reload */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { maintenanceState, DEFAULT_APP_SETTINGS } from '../js/config.js';

const CONFIG_KEY = 'active-plus-app-config-v1';

test('maintenanceState treats only a literal true as "under maintenance"', () => {
  assert.deepEqual(maintenanceState({ maintenanceMode: true }).on, true);
  assert.deepEqual(maintenanceState({ maintenanceMode: 'true' }).on, true);
  // A synced or hand-edited document may carry the flag as text; "false" is off.
  for (const value of [false, 'false', 'FALSE', 0, '0', null, undefined, 1, {}]) {
    assert.equal(maintenanceState({ maintenanceMode: value }).on, false, `${String(value)} must not open the banner`);
  }
  assert.equal(maintenanceState(undefined).on, false);
  assert.equal(maintenanceState({}).on, false);
});

test('an empty message falls back to the default Bengali notice', () => {
  assert.equal(maintenanceState({ maintenanceMode: true }).message, DEFAULT_APP_SETTINGS.maintenanceMessage);
  assert.equal(maintenanceState({ maintenanceMode: true, maintenanceMessage: '   ' }).message, DEFAULT_APP_SETTINGS.maintenanceMessage);
  assert.equal(maintenanceState({ maintenanceMode: true, maintenanceMessage: 'আজ রাত ১০টায় কাজ শেষ হবে' }).message, 'আজ রাত ১০টায় কাজ শেষ হবে');
});

let ctx;

before(async () => {
  ctx = await loadPage('index.html', {
    seed: {
      'activePlus.demo.autofill.v1': 'off',
      [CONFIG_KEY]: JSON.stringify({ maintenanceMode: true, maintenanceMessage: 'সিস্টেম আপডেট চলছে' })
    }
  });
  await import('../js/main.js');
  await ctx.flush();
});

test('the notice appears on both the login card and the app screen', () => {
  const auth = ctx.$('#authMaintenanceBanner');
  const app = ctx.$('#appMainMaintenanceBanner');
  assert.ok(auth, 'login card carries the notice');
  assert.ok(app, 'signed-in screen carries the notice');
  // Inserted inside the content column, never over the fixed topbar.
  assert.equal(auth.parentElement, ctx.$('.auth-card'));
  assert.equal(app.parentElement, ctx.$('#appMain'));
  assert.equal(auth.querySelector('.maint-body p').textContent, 'সিস্টেম আপডেট চলছে');
  assert.equal(app.querySelector('.maint-body p').textContent, 'সিস্টেম আপডেট চলছে');
});

test('a settings write from the admin clears the notice without a reload', () => {
  const writeConfig = config => ctx.window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  // Admin → System Settings → রক্ষণাবেক্ষণ মোড: unchecked, saved.
  writeConfig({ maintenanceMode: false, maintenanceMessage: 'সিস্টেম আপডেট চলছে' });
  ctx.window.dispatchEvent(new ctx.window.Event('apc-app-config'));
  assert.equal(ctx.$('#authMaintenanceBanner'), null);
  assert.equal(ctx.$('#appMainMaintenanceBanner'), null);

  // Back on (another device wrote the settings): the notice returns, updated.
  writeConfig({ maintenanceMode: true, maintenanceMessage: 'রাত ১০টা পর্যন্ত বন্ধ' });
  ctx.window.dispatchEvent(new ctx.window.Event('apc-app-config'));
  assert.equal(ctx.$('#authMaintenanceBanner .maint-body p').textContent, 'রাত ১০টা পর্যন্ত বন্ধ');

  // A string "false" from an older document must not reopen it.
  writeConfig({ maintenanceMode: 'false', maintenanceMessage: 'রাত ১০টা পর্যন্ত বন্ধ' });
  ctx.window.dispatchEvent(new ctx.window.Event('apc-app-config'));
  assert.equal(ctx.$('#authMaintenanceBanner'), null, 'a non-boolean flag keeps the app open');

  // A cross-tab / cloud storage event on the settings key repaints too.
  writeConfig({ maintenanceMode: true, maintenanceMessage: 'পুনরায় চালু' });
  const event = new ctx.window.Event('storage');
  Object.defineProperty(event, 'key', { value: CONFIG_KEY });
  ctx.window.dispatchEvent(event);
  assert.equal(ctx.$('#authMaintenanceBanner .maint-body p').textContent, 'পুনরায় চালু');
});
