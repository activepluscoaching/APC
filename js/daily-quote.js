/* আজকের অনুপ্রেরণা — one short motivational quote on the student home page,
   rotated by the calendar day.

   The rules this file keeps:
     • deterministic rotation: the day number (Asia/Dhaka) picks the line, so a
       reload on the same day shows the same quote and tomorrow's quote differs;
     • offline-first: the card is filled synchronously from the built-in library
       (or from the cached feed fetched on an earlier day) and a same-origin feed
       is refreshed in the background. A missing network, a blocked request or
       broken JSON can never blank the card, block the page or raise an error —
       the built-in line stays;
     • additive storage: exactly one private key (activePlus.dailyQuote.v1) holds
       the cached feed and the pick for the day. No existing record is read,
       changed, reset or wiped — the module only ever writes its own key;
     • no user action: there is no button, no spinner, no acknowledgement;
       the quote simply is today's quote.
*/
import { iconMarkup } from './icons.js';

export const DAILY_QUOTE_KEY = 'activePlus.dailyQuote.v1';
export const QUOTE_FEED_URL = 'assets/daily-quotes.json';
export const QUOTE_TIME_ZONE = 'Asia/Dhaka';
export const QUOTE_FETCH_TIMEOUT = 4000;
export const QUOTE_VERSION = 1;
const MAX_TEXT = 200;
const MAX_AUTHOR = 80;
const MAX_FEED_QUOTES = 240;

/* Short on purpose: the card is one compact row on a small phone. */
export const BUILT_IN_QUOTES = Object.freeze([
  { id: 'Q-001', text: 'স্বপ্ন সেটা নয় যা তুমি ঘুমিয়ে দেখো, স্বপ্ন সেটা যা তোমাকে ঘুমাতে দেয় না।', author: 'ড. এ পি জে আব্দুল কালাম' },
  { id: 'Q-002', text: 'স্বপ্ন না দেখলে স্বপ্ন সত্যি হয় না।', author: 'ড. এ পি জে আব্দুল কালাম' },
  { id: 'Q-003', text: 'শিক্ষা হলো পৃথিবী বদলে দেওয়ার সবচেয়ে শক্তিশালী অস্ত্র।', author: 'নেলসন ম্যান্ডেলা' },
  { id: 'Q-004', text: 'যতক্ষণ না করা হচ্ছে, ততক্ষণ সবই অসম্ভব মনে হয়।', author: 'নেলসন ম্যান্ডেলা' },
  { id: 'Q-005', text: 'শিক্ষা হলো মানুষের ভেতরে লুকিয়ে থাকা পূর্ণতার প্রকাশ।', author: 'স্বামী বিবেকানন্দ' },
  { id: 'Q-006', text: 'নিজের ওপর বিশ্বাস রাখো — বিশ্বাসই শক্তি।', author: 'স্বামী বিবেকানন্দ' },
  { id: 'Q-007', text: 'কল্পনা জ্ঞানের চেয়েও বড়।', author: 'অ্যালবার্ট আইনস্টাইন' },
  { id: 'Q-008', text: 'নিজেই নিজের প্রদীপ হও।', author: 'গৌতম বুদ্ধ' },
  { id: 'Q-009', text: 'একজন শিক্ষক, একটি বই, একটি কলমই পারে পৃথিবী বদলে দিতে।', author: 'মালালা ইউসুফজাই' },
  { id: 'Q-010', text: 'আজকের ছোট পরিশ্রমই কালকের বড় সাফল্য।', author: '' },
  { id: 'Q-011', text: 'প্রতিদিন একটু একটু করে শেখা একদিন বড় পরিবর্তন আনে।', author: '' },
  { id: 'Q-012', text: 'হাল ছাড়ো না — কঠিন রাস্তাই সুন্দর গন্তব্যে নিয়ে যায়।', author: '' },
  { id: 'Q-013', text: 'তোমার চেষ্টা বৃথা যায় না; প্রতিটি পড়া তোমাকে এগিয়ে নেয়।', author: '' },
  { id: 'Q-014', text: 'প্রশ্ন করতে ভয় পেয়ো না — শেখা শুরু হয় সেখান থেকেই।', author: '' },
  { id: 'Q-015', text: 'লক্ষ্য ছোট হোক বা বড়, আজই প্রথম ধাপটা নাও।', author: '' },
  { id: 'Q-016', text: 'ভুল করা মানে শেখা — ভুল থেকে শুধরে নাও, থেমে যেয়ো না।', author: '' },
  { id: 'Q-017', text: 'নিজের গতিেই এগিয়ে যাও, অন্যের সঙ্গে তুলনা নয়।', author: '' },
  { id: 'Q-018', text: 'আজকের পড়াটাই কালকের আত্মবিশ্বাস।', author: '' },
  { id: 'Q-019', text: 'পরিশ্রম তোমার হাতে, ফলাফল সময়ের হাতে।', author: '' },
  { id: 'Q-020', text: 'জ্ঞান কখনো বোঝা নয়, জ্ঞান আলো।', author: '' },
  { id: 'Q-021', text: 'নিজের স্বপ্নকে ছোট করে দেখো না।', author: '' },
  { id: 'Q-022', text: 'মনোযোগ দিলে কঠিন বিষয়ও সহজ লাগে।', author: '' },
  { id: 'Q-023', text: 'আজ যা শিখছ, কাল সেটাই তোমার শক্তি।', author: '' },
  { id: 'Q-024', text: 'সাফল্য একদিনে আসে না, প্রতিদিনের অভ্যাসে আসে।', author: '' },
  { id: 'Q-025', text: 'সময় নষ্ট করো না — প্রতিটি মুহূর্তে শেখার কিছু আছে।', author: '' },
  { id: 'Q-026', text: 'কষ্ট হলেও চেষ্টা চালিয়ে যাও; থামলে পৌঁছাবে না।', author: '' },
  { id: 'Q-027', text: 'বর্তমান পরিশ্রমই তোমার ভবিষ্যতের পরিচয়।', author: '' },
  { id: 'Q-028', text: 'একাগ্রতাই তোমার সবচেয়ে বড় হাতিয়ার।', author: '' },
  { id: 'Q-029', text: 'সাহস মানে ভয় না থাকা নয়, ভয় সত্ত্বেও এগিয়ে যাওয়া।', author: '' },
  { id: 'Q-030', text: 'তোমার শ্রম তোমারই অর্জন — কেউ কেড়ে নিতে পারবে না।', author: '' }
]);

