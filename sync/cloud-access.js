/* Cloud sync gate.
 * INTERIM (owner decision, 2026-09-30): the anonymous Realtime Database bridge
 * is enabled. The database rules (database.rules.json) only scope it to the
 * known activePlusSync/v1 nodes; they do NOT authorize individual users. See
 * docs/INTERIM-ANONYMOUS-SYNC.md (accepted risk) and
 * docs/RTDB-PER-USER-RULES-PLAN.md (the replacement). To stop all cloud traffic
 * from updated clients again, set LEGACY_CLOUD_ENABLED to false.
 */
export const LEGACY_CLOUD_ENABLED = true;
export const CLOUD_PAUSED_MESSAGE = 'ক্লাউড সিঙ্ক এই মুহূর্তে বন্ধ রাখা হয়েছে।';
export const cloudPausedResult = () => ({ ok: false, reason: 'authentication-required', retryable: true });
export function assertCloudAccess() {
  if (!LEGACY_CLOUD_ENABLED) throw new Error('cloud-sync-paused');
  return true;
}
