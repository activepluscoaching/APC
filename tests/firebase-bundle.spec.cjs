const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

test('the real Firebase modules boot from same-origin bundles without a CDN SDK', async ({ page }) => {
  const sdkRequests = [];
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('gstatic.com/firebasejs/')) sdkRequests.push(url);
    if (url.startsWith('http://127.0.0.1:8000/')) return route.continue();
    return route.abort(); // no real Firebase project traffic in this smoke test
  });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const state = await page.evaluate(async () => {
    const { firebaseApp, appCheckReady } = await import('/firebase/firebase-init.js');
    const { getAuth, getFirestore, getFunctions } = await import('/firebase/firebase-services.js');
    const { FUNCTIONS_REGION } = await import('/firebase/firebase-init.js');
    await appCheckReady;
    return {
      projectId: firebaseApp.options.projectId,
      auth: Boolean(getAuth(firebaseApp)),
      firestore: Boolean(getFirestore(firebaseApp)),
      functions: Boolean(getFunctions(firebaseApp, FUNCTIONS_REGION)),
      region: FUNCTIONS_REGION
    };
  });
  expect(state).toEqual({ projectId: 'active-plus-coaching', auth: true, firestore: true, functions: true, region: 'asia-south1' });
  expect(sdkRequests).toEqual([]);
});
