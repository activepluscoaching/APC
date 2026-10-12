/* Keeps every logo in the light theme's artwork or the dark one's — the logo's
   background follows the theme instead of staying a white plate.
   Both files are the same drawing (assets/icons/logo-128.png and its -dark
   sibling), so the swap is a src swap, never a re-layout. A plain classic
   script: it must run before the first paint, like js/appearance-boot.js. */
/* Loaded right after js/appearance-boot.js in every panel's <head>. */
(function themeLogos() {
  var KEY = 'active-plus-appearance-v2';
  var LIGHT = 'assets/icons/logo-128.png';
  var DARK = 'assets/icons/logo-128-dark.png';
  function isDark() {
    try { return window.localStorage.getItem(KEY) === 'dark'; } catch (error) { return false; }
  }
  function paint(dark) {
    var images = document.images || [];
    for (var i = 0; i < images.length; i++) {
      var picture = images[i];
      var current = picture.getAttribute('src') || '';
      if (current.indexOf('logo-128') === -1) continue;
      var next = dark ? DARK : LIGHT;
      if (current !== next) picture.setAttribute('src', next);
    }
  }
  function apply() { paint(isDark()); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
  else apply();
  // js/appearance.js announces every switch; the boot script paints before it.
  window.addEventListener('apc:theme', function (event) { paint(event.detail === 'dark'); });
  window.addEventListener('pageshow', apply);
  window.apcThemeLogos = apply;
})();
