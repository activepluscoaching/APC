# Maintenance mode — one switch, one escape hatch

**Reported symptom:** every device opened the student app on a permanent
"⚠️ সিস্টেম রক্ষণাবেক্ষণ চলছে" card — *"সম্মানিত শিক্ষার্থী, অ্যাপটিতে বর্তমানে
সিস্টেম আপডেট চলছে। সাময়িক অসুবিধার জন্য আন্তরিকভাবে দুঃখিত।"* — with nothing
in the app able to take it down again.

## Root cause

`js/main.js` read the flag as a loose truthy value:

```js
if (cfg.maintenanceMode) { /* paint the banner */ }
```

The settings document (`active-plus-app-config-v1`) travels through cloud sync,
backup merge and hand edits, so `maintenanceMode` can arrive as the string
`"false"`, `0`, or any other non-boolean value. All of them are truthy in JS, so
the banner opened — and stayed, because **no control anywhere in the product
could write the flag**. A boolean feature flag with no writer is a one-way door.

## The fix

1. **One shared reader.** `maintenanceState(cfg)` in `js/config.js` is the only
   place that interprets the flag. Only a literal `true` (or the `"true"` string a
   JSON form can produce) means "under maintenance"; everything else keeps the
   app open. A message that is empty or whitespace falls back to the default
   Bengali notice, and a message is capped at 500 characters.
2. **A switch in Admin → সিস্টেম সেটিংস → রক্ষণাবেক্ষণ মোড.** `js/admin.js`
   renders the current state (`#cfgMaintenanceMode`, `#cfgMaintenanceMessage`,
   `#maintenanceState`) and saves an **explicit** `maintenanceMode: false`, so
   the off state is what syncs to every device — never an absent key.
3. **The banner clears live.** `js/main.js` repaints on any settings write
   (`storage` event on the config key, plus an `apc-app-config` event), so a
   student device drops the card the moment the admin saves, without a reload.
4. **The dashboard refuses to let it be forgotten.** While the mode is on, the
   admin dashboard carries a `⚠️ রক্ষণাবেক্ষণ মোড চালু আছে` line that disappears
   with the switch.

## Boundaries kept

- The notice is informational: login, sync and every view keep working. It is a
  warning card inside `.auth-card` and `#appMain`, never an overlay over the
  fixed topbar.
- The admin-authored message is untrusted text: it is escaped exactly once, in
  `maintenanceBannerMarkup()` (`tests/xss-sanitize.test.mjs` guards the sink).
- Toggling maintenance never rewrites the rest of the settings document —
  branding, modules and the notification master switch survive.

## Tests

- `tests/maintenance-mode.test.mjs` — strict-flag reader, both banner hosts, and
  the live clear/repaint path (including a `"false"` string that must not reopen).
- `tests/maintenance-admin-control.test.mjs` — the real admin panel: a stuck ON
  state is visible, the switch writes an explicit `false`, and the dashboard
  reminder follows it.
