/* Admin → Academic Setup: क्लास ও विषय (পরিচালনা)।
   The screen the whole app reads its structure from. It only writes through
   js/academics.js, so every cascading picker (teacher assignment, exam, routine,
   notice, courses) updates from one place. Nothing is ever deleted: a class or
   subject is switched off, and historical exams/results/assignments stay. */
import { iconMarkup } from './icons.js';
import {
  listClasses, listSubjects, listMappings, subjectsForClass, saveClass, saveSubject,
  setClassActive, setSubjectActive, setClassSubject
} from './academics.js';

const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const BN = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const bn = value => String(value).replace(/\d/g, digit => BN[Number(digit)]);

let root = null;
let toast = () => {};
let busy = false;

function render() {
  if (!root) return;
  const classes = listClasses({ includeInactive: true });
  const subjects = listSubjects({ includeInactive: true });
  const mappings = listMappings({ includeInactive: true });
  const activeSubjects = subjects.filter(item => item.active !== false);
  const rows = classes.map(item => {
    const enabled = new Set(mappings.filter(map => map.classId === item.id && map.active !== false).map(map => map.subjectId));
    const chips = activeSubjects.length
      ? activeSubjects.map(subject => `<label class="academics-subject"><input type="checkbox" data-academic-map="${esc(item.id)}" data-subject-id="${esc(subject.id)}" ${enabled.has(subject.id) ? 'checked' : ''} ${item.active === false ? 'disabled' : ''}> ${esc(subject.name)}</label>`).join('')
      : '<p class="admin-empty">এখনো কোনো বিষয় নেই — উপরে “নতুন বিষয়” যোগ করুন।</p>';
    return `<article class="academics-class${item.active === false ? ' is-off' : ''}" data-academic-class="${esc(item.id)}">
      <header class="academics-class-head">
        <div><h3>${esc(item.name)}</h3><small>${bn(enabled.size)}টি বিষয় চালু${item.active === false ? ' • ক্লাস বন্ধ' : ''}</small></div>
        <label class="switch" aria-label="${esc(item.name)} চালু বা বন্ধ করুন"><input type="checkbox" data-academic-class-active="${esc(item.id)}" ${item.active === false ? '' : 'checked'}><span class="switch-track"></span></label>
      </header>
      <p class="form-note">এই ক্লাসে যেসব বিষয় পড়ানো হবে সেগুলো টিক দিন — পরীক্ষা, রুটিন, শিক্ষক বরাদ্দ ও পড়াশোনা সবখানে ঠিক এই তালিকা দেখাবে।</p>
      <div class="academics-subjects">${chips}</div>
    </article>`;
  }).join('');
  const subjectRows = subjects.map(item => `<span class="academics-chip${item.active === false ? ' is-off' : ''}">${esc(item.name)}<button type="button" class="mini-btn" data-academic-subject-toggle="${esc(item.id)}" data-next="${item.active === false ? 'on' : 'off'}">${item.active === false ? 'চালু করুন' : 'বন্ধ করুন'}</button></span>`).join('');
  root.innerHTML = `
    <div class="academics-tools">
      <form class="academics-form" data-academic-class-form>
        <label>নতুন ক্লাস<input name="name" maxlength="80" placeholder="যেমন: সপ্তম শ্রেণি" required></label>
        <button class="admin-btn primary" type="submit">ক্লাস যোগ করুন</button>
      </form>
      <form class="academics-form" data-academic-subject-form>
        <label>নতুন বিষয়<input name="name" maxlength="80" placeholder="যেমন: কৃষিশিক্ষা" required></label>
        <button class="admin-btn primary" type="submit">বিষয় যোগ করুন</button>
      </form>
    </div>
    <p class="academics-status" data-academic-status role="status" hidden></p>
    <article class="admin-card">
      <header class="admin-card-head"><div><p class="eyebrow">Subjects</p><h2>বিষয়গুলো</h2></div><small>${bn(activeSubjects.length)} / ${bn(subjects.length)} চালু</small></header>
      <div class="academics-chips">${subjectRows || '<p class="admin-empty">এখনো কোনো বিষয় নেই।</p>'}</div>
      <p class="form-note">বন্ধ করলে নতুন পরীক্ষা, রুটিন বা শিক্ষক বরাদ্দে বিষয়টি আর দেখা যাবে না — পুরোনো পরীক্ষা, ফলাফল ও রেকর্ড অক্ষত থাকবে।</p>
    </article>
    <h2 class="exam-section-title">ক্লাসের বিষয় ঠিক করুন</h2>
    ${rows || '<p class="admin-empty">এখনো কোনো ক্লাস নেই।</p>'}`;
}

