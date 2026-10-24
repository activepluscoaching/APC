/*
 * Login pages are static-hosted, so credentials must never be supplied in a URL.
 * Remove the entire query string before loading other page assets or app code.
 * This is defense in depth only: the original request has already reached the
 * hosting server, so credentials should never be shared in a URL in the first
 * place. Preserve hash routes such as #finance.
 */
(() => {
  if (!window.location.search) return;
  // Capture only public, fixed-value feature selectors before stripping the URL.
  // Credentials, unknown keys and arbitrary values never enter sessionStorage.
  const params = new URLSearchParams(window.location.search);
  const backend = params.get('backend');
  const project = params.get('firebaseProject');
  // Keep an in-memory choice for this page even if sessionStorage is disabled:
  // requesting dev must never silently fall back to the production project.
  const flags = window.__apcPublicFlags = {
    backend: ['local', 'firebase'].includes(backend) ? backend : '',
    firebaseProject: params.has('firebaseProject') ? (['dev', 'prod'].includes(project) ? project : 'invalid') : '',
    firebaseEmulator: params.has('firebaseEmulator') ? (params.get('firebaseEmulator') === '1' ? '1' : '0') : ''
  };
  try {
    if (flags.backend) window.sessionStorage.setItem('apc.backend', flags.backend);
    if (flags.firebaseProject) window.sessionStorage.setItem('apc.firebaseProject', flags.firebaseProject);
    if (flags.firebaseEmulator) window.sessionStorage.setItem('apc.firebaseEmulator', flags.firebaseEmulator);
  } catch { /* private mode: in-memory choice survives for this page only */ }
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.hash
  );
})();
