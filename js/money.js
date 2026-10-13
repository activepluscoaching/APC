/* All persisted amounts are whole BDT, never binary floating-point arithmetic.
 * Legacy fractional entries are rounded once (half-up for nonnegative taka);
 * invalid/unsafe values are rejected rather than silently turned into zero. */
export function taka(value) {
  const text = typeof value === 'string' ? value.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)).trim() : value;
  if (text === '' || text == null) throw new RangeError('টাকার অঙ্ক সঠিক নয়।');
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || n > Number.MAX_SAFE_INTEGER - 1) throw new RangeError('টাকার অঙ্ক সঠিক নয়।');
  return Math.round(n);
}
export function addTaka(a, b) {
  const sum = taka(a) + taka(b);
  if (!Number.isSafeInteger(sum)) throw new RangeError('টাকার যোগফল সীমা ছাড়িয়েছে।');
  return sum;
}
export function migrateAmounts(rows, field = 'amount') {
  let changed = false;
  const migrated = rows.map(row => {
    const value = taka(row[field]);
    if (row[field] === value) return row;
    changed = true;
    return { ...row, [field]: value };
  });
  return { rows: migrated, changed };
}
