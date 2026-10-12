/* Merge two Admin "Backup & Restore" files (kind: active-plus-backup) without
   a server. Per-ID union with a deterministic newer-wins rule; the report makes
   every decision visible. Backups cannot express deletions, so this tool never
   guesses that a missing record was deleted. */
const COLLECTIONS = {
  'activePlus.admin.students.v1': 'শিক্ষার্থী',
  'activePlus.admin.transactions.v1': 'লেনদেন',
  'activePlus.admin.notices.v1': 'নোটিশ',
  'activePlus.admin.routine.v1': 'ক্লাস রুটিন',
  'activePlus.teaching.v1': 'একাডেমিক কার্যক্রম',
  'activePlus.exams.v1': 'পরীক্ষা',
  'active-plus-app-config-v1': 'অ্যাপ সেটিংস'
};
const itemTime = item => {
  if (!item || typeof item !== 'object') return 0;
  for (const field of ['updatedAt', 'recordedAt', 'createdAt', 'at', 'date', 'time']) {
    const value = item[field];
    const parsed = typeof value === 'number' ? value : Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
};
const copy = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function parseBackup(payload, label) {
  if (payload?.kind !== 'active-plus-backup' || !payload.data || typeof payload.data !== 'object') {
    throw new Error(`${label}: এটি Active Plus ব্যাকআপ ফাইল নয়।`);
  }
  const data = {};
  for (const [key, raw] of Object.entries(payload.data)) {
    try { data[key] = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { data[key] = undefined; }
  }
  return { createdAt: Date.parse(payload.createdAt) || 0, data, raw: payload.data };
}

function mergeList(name, older, newer, report) {
  const byId = new Map();
  for (const item of older) if (item?.id) byId.set(item.id, { value: item, side: 'only-older' });
  for (const item of newer) {
    if (!item?.id) continue;
    const existing = byId.get(item.id);
    if (!existing) { byId.set(item.id, { value: item, side: 'only-newer' }); continue; }
    if (same(existing.value, item)) { existing.side = 'same'; continue; }
    const keepNewer = itemTime(item) >= itemTime(existing.value);
    report.conflicts.push(`${name}: ${item.id} — দুই ডিভাইসে ভিন্ন; ${keepNewer ? 'নতুন' : 'পুরোনো'} ব্যাকআপের সংস্করণ রাখা হয়েছে`);
    byId.set(item.id, { value: keepNewer ? item : existing.value, side: 'conflict' });
  }
  for (const entry of byId.values()) report.counts[entry.side] = (report.counts[entry.side] || 0) + 1;
  return [...byId.values()].map(entry => entry.value);
}

function mergeDocument(key, older, newer, report) {
  const name = COLLECTIONS[key] || key;
  if (key === 'activePlus.admin.routine.v1') {
    const merged = { ...copy(older || {}) };
    for (const [day, info] of Object.entries(newer || {})) {
      const base = merged[day] || { date: '', classes: [] };
      merged[day] = {
        date: info.date || base.date || '',
        classes: mergeList(`${name} (${day})`, base.classes || [], info.classes || [], report)
      };
    }
    return merged;
  }
  if (Array.isArray(older) || Array.isArray(newer)) {
    return mergeList(name, Array.isArray(older) ? older : [], Array.isArray(newer) ? newer : [], report);
  }
  if (key === 'activePlus.teaching.v1') {
    const activities = mergeList(`${name} (কার্যক্রম)`, older?.activities || [], newer?.activities || [], report);
    return { version: 1, activities };
  }
  if (key === 'activePlus.exams.v1') {
    return {
      version: 1,
      exams: mergeList(`${name} (প্রশ্নপত্র)`, older?.exams || [], newer?.exams || [], report),
      attempts: mergeList(`${name} (উত্তর)`, older?.attempts || [], newer?.attempts || [], report)
    };
  }
  return itemTime(newer) >= itemTime(older) && newer !== undefined ? copy(newer) : copy(older);
}

export function mergeBackups(first, second) {
  const one = parseBackup(first, 'প্রথম ফাইল');
  const two = parseBackup(second, 'দ্বিতীয় ফাইল');
  const [older, newer] = one.createdAt <= two.createdAt ? [one, two] : [two, one];
  const report = { counts: {}, conflicts: [], lines: [] };
  const data = {};
  for (const key of Object.keys(COLLECTIONS)) {
    const inOlder = Object.hasOwn(older.data, key) && older.data[key] !== undefined;
    const inNewer = Object.hasOwn(newer.data, key) && newer.data[key] !== undefined;
    if (!inOlder && !inNewer) continue;
    const merged = !inOlder ? newer.data[key] : !inNewer ? older.data[key] : mergeDocument(key, older.data[key], newer.data[key], report);
    data[key] = typeof merged === 'string' ? merged : JSON.stringify(merged);
    const size = Array.isArray(merged) ? merged.length : merged?.activities?.length ?? merged?.exams?.length ?? Object.keys(merged || {}).length;
    report.lines.push(`${COLLECTIONS[key]}: ${size} রেকর্ড`);
  }
  const merged = {
    kind: 'active-plus-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    mergedFrom: [first.createdAt, second.createdAt].filter(Boolean),
    data
  };
  return { merged, report };
}
