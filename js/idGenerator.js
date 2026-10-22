/* Immutable public IDs:
   • Student Registration ID: 9-digit numeric YYMMDDSSS in Asia/Dhaka server time,
     backed by an atomic daily counter (001–999, explicit error above 999).
   • Cash Counter Receipt No: C<8-hex-devicePrefix>-<6-digit-seq> (.id on
     transactions remains the sync key). */
import { safeSetItem } from './storage-safety.js';
import { dhakaParts, nowEpoch } from './time.js';

const DEVICE_KEY = 'activePlus.devicePrefix.v1';
export const DAILY_STUDENT_COUNTER_KEY = 'activePlus.dailyStudentCounters.v1';
export const STUDENT_ID_REGEX = /^\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}$/;
export const MAX_DAILY_STUDENTS = 999;
export const DAILY_LIMIT_ERROR = 'আজকের সর্বোচ্চ ৯৯৯টি রেজিস্ট্রেশন সীমা পূর্ণ হয়েছে। আগামীকাল আবার চেষ্টা করুন।';

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Convert Bangla numerals (০–৯) to ASCII numerals (0–9). */
export function toAsciiDigits(value) {
  return String(value ?? '').replace(/[০-৯]/g, ch => String(BANGLA_DIGITS.indexOf(ch)));
}

/** Convert ASCII numerals (0–9) to Bangla numerals (০–৯) for optional display. */
export function toBanglaDigits(value) {
  return String(value ?? '').replace(/\d/g, ch => BANGLA_DIGITS[Number(ch)]);
}

/** Normalize user-typed Student ID input (trim + Bangla digits -> ASCII digits). */
export function normalizeStudentIdInput(value) {
  return toAsciiDigits(String(value ?? '').trim()).replace(/\s+/g, '');
}

/**
 * Validate a 9-digit YYMMDDSSS Student ID (strictly ASCII 0-9 unless
 * allowBanglaDigits is explicitly true), including calendar date & 001–999 serial.
 */
export function isValidStudentId(value, { allowBanglaDigits = false } = {}) {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const raw = String(value).trim();
  const normalized = allowBanglaDigits ? toAsciiDigits(raw) : raw;
  if (!/^[0-9]{9}$/.test(normalized)) return false;
  if (!STUDENT_ID_REGEX.test(normalized)) return false;
  const yy = Number(normalized.slice(0, 2));
  const mm = Number(normalized.slice(2, 4));
  const dd = Number(normalized.slice(4, 6));
  const serial = Number(normalized.slice(6, 9));
  if (!Number.isInteger(serial) || serial < 1 || serial > MAX_DAILY_STUDENTS) return false;
  const fullYear = 2000 + yy;
  const probe = new Date(Date.UTC(fullYear, mm - 1, dd));
  return (
    probe.getUTCFullYear() === fullYear &&
    probe.getUTCMonth() + 1 === mm &&
    probe.getUTCDate() === dd
  );
}

