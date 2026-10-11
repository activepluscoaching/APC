/*
 * Login pages are static-hosted, so credentials must never be supplied in a URL.
 * Remove the entire query string before loading other page assets or app code.
 * This is defense in depth only: the original request has already reached the
 * hosting server, so credentials should never be shared in a URL in the first
 * place. Preserve hash routes such as #finance.
 */
(() => {
  if (!window.location.search) return;
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.hash
  );
})();
