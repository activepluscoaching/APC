export function isQuotaError(error) {
  return error?.name === 'QuotaExceededError' || error?.code === 22 || error?.code === 1014;
}
export function showStorageError(error) {
  if (!isQuotaError(error) || typeof document === 'undefined') return;
  let alert = document.getElementById('apcStorageWarning');
  if (!alert) {
    alert = document.createElement('div');
    alert.id = 'apcStorageWarning'; alert.setAttribute('role', 'alert');
    alert.style.cssText = 'position:fixed;z-index:99999;bottom:0;left:0;right:0;background:#fff4d6;color:#332400;padding:16px;border-top:2px solid #805500';
    const message = document.createElement('span');
    message.textContent = 'স্টোরেজের জায়গা শেষ। নতুন তথ্য সংরক্ষিত হয়নি; আগের তথ্য মুছবেন না। ';
    const link = document.createElement('a'); link.href = './admin.html#backup'; link.textContent = 'অ্যাডমিন হিসেবে ব্যাকআপ এক্সপোর্ট করুন';
    alert.append(message, link); document.body?.append(alert);
  }
}
export function safeSetItem(storage, key, value) {
  try { storage.setItem(key, value); }
  catch (error) { showStorageError(error); throw error; }
}
export async function requestPersistentStorage(navigatorObject = globalThis.navigator) {
  try { return Boolean(await navigatorObject?.storage?.persist?.()); }
  catch { return false; }
}
export function backupOverdue(stamp, now = Date.now()) {
  const time = Date.parse(stamp || '');
  return !Number.isFinite(time) || now - time >= 7 * 86400000;
}