function say(text, isError = false) {
  const line = root?.querySelector('[data-academic-status]');
  if (line) {
    line.textContent = text || '';
    line.hidden = !text;
    line.classList.toggle('admin-error-text', isError);
  }
  if (isError) toast(text, true);
}

async function run(operation, success) {
  if (busy) return;
  busy = true;
  try { await operation(); }
  catch (error) { render(); say(error?.message || 'সংরক্ষণ হয়নি। আবার চেষ্টা করুন।', true); busy = false; return; }
  busy = false;
  // Repaint first, then announce — repainting rebuilds the status line, so the
  // confirmation has to come after it or the user never sees it.
  render();
  say(success);
}

/** @param {object} options  { mount, onToast } — the Admin shell hands both in. */
export function initAdminAcademics({ mount, onToast } = {}) {
  root = typeof mount === 'string' ? document.querySelector(mount) : mount;
  if (!root || root.dataset.ready === '1') return;
  root.dataset.ready = '1';
  toast = typeof onToast === 'function' ? onToast : () => {};
  render();
  root.addEventListener('submit', event => {
    const classForm = event.target.closest('[data-academic-class-form]');
    if (classForm) {
      event.preventDefault();
      const name = new FormData(classForm).get('name');
      run(() => saveClass({ name }), 'নতুন ক্লাস যোগ হয়েছে।').then(() => classForm.reset());
      return;
    }
    const subjectForm = event.target.closest('[data-academic-subject-form]');
    if (subjectForm) {
      event.preventDefault();
      const name = new FormData(subjectForm).get('name');
      run(() => saveSubject({ name }), 'নতুন বিষয় যোগ হয়েছে।').then(() => subjectForm.reset());
    }
  });
  root.addEventListener('change', event => {
    const map = event.target.closest('[data-academic-map]');
    if (map) {
      run(() => setClassSubject({ classId: map.dataset.academicMap, subjectId: map.dataset.subjectId, active: map.checked }),
        map.checked ? 'বিষয়টি এই ক্লাসে চালু হয়েছে।' : 'বিষয়টি বন্ধ করা হয়েছে — পুরোনো রেকর্ড অক্ষত আছে।');
      return;
    }
    const classSwitch = event.target.closest('[data-academic-class-active]');
    if (classSwitch) {
      run(() => setClassActive(classSwitch.dataset.academicClassActive, classSwitch.checked),
        classSwitch.checked ? 'ক্লাস চালু হয়েছে।' : 'ক্লাস বন্ধ করা হয়েছে — পুরোনো ডেটা অক্ষত আছে।');
    }
  });
  root.addEventListener('click', event => {
    const toggle = event.target.closest('[data-academic-subject-toggle]');
    if (!toggle) return;
    run(() => setSubjectActive(toggle.dataset.academicSubjectToggle, toggle.dataset.next === 'on'),
      toggle.dataset.next === 'on' ? 'বিষয়টি চালু হয়েছে।' : 'বিষয়টি বন্ধ করা হয়েছে — পুরোনো রেকর্ড অক্ষত আছে।');
  });
  window.addEventListener('storage', event => { if (!event.key || String(event.key).includes('academics')) render(); });
}

/** The card the settings page shows next to the legacy class list. */
export const academicsSummary = () => {
  const classes = listClasses().length;
  const subjects = listSubjects().length;
  const pairs = listMappings().length;
  return `${bn(classes)}টি ক্লাস • ${bn(subjects)}টি বিষয় • ${bn(pairs)}টি বরাদ্দ`;
};
export { iconMarkup, subjectsForClass };
