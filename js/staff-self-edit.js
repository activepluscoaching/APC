/* Own-profile self edit (Issue 7) — a LAZY module: the student's first paint
 * must not pay for the staff profile form, so js/settings-hub.js never imports
 * this file statically; teacher/manager panels import it on demand. */
import { updateStaffProfile, readStaffAccount, readActiveStaffIdentity } from './staff-auth.js';


/* ---- Own-profile self edit (Issue 7) -----------------------------------------
 * The profile card predates the hub and stays THE profile row (no second row),
 * but it was display-only: a bootstrap placeholder name («প্রাথমিক শিক্ষক
 * অ্যাকাউন্ট») could only be fixed by the Admin. This adds an edit affordance
 * INSIDE the card — inline form, mobile-first buttons — writing through
 * updateStaffProfile (identity stays locked there) and mirroring the display
 * fields into the Staff Directory when a record exists for this login. */
export function mountProfileSelfEdit({ role, card, current, render, toast } = {}) {
  const host = typeof card === 'string' ? document.querySelector(card) : card;
  if (!host || !role || host.dataset.profileEditWired === '1') return;
  host.dataset.profileEditWired = '1';
  const say = message => { if (typeof toast === 'function') toast(message); };

  host.addEventListener('click', event => {
    if (event.target.closest('[data-profile-edit-cancel]')) {
      if (typeof render === 'function') render();
      return;
    }
    if (event.target.closest('[data-profile-edit]')) void openForm();
  });

  async function openForm() {
    let account = null;
    try {
      if (typeof current === 'function') account = current();
      if (!account) account = await readStaffAccount(role);
    } catch { account = null; }
    if (!account) { say('প্রোফাইল পড়া যায়নি — আবার চেষ্টা করুন।'); return; }
    const esc = value => String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    host.innerHTML = `<form class="staff-form" id="ownProfileEditForm" novalidate autocomplete="off">
      <div class="staff-form-grid">
        <div class="staff-field">
          <label for="ownProfileName">পূর্ণ নাম *</label>
          <input id="ownProfileName" name="fullName" type="text" autocomplete="name" maxlength="100" required value="${esc(account.fullName || '')}">
        </div>
        <div class="staff-field">
          <label for="ownProfileMobile">মোবাইল নম্বর</label>
          <input id="ownProfileMobile" name="mobile" type="tel" inputmode="tel" autocomplete="tel" placeholder="01XXXXXXXXX" value="${esc(account.mobile || '')}">
        </div>
        <div class="staff-field">
          <label for="ownProfileEmail">ইমেইল (ঐচ্ছিক)</label>
          <input id="ownProfileEmail" name="email" type="email" autocomplete="email" maxlength="254" value="${esc(account.email || '')}">
        </div>
      </div>
      <p class="finance-error" id="ownProfileEditError" role="alert" hidden></p>
      <div class="modal-actions">
        <button class="admin-btn primary" type="submit">সংরক্ষণ করুন</button>
        <button class="admin-btn ghost" type="button" data-profile-edit-cancel>বাতিল</button>
      </div>
    </form>`;
    const form = host.querySelector('#ownProfileEditForm');
    const error = host.querySelector('#ownProfileEditError');
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      if (error) { error.hidden = true; error.textContent = ''; }
      const data = Object.fromEntries(new FormData(form));
      const patch = { fullName: String(data.fullName || '').trim().replace(/\s+/g, ' ') };
      const mobile = String(data.mobile || '').trim();
      const email = String(data.email || '').trim().toLowerCase();
      if (mobile) patch.mobile = mobile;
      if (email) patch.email = email;
      /* Which store holds "me"? A Staff Directory sign-in edits its own record
         (mirrored everywhere it is displayed); a device role account edits
         itself through updateStaffProfile — identity stays locked there. */
      let identity = null;
      try { identity = readActiveStaffIdentity ? readActiveStaffIdentity() : null; } catch { identity = null; }
      const username = String(identity?.username || account?.username || '').trim().toLowerCase();
      let directoryEdit = null;
      try {
        const { mirrorSelfProfileToDirectory } = await import('./staff-directory.js');
        directoryEdit = await mirrorSelfProfileToDirectory(username, patch);
      } catch { directoryEdit = null; }
      if (directoryEdit?.found) {
        if (!directoryEdit.ok) {
          if (error) { error.textContent = 'ডিরেক্টরিতে সংরক্ষণ করা হয়নি — স্টোরেজ পরীক্ষা করুন।'; error.hidden = false; }
          return;
        }
      } else {
        const result = await updateStaffProfile(role, patch);
        if (!result.ok) {
          if (error) { error.textContent = result.error || 'তথ্য সংরক্ষণ করা হয়নি।'; error.hidden = false; }
          return;
        }
      }
      say('প্রোফাইল হালনাগাদ করা হয়েছে');
      if (typeof render === 'function') render();
    });
  }
}
