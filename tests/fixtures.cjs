// Domain regressions intentionally run without the automatic review fixtures.
// demo-preview.spec.cjs separately tests the default, fully populated experience.
const base = require('@playwright/test');
exports.test = base.test.extend({
  isolatedData: [async ({ context }, use) => {
    await context.addInitScript(() => localStorage.setItem('activePlus.demo.autofill.v1', 'off'));
    await use();
  }, { auto: true }]
});
exports.expect = base.expect;
