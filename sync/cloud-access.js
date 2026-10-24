/* Never run legacy RTDB beside Firebase email Auth. */
export function backendMode({ search = globalThis.location?.search || '', storage } = {}) {
  try { if (storage === undefined) storage = globalThis.sessionStorage; } catch { storage = null; }
  const requested = new URLSearchParams(search).get('backend') || globalThis.__apcPublicFlags?.backend;
  if (requested && !['local', 'firebase'].includes(requested)) return 'local';
  if (requested) {
    try { storage?.setItem('apc.backend', requested); } catch {}
    return requested;
  }
  try { return storage?.getItem('apc.backend') === 'firebase' ? 'firebase' : 'local'; }
  catch { return 'local'; }
}
export const LEGACY_CLOUD_ENABLED = backendMode() !== 'firebase';
export const CLOUD_PAUSED_MESSAGE = 'ক্লাউড সিঙ্ক এই মুহূর্তে বন্ধ রাখা হয়েছে।';
export const cloudPausedResult = () => ({ ok: false, reason: 'authentication-required', retryable: true });
export function assertCloudAccess() {
  if (!LEGACY_CLOUD_ENABLED) throw new Error('cloud-sync-paused');
  return true;
}