/** Compute YYMMDD in Asia/Dhaka timezone from an authoritative epoch timestamp. */
export function dhakaYYMMDD(epochMs = nowEpoch()) {
  const ts = epochMs instanceof Date ? epochMs.getTime() : Number(epochMs);
  if (!Number.isFinite(ts)) throw new Error('সার্ভারের সময় নির্ধারণ করা যায়নি।');
  const parts = dhakaParts(new Date(ts));
  const yy = String(parts.year).slice(-2).padStart(2, '0');
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/** Format YYMMDD + serial (1..999) as an ASCII 9-digit Student ID. */
export function formatStudentId(datePrefix, serial) {
  const prefix = toAsciiDigits(String(datePrefix ?? '').trim());
  if (!/^\d{6}$/.test(prefix)) throw new Error('তারিখের ফরম্যাট সঠিক নয়।');
  const seq = Number(serial);
  if (!Number.isSafeInteger(seq) || seq < 1) throw new Error('ID ক্রমিক বরাদ্দ হয়নি।');
  if (seq > MAX_DAILY_STUDENTS) throw new Error(DAILY_LIMIT_ERROR);
  const candidate = `${prefix}${String(seq).padStart(3, '0')}`;
  if (!isValidStudentId(candidate)) throw new Error('তৈরি হওয়া Student ID বৈধ নয়।');
  return candidate;
}

/** Highest existing 3-digit serial already issued for `datePrefix` among known rows. */
export function maxExistingDailySerial(datePrefix, records = []) {
  const prefix = toAsciiDigits(String(datePrefix ?? '').trim());
  if (!/^\d{6}$/.test(prefix) || !Array.isArray(records)) return 0;
  let max = 0;
  for (const row of records) {
    const rawId = typeof row === 'string' ? row : row?.id ?? row?.studentId ?? '';
    const id = toAsciiDigits(String(rawId || '').trim());
    if (id.length === 9 && id.startsWith(prefix) && isValidStudentId(id)) {
      const seq = Number(id.slice(6, 9));
      if (seq > max) max = seq;
    }
  }
  return max;
}

export function devicePrefix(storage = globalThis.window?.localStorage || globalThis.localStorage) {
  let prefix = storage?.getItem(DEVICE_KEY);
  if (prefix && /^C[0-9A-F]{8}$/.test(prefix)) return prefix;
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  prefix = `C${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  if (!storage) throw new Error('ডিভাইস ID সংরক্ষণের জায়গা নেই।');
  safeSetItem(storage, DEVICE_KEY, prefix);
  return prefix;
}

function readCounterMap(store, fallbackMap) {
  if (!store) return { ...Object.fromEntries(fallbackMap.entries()) };
  try {
    const raw = store.getItem(DAILY_STUDENT_COUNTER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...parsed } : {};
  } catch {
    return {};
  }
}

function writeCounterMap(store, fallbackMap, nextMap) {
  if (!store) {
    fallbackMap.clear();
    for (const [k, v] of Object.entries(nextMap)) fallbackMap.set(k, v);
    return;
  }
  safeSetItem(store, DAILY_STUDENT_COUNTER_KEY, JSON.stringify(nextMap));
}

export function createIdGenerator({
  prefix = devicePrefix,
  allocateOrdinal = (scope, floor) => floor + 1,
  nowMs = () => nowEpoch(),
  now = null,
  storage = null,
  store = null,
  allocateDailyStudentSerial = null
} = {}) {
  const clockFn = typeof now === 'function' ? now : nowMs;
  const configuredStore = store || storage || null;
  const memoryCounters = new Map();
  let studentQueue = Promise.resolve();

  function withStudentLock(work) {
    const run = studentQueue.then(work, work);
    studentQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  async function defaultAllocateDailySerial(datePrefix, floor) {
    const activeStore = configuredStore || globalThis.window?.localStorage || globalThis.localStorage || null;
    const counters = readCounterMap(activeStore, memoryCounters);
    const current = Math.max(Number(counters[datePrefix]) || 0, Number(floor) || 0);
    const nextSeq = current + 1;
    if (nextSeq > MAX_DAILY_STUDENTS) {
      const err = new Error(DAILY_LIMIT_ERROR);
      err.code = 'DAILY_STUDENT_ID_LIMIT';
      throw err;
    }
    counters[datePrefix] = nextSeq;
    writeCounterMap(activeStore, memoryCounters, counters);
    return nextSeq;
  }

  async function nextStudent(records = [], options = {}) {
    return withStudentLock(async () => {
      const epoch = options?.nowMs !== undefined ? Number(options.nowMs) : Number(await clockFn());
      const datePrefix = options?.datePrefix ? String(options.datePrefix) : dhakaYYMMDD(epoch);
      const floor = maxExistingDailySerial(datePrefix, records);
      const allocator = options?.allocateDailyStudentSerial || allocateDailyStudentSerial || defaultAllocateDailySerial;
      const sequence = await allocator(datePrefix, floor);
      return formatStudentId(datePrefix, sequence);
    });
  }

  async function nextReceipt(records = []) {
    const root = prefix();
    const pattern = new RegExp(`^${root}-(\\d{6,})$`);
    const floor = records.reduce((max, row) => Math.max(max, Number(String(row?.receiptNo || '').match(pattern)?.[1] || 0)), 0);
    const sequence = await allocateOrdinal(`receipt:${root}`, floor);
    if (!Number.isSafeInteger(sequence) || sequence <= floor) throw new Error('ID ক্রমিক বরাদ্দ হয়নি।');
    return `${root}-${String(sequence).padStart(6, '0')}`;
  }

  async function next(kind, records = [], options = {}) {
    if (kind === 'student') return nextStudent(records, options);
    if (kind === 'receipt') return nextReceipt(records);
    throw new Error('ID-এর ধরন সঠিক নয়');
  }

  return {
    nextStudentId: (records = [], options = {}) => next('student', records, options),
    nextReceiptNo: (records = []) => next('receipt', records)
  };
}

export const idGenerator = createIdGenerator();
