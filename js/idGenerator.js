/* Immutable public IDs; the cloud adapter may implement allocateOrdinal with
 * an atomic server counter. .id on transactions remains the sync key. */
import { safeSetItem } from './storage-safety.js';
const DEVICE_KEY = 'activePlus.devicePrefix.v1';
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
export function createIdGenerator({ prefix = devicePrefix, allocateOrdinal = (scope, floor) => floor + 1 } = {}) {
  async function next(kind, records = []) {
    if (!['student', 'receipt'].includes(kind)) throw new Error('ID-এর ধরন সঠিক নয়');
    const root = prefix();
    const tag = kind === 'student' ? `S${root.slice(1)}` : root;
    const pattern = new RegExp(`^${tag}-(\\d{6,})$`);
    const field = kind === 'student' ? 'id' : 'receiptNo';
    const floor = records.reduce((max, row) => Math.max(max, Number(String(row?.[field] || '').match(pattern)?.[1] || 0)), 0);
    const sequence = await allocateOrdinal(`${kind}:${tag}`, floor);
    if (!Number.isSafeInteger(sequence) || sequence <= floor) throw new Error('ID ক্রমিক বরাদ্দ হয়নি।');
    return `${tag}-${String(sequence).padStart(6, '0')}`;
  }
  return { nextStudentId: records => next('student', records), nextReceiptNo: records => next('receipt', records) };
}
export const idGenerator = createIdGenerator();
