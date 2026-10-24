/* Local app sessions are separate from Firebase's anonymous transport session.
   This client-side lifecycle gate is not a replacement for server-side rules. */
import { loadAccount, hasSession } from './storage.js';
import { activeStaffRoles } from './staff-auth.js';

export async function hasSyncSession() {
  if (loadAccount() && await hasSession()) return true;
  return (await activeStaffRoles()).length > 0;
}
