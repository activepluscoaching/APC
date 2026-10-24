/* Login User ID rules — one shared generator for every account this app makes.

   The rule (final):
     First Name + Role + APC   →   "firstname.role.apc"

     • lowercase, no spaces, no special characters
     • first name only (honorific prefixes are skipped)
     • the role part follows the role: admin · manager · teacher · cash
     • always ends with ".apc"

   Duplicates — the number is added to the FIRST NAME, never to the role or to
   the ".apc" suffix:

     rasal.teacher.apc  →  rasal2.teacher.apc  →  rasal3.teacher.apc   ✅
     rasal.teacher2.apc / rasal.teacher.apc2 / rasal.teacher.2apc      ❌

   Two different identifiers are never mixed:
     • Login User ID  — "rasal.teacher.apc", what a person types to sign in
     • Staff ID       — "STF-0001", the permanent internal id kept on every
                        historical record (js/staff-directory.js)
     • Student ID     — untouched; this module is never used for students.

   Pure module: no storage, no DOM, no role or permission change.
*/

/** The role part of a Login User ID. */
export const ROLE_SLUGS = Object.freeze({
  admin: 'admin',
  manager: 'manager',
  teacher: 'teacher',
  'cash-counter': 'cash',
  payment: 'cash',
  other: 'staff'
});

export const LOGIN_ID_SUFFIX = '.apc';
export const LOGIN_ID_FALLBACK = 'user';

/** Longest id the existing username rule accepts: /^[a-z][a-z0-9._]{3,19}$/ */
export const LOGIN_ID_MAX_LENGTH = 20;

export const LOGIN_ID_PATTERN = /^[a-z][a-z0-9._]{3,19}$/;

/* Honorifics that must never become the first name: "Md. Hasan Ali" → hasan. */
const NAME_PREFIXES = Object.freeze(new Set([
  'md', 'md.', 'mst', 'mst.', 'mohd', 'mohammad', 'muhammad', 'mohammed', 'muhammed',
  'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'dr', 'dr.', 'prof', 'prof.',
  'hajji', 'haji', 'alhajj', 'sheikh', 'sk', 'moh', 'most', 'mos', 'mohammod'
]));

/* Bengali → Latin so a name written in Bengali still produces a usable id
   ("রাসেল" → "rasel"). Approximate on purpose: the id only has to be stable,
   readable and unique — it is not a formal transliteration. */
const BENGALI_MAP = Object.freeze({
  'অ': 'a', 'আ': 'a', 'ই': 'i', 'ঈ': 'i', 'উ': 'u', 'ঊ': 'u', 'ঋ': 'ri', 'এ': 'e',
  'ঐ': 'oi', 'ও': 'o', 'ঔ': 'ou', 'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u',
  'ৃ': 'ri', 'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou', 'ক': 'k', 'খ': 'kh', 'গ': 'g',
  'ঘ': 'gh', 'ঙ': 'ng', 'চ': 'ch', 'ছ': 'chh', 'জ': 'j', 'ঝ': 'jh', 'ঞ': 'n',
  'ট': 't', 'ঠ': 'th', 'ড': 'd', 'ঢ': 'dh', 'ণ': 'n', 'ত': 't', 'থ': 'th', 'দ': 'd',
  'ধ': 'dh', 'ন': 'n', 'প': 'p', 'ফ': 'ph', 'ব': 'b', 'ভ': 'bh', 'ম': 'm', 'য': 'j',
  'র': 'r', 'ল': 'l', 'শ': 'sh', 'ষ': 'sh', 'স': 's', 'হ': 'h', 'ড়': 'r', 'ঢ়': 'rh',
  'য়': 'y', 'ৎ': 't', 'ং': 'n', 'ঃ': 'h', 'ঁ': '', '্য': 'y', '্র': 'r', '্ব': 'b',
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7',
  '৮': '8', '৯': '9'
});

const BENGALI_CHARS = /[\u0980-\u09FF]/;
/* A Bengali consonant carries an inherent "o" (নতুন → notun). A following vowel
   sign, the virama (্) or the end of the word cancels it (রাসেল → rasel). */
const BENGALI_CONSONANTS = /[\u0995-\u09B9\u09DC\u09DD\u09DF]/;

const BENGALI_VIRAMA = '\u09CD';
const BENGALI_INHERENT_VOWEL = 'o';

