/* Finding a student by what staff actually have at hand.
   The permanent Student ID is the tracking key: it is unique, it is printed on
   the profile and on receipts, and a staff member may type it in full, in its
   short form ("s260929001"), with Bangla digits, or with the dashes removed.
   Name, guardian name, mobile numbers, class and group are matched too, so one
   search box works for every panel (Admin, Manager, Cash Counter, Teacher). */

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Bangla numerals → ASCII numerals, so "২৬০৯২৯০০১" finds "s260929001". */
export const latinDigits = value => String(value ?? '').replace(/[০-৯]/g, digit => BANGLA_DIGITS.indexOf(digit));

/** Case- and width-insensitive text used for every comparison. */
export function searchText(value) {
  return latinDigits(value).normalize('NFC').trim().toLocaleLowerCase();
}

/** Punctuation and spaces removed: "AP-1024" and "ap 1024" both match "AP1024". */
const packed = value => searchText(value).replace(/[\s()+\-._/]/g, '');

/** Does this query find that student? An empty query never matches. */
export function matchesStudentQuery(student, query) {
  const text = searchText(query);
  if (!student || !text) return false;
  const compact = packed(query);
  const fields = [
    student.id, student.name, student.nameEn, student.fatherName,
    student.mobile, student.guardianMobile, student.className, student.group
  ];
  return fields.some(value => {
    const normalized = searchText(value);
    if (!normalized) return false;
    return normalized.includes(text) || (compact && packed(value).includes(compact));
  });
}

/** The students a query finds; an empty query returns nobody (never everyone). */
export function searchStudentsByQuery(students, query) {
  if (!searchText(query)) return [];
  return (Array.isArray(students) ? students : []).filter(student => matchesStudentQuery(student, query));
}

/** One line for the UI: the Student ID is what identifies the student for staff. */
export function studentLabel(student) {
  if (!student) return '';
  const name = student.name || student.nameEn || '';
  return student.id ? `${name} (${student.id})`.trim() : name;
}
