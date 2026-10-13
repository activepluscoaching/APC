/* Client-time adapter: swap the provider with a trusted server clock when the
 * backend owns deadlines. Local clock is NOT a secure anti-cheat authority. */
export const TIME_ZONE = 'Asia/Dhaka';
let provider = () => Date.now();
let lastWall = null;
let lastElapsed = null;
const SESSION_CLOCK_KEY = 'activePlus.lastSeenClock.v1';
export function setTimeProvider(next) {
  if (typeof next !== 'function') throw new TypeError('সময় উৎস প্রয়োজন');
  provider = next; lastWall = null; lastElapsed = null;
  try { globalThis.sessionStorage?.removeItem(SESSION_CLOCK_KEY); } catch { /* blocked storage */ }
}
export function nowEpoch() {
  const wall = Number(provider());
  if (!Number.isFinite(wall)) throw new Error('সময় উৎস অকার্যকর');
  const elapsed = typeof performance !== 'undefined' ? performance.now() : 0;
  let lastSession = null;
  try { lastSession = Number(globalThis.sessionStorage?.getItem(SESSION_CLOCK_KEY)) || null; } catch { /* blocked storage */ }
  // A backward jump larger than 2 seconds relative to monotonic elapsed.
  if ((lastWall !== null && wall + 2000 < lastWall + Math.max(0, elapsed - lastElapsed)) || (lastSession !== null && wall + 2000 < lastSession)) {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.dispatchEvent(new CustomEvent('apc-clock-warning', { detail: { message: 'ডিভাইসের ঘড়ি পিছিয়েছে। পরীক্ষার সময়সীমা নিশ্চিত করতে সময় ঠিক করুন।' } }));
      let banner = document.getElementById('apcClockWarning');
      if (!banner) { banner = document.createElement('p'); banner.id = 'apcClockWarning'; banner.setAttribute('role', 'alert'); document.body?.prepend(banner); }
      banner.textContent = 'ডিভাইসের ঘড়ি পিছিয়েছে। সময় ঠিক করুন; অফলাইনে পরীক্ষার সময় নিশ্চিত করা যায় না।';
    }
  }
  lastWall = wall; lastElapsed = elapsed;
  try { globalThis.sessionStorage?.setItem(SESSION_CLOCK_KEY, String(Math.max(wall, lastSession || 0))); } catch { /* quota/disabled: warning remains best effort */ }
  return wall;
}
const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export function dhakaParts(value = nowEpoch()) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(value)).map(item => [item.type, item.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}
export const dhakaKey = value => { const { year, month, day } = dhakaParts(value); return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; };
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function dhakaDateTimeInput(epoch) {
  const p = Object.fromEntries(dateTimeFormat.formatToParts(new Date(epoch)).map(item => [item.type, item.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function parseDhakaDateTime(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error('ঢাকা তারিখ/সময় সঠিক নয়।');
  const [, y, mo, d, h, mi] = match.map(Number);
  const epoch = Date.UTC(y, mo - 1, d, h, mi) - 6 * 3600000;
  if (dhakaDateTimeInput(epoch) !== value) throw new Error('ঢাকা তারিখ/সময় সঠিক নয়।');
  return epoch;
}
