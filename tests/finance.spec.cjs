/* Money has two hands: the Cash Counter collects (never approves), the Manager
   approves, sees dues and the payment history. The Admin panel keeps no cash
   entry at all — its way to look at money is the Report Center. */
const { test, expect } = require('./fixtures.cjs');
const { enterPortal } = require('./portal-session.cjs');
const fs = require('node:fs/promises');

const VIEWS = [{ width: 320 }, { width: 390 }, { width: 1280 }];

/** Seed one ledger the way the app writes it: two approved, one pending. */
async function seedLedger(page) {
  await page.evaluate(async () => {
    const { financeRepository, stampTransaction, monthLabel, dateLabel } = await import('/js/finance-data.js');
    const { adminStudents } = await import('/js/admin-data.js');
    const people = adminStudents.filter(student => student.status === 'approved').slice(0, 3);
    const now = new Date();
    for (const [index, person] of people.entries()) {
      const tx = stampTransaction({
        id: `FIN-SPEC-${index}`, studentId: person.id, studentName: person.name,
        uniqueRoll: '261001001', className: person.className || '',
        feeType: 'মাসিক বেতন', month: monthLabel(now), amount: 1500,
        method: index === 1 ? 'বিকাশ (bKash)' : 'নগদ (Cash)', trxRef: '',
        collectedBy: 'পেমেন্ট কাউন্টার', counterUsername: 'payment.apc',
        status: index === 2 ? 'pending' : 'approved', reviewHistory: [], note: ''
      }, now);
      await financeRepository.saveTransaction(tx);
    }
    return dateLabel(now);
  });
}

for (const { width } of VIEWS) {
  test(`Manager runs the whole hisab and the Admin panel has no cash entry at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setViewportSize({ width, height: 844 });
    await page.clock.setFixedTime(new Date('2026-09-22T12:00:00Z'));

    await enterPortal(page, 'manager');
    await expect(page.locator('#managerShell')).toBeVisible();
    await seedLedger(page);
    await page.reload();
    await page.locator('.admin-bottom [data-manager-view=finance]').click();

    // Four KPIs over the one ledger: approved total, this month, dues, pending.
    await expect(page.locator('#mgrFinanceTotal')).toHaveText('৳৩,০০০');
    await expect(page.locator('#mgrFinanceMonth')).toHaveText('৳৩,০০০');
    await expect(page.locator('#mgrFinancePending')).toHaveText('১');
    await expect(page.locator('#mgrFinanceDue')).not.toBeEmpty();
    await expect(page.locator('#managerFinancePendingBadge')).toBeVisible();

    // Adequate segments: collection, approval, due, history.
    for (const segment of ['collection', 'approval', 'due', 'history']) {
      await page.locator(`[data-finance-segment=${segment}]`).click();
      await expect(page.locator(`[data-finance-panel=${segment}]`)).toBeVisible();
    }
    // The pending counter entry is what the Manager approves — never the other way.
    await expect(page.locator('#managerCashList')).toContainText('অনুমোদন বাকি');
    await page.locator('#managerCashList [data-manager-action=approve-payment]').first().click();
    await expect(page.locator('#mgrFinancePending')).toHaveText('০');
    // History reads the same records; the search never leaves this panel's data.
    await page.locator('[data-finance-segment=history]').click();
    await expect(page.locator('#managerPaymentList .manager-record')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // No collection form here — collecting is the counter's seat, approving is his.
    await expect(page.locator('#feeCollectionForm, #feeSaveButton, #paySaveButton, #payFeeAmount')).toHaveCount(0);

    expect(errors).toEqual([]);
  });
}

