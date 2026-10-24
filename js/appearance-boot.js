/* Pre-paint appearance apply. Runs as a classic script in <head> so a stored
   dark theme is on <html> before the first render and the screen never flashes
   light. Dark is strictly opt-in: without a stored choice the app stays light,
   whatever the device preference says — only an explicit toggle turns it on.
   No imports here on purpose; keep APPEARANCE_KEY identical to
   js/appearance.js — tests/appearance.test.mjs fails on drift. */
(function applyAppearanceEarly() {
  var APPEARANCE_KEY = 'active-plus-appearance-v2';
  var theme = 'light';
  try {
    var stored = window.localStorage.getItem(APPEARANCE_KEY);
    if (stored === 'dark' || stored === 'light') theme = stored;
  } catch (error) {
    // Private mode hides the stored choice: stay light until the user toggles.
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