export function transliterate(value) {
  const text = String(value ?? '');
  let out = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (!BENGALI_CHARS.test(char)) { out += char; continue; }
    if (char === BENGALI_VIRAMA) continue;             // ক + ্ + ষ → ক্ষ
    out += BENGALI_MAP[char] ?? '';
    const next = text[index + 1] || '';
    // Only a consonant FOLLOWED by another consonant keeps its inherent vowel;
    // a vowel sign, a virama, a space or the end of the word cancels it.
    if (!BENGALI_CONSONANTS.test(char)) continue;
    if (!BENGALI_CONSONANTS.test(next)) continue;
    out += BENGALI_INHERENT_VOWEL;
  }
  return out;
}

/** lowercase, letters/digits only — every space and special character goes. */
export function slugifyName(value) {
  return transliterate(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** The role part of an id; unknown roles fall back to "staff". */
export function roleSlug(role) {
  const key = String(role ?? '').trim().toLowerCase();
  return ROLE_SLUGS[key] || ROLE_SLUGS.other;
}

/**
 * First usable name: "Rasal Russell Chowdhury" → "rasal",
 * "Md. Hasan Ali" → "hasan", "রাসেল চৌধুরী" → "rasel".
 */
export function extractFirstName(fullName) {
  const tokens = String(fullName ?? '')
    .trim()
    .split(/\s+/)
    .map(token => token.replace(/[.,]+$/, '').trim())
    .filter(Boolean);
  const usable = tokens.filter(token => {
    const slug = slugifyName(token);
    if (!slug) return false;
    // The prefix check runs on the word itself and on its transliteration, so
    // "মোঃ করিম" is skipped exactly like "Md. Karim".
    return !NAME_PREFIXES.has(token.toLowerCase()) && !NAME_PREFIXES.has(slug);
  });
  if (!usable.length) return '';
  // An initial is not a first name: "Dr. A B Rahman" → rahman.
  const first = usable.find(token => slugifyName(token).length > 1) || usable[0];
  return slugifyName(first);
}

/** Build one candidate: base (+ sequence on the base only) + role + .apc. */
export function buildLoginId(firstName, role, sequence = 1) {
  const rolePart = roleSlug(role);
  const suffix = `.${rolePart}${LOGIN_ID_SUFFIX}`; // ".teacher.apc"
  const number = sequence > 1 ? String(sequence) : '';
  const room = LOGIN_ID_MAX_LENGTH - suffix.length - number.length;
  let base = String(firstName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  base = base.slice(0, Math.max(3, room));
  base = base.replace(/^[0-9]+/, ''); // an id must start with a letter
  if (!base) base = LOGIN_ID_FALLBACK;
  return `${base}${number}${suffix}`;
}

export function normalizeLoginId(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * True when an id really is "first name (+number) . role . apc" — the shape this
 * generator produces. "admin.apc" or "teacher.apc" (a device role account) do
 * not qualify, because those ids have no first-name part.
 */
export function isAutoLoginId(value, role = null) {
  const id = normalizeLoginId(value);
  if (!LOGIN_ID_PATTERN.test(id)) return false;
  const parts = id.match(/^([a-z][a-z0-9]*)\.([a-z]+)\.apc$/);
  if (!parts) return false;
  if (!role) return Object.values(ROLE_SLUGS).includes(parts[2]);
  return parts[2] === roleSlug(role);
}

/**
 * The unique Login User ID for a person.
 *
 * @param {object}  options
 * @param {string}  options.fullName          "Rasal Russell Chowdhury"
 * @param {string}  options.role              admin | manager | teacher | cash-counter | payment | other
 * @param {Iterable<string>|Function} [options.taken]
 *        Already-claimed ids (compared case-insensitively) or a predicate.
 * @returns {string} e.g. "rasal.teacher.apc", "rasal2.teacher.apc"
 */
export function generateLoginId({ fullName, role = 'teacher', taken = [] } = {}) {
  const firstName = extractFirstName(fullName) || LOGIN_ID_FALLBACK;
  const isTaken = typeof taken === 'function'
    ? id => Boolean(taken(id))
    : id => new Set([...(taken || [])].map(normalizeLoginId)).has(normalizeLoginId(id));

  let sequence = 1;
  let id = buildLoginId(firstName, role, sequence);
  // The number always lands on the first name: never on the role, never on .apc.
  while (isTaken(id) && sequence < 1000) {
    sequence += 1;
    id = buildLoginId(firstName, role, sequence);
  }
  return id;
}

/** Split an id back into its parts — used by the UI to explain an id. */
export function describeLoginId(value) {
  const id = normalizeLoginId(value);
  const match = id.match(/^(.*)\.([a-z]+)\.apc$/);
  if (!match) return { base: id, role: '', valid: LOGIN_ID_PATTERN.test(id) };
  return { base: match[1], role: match[2], valid: LOGIN_ID_PATTERN.test(id) };
}
