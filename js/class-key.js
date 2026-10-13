const ALL_CLASS_TOKENS = new Set([
  '', 'all', 'সকল শ্রেণি', 'সব শ্রেণি', 'সকল', 'সব', 'সব ক্লাস', 'সকল ক্লাস', '—', '-'
]);

const ALL_SECTION_TOKENS = new Set([
  '', 'all', 'সকল', 'সব', 'সকল বিভাগ', 'সব বিভাগ', 'সকল শাখা', 'সব শাখা', 'উভয়', '—', '-'
]);

const CLASS_ALIASES = Object.freeze({
  'class-8': 'অষ্টম শ্রেণি',
  '8': 'অষ্টম শ্রেণি',
  '০৮': 'অষ্টম শ্রেণি',
  '08': 'অষ্টম শ্রেণি',
  'ssc-9': 'নবম শ্রেণি',
  'class-9': 'নবম শ্রেণি',
  '9': 'নবম শ্রেণি',
  '০৯': 'নবম শ্রেণি',
  '09': 'নবম শ্রেণি',
  'ssc-10': 'দশম শ্রেণি',
  'class-10': 'দশম শ্রেণি',
  '10': 'দশম শ্রেণি',
  '১০': 'দশম শ্রেণি',
  'hsc-1': 'একাদশ শ্রেণি',
  'class-11': 'একাদশ শ্রেণি',
  '11': 'একাদশ শ্রেণি',
  '১১': 'একাদশ শ্রেণি',
  'hsc-2': 'দ্বাদশ শ্রেণি',
  'class-12': 'দ্বাদশ শ্রেণি',
  '12': 'দ্বাদশ শ্রেণি',
  '১২': 'দ্বাদশ শ্রেণি'
});

const SECTION_ALIASES = Object.freeze({
  science: 'বিজ্ঞান',
  sci: 'বিজ্ঞান',
  humanities: 'মানবিক',
  arts: 'মানবিক',
  commerce: 'ব্যবসায় শিক্ষা',
  business: 'ব্যবসায় শিক্ষা',
  'business studies': 'ব্যবসায় শিক্ষা',
  'ব্যবসায় শিক্ষা': 'ব্যবসায় শিক্ষা'
});

function cleanText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/\u09af\u09bc/g, '\u09df')
    .replace(/\s+/g, ' ')
    .trim();
}

function rawClassValue(input) {
  if (input && typeof input === 'object') {
    return input.classId ?? input.className ?? input.class ?? input.targetClass ?? '';
  }
  return input ?? '';
}

function rawSectionValue(input) {
  if (input && typeof input === 'object') {
    return input.sectionId ?? input.group ?? input.section ?? input.batch ?? input.targetGroup ?? input.targetSection ?? '';
  }
  return input ?? '';
}

export function normalizeClassId(input) {
  let raw = cleanText(rawClassValue(input));
  if (!raw) return '';
  if (ALL_CLASS_TOKENS.has(raw.toLowerCase())) return '';
  if (/^CLASS-/i.test(raw)) {
    raw = cleanText(raw.replace(/^CLASS-/i, '').replace(/-+/g, ' '));
  }
  const alias = CLASS_ALIASES[raw.toLowerCase()];
  return alias || raw;
}

export function normalizeSectionId(input) {
  let raw = cleanText(rawSectionValue(input));
  if (!raw) return '';
  if (ALL_SECTION_TOKENS.has(raw.toLowerCase())) return '';
  raw = cleanText(raw.replace(/\s*(?:বিভাগ|শাখা|গ্রুপ|group|section)$/i, ''));
  if (!raw || ALL_SECTION_TOKENS.has(raw.toLowerCase())) return '';
  const alias = SECTION_ALIASES[raw.toLowerCase()];
  return alias || raw;
}

export function classKeyOf(record = {}) {
  return {
    classId: normalizeClassId(record),
    sectionId: normalizeSectionId(record)
  };
}

export function withClassKey(record = {}) {
  if (!record || typeof record !== 'object') return record;
  const { classId, sectionId } = classKeyOf(record);
  const next = { ...record, classId, sectionId };
  if (next.className === undefined && classId) next.className = classId;
  if (next.group === undefined && sectionId) next.group = sectionId;
  return next;
}

export function matchesClassSection(
  item,
  viewer,
  { requireViewerClass = true, allowGlobalItem = true } = {}
) {
  if (!item) return false;
  const itemKey = classKeyOf(item);
  const viewerKey = classKeyOf(viewer || {});

  if (!viewerKey.classId) {
    if (requireViewerClass) return false;
    return !itemKey.classId && !itemKey.sectionId;
  }

  if (!itemKey.classId) {
    if (!allowGlobalItem) return false;
  } else if (itemKey.classId !== viewerKey.classId) {
    return false;
  }

  if (!itemKey.sectionId) return true;
  return itemKey.sectionId === viewerKey.sectionId;
}
