/* Display names for staff roles — bootstrap placeholders read as clean
 *  Bengali («প্রাথমিক শিক্ষক অ্যাকাউন্ট»), never a glued English role word.
 *  Kept out of js/staff-auth.js so the student first-paint graph stays inside
 *  the load budget (tools/load-budget.mjs): staff-directory imports this
 *  statically (already lazy) and the bootstrap path imports it on demand. */
export const STAFF_ROLE_NAME_BN = Object.freeze({
  admin: 'এডমিন', manager: 'ম্যানেজার', teacher: 'শিক্ষক', payment: 'পেমেন্ট', office: 'অফিস'
});
export function staffRoleNameBn(role) {
  return STAFF_ROLE_NAME_BN[role] || role;
}
