/* Data Migration Layer
   Ensures local data survives app version updates safely.
   Preserves existing data records, fills missing fields gracefully,
   and prevents accidental overwriting or clearing of local storage. */

import { KEYS } from '../database.js';
import { readJSON, writeJSON } from '../storage.js';

export const CURRENT_DATA_VERSION = 2;
export const DATA_VERSION_KEY = 'activePlus.dataVersion.v1';

/* Fields the student schema guarantees. A record that already has all of them
   is returned untouched. */
const STUDENT_FIELDS = Object.freeze([
  'id', 'name', 'nameEn', 'fatherName', 'className', 'group', 'mobile',
  'guardianMobile', 'address', 'email', 'status', 'attendance', 'average',
  'monthlyFee', 'enrolledAt', 'lastActive'
]);

/**
 * Migrate any single student record: ensure missing fields are populated safely
 * without dropping existing fields.
 *
 * A schema-complete record is returned as the SAME object, never a rebuilt copy.
 * The roster is synced record-by-record: rewriting a row that needs no change
 * (a new key order, an added empty field) would look like a fresh local edit to
 * the cloud bridge and let a stale phone overwrite a newer decision made by the
 * office — an approved registration, for example.
 */
export function migrateStudentRecord(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (STUDENT_FIELDS.every(field => Object.hasOwn(raw, field))) return raw;
  return {
    id: raw.id || '',
    name: raw.name || raw.nameBn || '',
    nameEn: raw.nameEn || '',
    fatherName: raw.fatherName || '',
    className: raw.className || '',
    group: raw.group || '',
    mobile: raw.mobile || raw.studentMobile || '',
    guardianMobile: raw.guardianMobile || '',
    address: raw.address || '',
    email: raw.email || '',
    status: raw.status || 'pending',
    attendance: Number(raw.attendance) || 0,
    average: Number(raw.average) || 0,
    monthlyFee: raw.monthlyFee ?? null,
    enrolledAt: raw.enrolledAt || '',
    lastActive: raw.lastActive || 'এই ডিভাইস',
    ...raw
  };
}

/**
 * Run safe migrations across all collections.
 * Only initializes if completely missing ("create-if-missing", NEVER "reset-if-existing").
 */
export function runMigrations() {
  const version = readJSON(DATA_VERSION_KEY, 0);

  // Example migration: ensure student records have all schema properties intact
  const rawStudents = readJSON(KEYS.students, null);
  if (Array.isArray(rawStudents)) {
    let modified = false;
    const migrated = rawStudents.map(student => {
      const fixed = migrateStudentRecord(student);
      // Only a record that really gained a field is written back; the
      // comparison is by identity, so an untouched collection is never
      // rewritten (which would broadcast it to every other device).
      if (fixed !== student) modified = true;
      return fixed;
    });
    if (modified) {
      writeJSON(KEYS.students, migrated);
    }
  }

  // Set the data version stamp safely
  if (version < CURRENT_DATA_VERSION) {
    writeJSON(DATA_VERSION_KEY, CURRENT_DATA_VERSION);
  }
}