const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** `YYYY-MM-DD` for the day the quote belongs to (Asia/Dhaka). */
export function quoteDateKey(now = Date.now()) {
  const at = new Date(now);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: QUOTE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(at);
    const get = type => parts.find(part => part.type === type)?.value || '';
    const key = `${get('year')}-${get('month')}-${get('day')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  } catch { /* an engine without time zones falls back to the local day */ }
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

/** Whole days since the epoch — the deterministic rotation counter. */
export function quoteDayNumber(dateKey = quoteDateKey()) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return 0;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

/** Keeps only honest quotes: text required, duplicates and blanks dropped. */
export function normalizeQuotes(list, { max = MAX_FEED_QUOTES } = {}) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const quotes = [];
  for (const entry of list) {
    if (quotes.length >= max) break;
    const text = clean(entry?.text, MAX_TEXT);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    quotes.push({
      id: clean(entry?.id, 40) || `Q-${String(quotes.length + 1).padStart(3, '0')}`,
      text,
      author: clean(entry?.author, MAX_AUTHOR)
    });
  }
  return quotes;
}

/** The day's line: `dayNumber % length`, so tomorrow's index always moves on. */
export function pickQuote(quotes, dayNumber) {
  const list = Array.isArray(quotes) ? quotes : [];
  if (!list.length) return null;
  const day = Number.isFinite(dayNumber) ? Math.trunc(dayNumber) : 0;
  return list[((day % list.length) + list.length) % list.length];
}

/** The one private cache record, validated; anything unexpected reads as empty. */
export function readQuoteCache() {
  try {
    const raw = window.localStorage.getItem(DAILY_QUOTE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (!record || record.version !== QUOTE_VERSION) return null;
    return {
      version: QUOTE_VERSION,
      dateKey: typeof record.dateKey === 'string' ? record.dateKey : '',
      quote: record.quote?.text ? normalizeQuotes([record.quote])[0] || null : null,
      quotes: normalizeQuotes(record.quotes),
      fetchedAt: Number.isFinite(record.fetchedAt) ? record.fetchedAt : 0,
      updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : 0
    };
  } catch { return null; }
}

export function saveQuoteCache(record = {}) {
  const payload = {
    version: QUOTE_VERSION,
    dateKey: String(record.dateKey || ''),
    quote: record.quote?.text ? { id: clean(record.quote.id, 40), text: clean(record.quote.text, MAX_TEXT), author: clean(record.quote.author, MAX_AUTHOR) } : null,
    quotes: normalizeQuotes(record.quotes),
    fetchedAt: Number.isFinite(record.fetchedAt) ? record.fetchedAt : 0,
    updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : Date.now()
  };
  try {
    window.localStorage.setItem(DAILY_QUOTE_KEY, JSON.stringify(payload));
    return payload;
  } catch { return null; } // private mode / full quota: the card still shows a quote
}

/** Reads a feed payload (`{quotes:[…]}` or a bare array) into honest quotes. */
export function parseQuoteFeed(payload) {
  const list = Array.isArray(payload) ? payload : payload?.quotes;
  const quotes = normalizeQuotes(list);
  return quotes.length ? quotes : null;
}

/**
 * Fetch the quote feed. Never throws and never hangs the caller: a missing
 * network, an abort, a non-200 answer or broken JSON all answer `null`.
 */
export async function loadQuoteFeed({ fetchImpl, url = QUOTE_FEED_URL, timeout = QUOTE_FETCH_TIMEOUT } = {}) {
  const request = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (typeof request !== 'function') return null;
  let timer = 0;
  try {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    if (controller) timer = setTimeout(() => { try { controller.abort(); } catch { /* already settled */ } }, timeout);
    const response = await request(url, {
      cache: 'no-store', credentials: 'same-origin', ...(controller ? { signal: controller.signal } : {})
    });
    if (!response || response.ok !== true) return null;
    return parseQuoteFeed(await response.json());
  } catch { return null; } finally { if (timer) clearTimeout(timer); }
}

/**
 * Mounts today's quote into an existing card element.
 * @param {object} options { mount, now, fetchImpl, feedUrl, autoFetch }
 * @returns {{ paint: Function, stop: Function }}
 */
export function initDailyQuote({ mount = '#dailyQuoteCard', now = () => Date.now(), fetchImpl, feedUrl = QUOTE_FEED_URL, autoFetch = true } = {}) {
  const root = typeof mount === 'string' ? document.querySelector(mount) : mount;
  if (!root) return { paint: () => {}, stop: () => {} };
  let stopped = false;
  let feedTried = false;

  const library = () => {
    const cached = readQuoteCache()?.quotes || [];
    return cached.length ? cached : BUILT_IN_QUOTES;
  };

  function render(quote, { dateKey, source }) {
    const text = root.querySelector('[data-daily-quote-text]');
    if (!text || !quote?.text) return;
    const author = root.querySelector('[data-daily-quote-author]');
    const icon = root.querySelector('[data-daily-quote-icon]');
    if (icon && !icon.childElementCount) {
      try { icon.innerHTML = iconMarkup('award'); } catch { /* artwork is optional */ }
    }
    text.textContent = quote.text;
    if (author) {
      author.textContent = quote.author ? `— ${quote.author}` : '';
      author.hidden = !quote.author;
    }
    root.dataset.quoteDate = dateKey;
    root.dataset.quoteSource = source;
    root.dataset.quoteId = quote.id || '';
    root.hidden = false;
  }

  /* Today's line: the pick already stored for this date, else the deterministic
     pick from the library. Synchronous — the card never waits for the network. */
  function paint() {
    if (stopped) return;
    try {
      const dateKey = quoteDateKey(now());
      const cached = readQuoteCache();
      if (cached && cached.dateKey === dateKey && cached.quote) {
        render(cached.quote, { dateKey, source: cached.quotes.length ? 'cached-feed' : 'cached' });
        return;
      }
      const fromFeed = cached?.quotes.length ? 'cached-feed' : 'library';
      const quote = pickQuote(library(), quoteDayNumber(dateKey)) || BUILT_IN_QUOTES[0];
      saveQuoteCache({ ...(cached || {}), dateKey, quote, fetchedAt: cached?.fetchedAt || 0 });
      render(quote, { dateKey, source: fromFeed });
    } catch { /* a broken storage or clock must not take the home page down */ }
  }

  /* Background refresh of the feed: once per session is enough, and its failure
     is silent — the day's quote is already on screen. */
  async function refreshFeed() {
    if (!autoFetch || stopped || feedTried) return;
    feedTried = true;
    const cached = readQuoteCache();
    const dateKey = quoteDateKey(now());
    if (cached?.fetchedAt && quoteDateKey(cached.fetchedAt) === dateKey) return;
    const quotes = await loadQuoteFeed({ fetchImpl, url: feedUrl });
    if (stopped || !quotes) return;
    try {
      const current = readQuoteCache();
      const merged = normalizeQuotes([...(current?.quotes || []), ...quotes]);
      saveQuoteCache({ ...(current || {}), quotes: merged, fetchedAt: now() });
      /* A pick already shown today is never swapped under the reader; the wider
         feed becomes the source from the next day on. */
      if (!current || current.dateKey !== dateKey || !current.quote) paint();
    } catch { /* storage refused the cache: keep the quote that is showing */ }
  }

  const onVisible = () => { if (document.visibilityState !== 'hidden') paint(); };
  const onStorage = event => { if (!event?.key || event.key === DAILY_QUOTE_KEY) paint(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('storage', onStorage);
  window.addEventListener('pageshow', paint);

  paint();
  void refreshFeed();

  return {
    paint,
    stop() {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', paint);
    }
  };
}
