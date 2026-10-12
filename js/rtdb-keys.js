/* Realtime Database key rules.
   A key may not contain `.` `#` `$` `[` `]` `/` or a control character. The
   collection bridges percent-encode their keys (js/realtime-value-codec.js), but
   three paths write an app object *as it is* — the four staff accounts, the
   single student login and the exam database (exams + attempts). One punctuation
   key inside such an object makes the whole write fail, and because these writes
   sit in the startup task list, a single un-pushable record used to take the
   whole online bridge down with it.

   So the raw paths ask this module first: a record that cannot be written is
   left on the device and reported, while every other record still syncs. */

export const RTDB_FORBIDDEN_KEY = /[.#$/\[\]\u0000-\u001f\u007f]/;

const isObject = value => Boolean(value) && typeof value === 'object';

/** The first key Realtime Database would reject, as a readable path —
    `''` when the value can be written as it is. */
export function unsafeKeyPath(value, path = '') {
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      const found = unsafeKeyPath(child, `${path}[${index}]`);
      if (found) return found;
    }
    return '';
  }
  if (!isObject(value)) return '';
  for (const [key, child] of Object.entries(value)) {
    if (RTDB_FORBIDDEN_KEY.test(key)) return path ? `${path}.${key}` : key;
    const found = unsafeKeyPath(child, path ? `${path}.${key}` : key);
    if (found) return found;
  }
  return '';
}

/** A single name that will be used as a path segment or a key — an exam id, a
    login id, a collection key. Realtime Database checks the path too, so an id
    like `EXAM.260929` is refused before the value is even looked at. */
export function isRtdbKey(name) {
  return typeof name === 'string' && name !== '' && !RTDB_FORBIDDEN_KEY.test(name);
}
