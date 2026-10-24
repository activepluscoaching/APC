// Protected Sync configuration surface.
// Database path and retry policy belong here, not in UI/theme code.
export const SYNC_CONFIG = Object.freeze({
  root: 'activePlusSync/v1',
  retryDelaysMs: Object.freeze([2000, 5000, 10000, 30000, 60000]),
  backgroundRetryMs: 60000
});