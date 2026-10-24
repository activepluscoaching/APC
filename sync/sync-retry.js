// Protected retry policy. Never disable retries from UI/theme code.
import { SYNC_CONFIG } from './sync-config.js';
export const retryDelay = attempt => SYNC_CONFIG.retryDelaysMs[Math.min(Math.max(Number(attempt) || 0, 0), SYNC_CONFIG.retryDelaysMs.length - 1)];
export const backgroundRetryDelay = () => SYNC_CONFIG.backgroundRetryMs;