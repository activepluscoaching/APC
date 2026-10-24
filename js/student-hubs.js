import { teachingRepository, publishedForStudent, watchTeachingData } from './teaching-data.js';
import { matchesClassSection } from './class-key.js';
import { dhakaKey } from './time.js';
/* Extra 3×3 hub pages (ক্লাস / রুটিন extras) — read-only views over stores
   that already exist. Nothing is copied and no permissions change. */
import { loadRoutine, WEEK_DAYS, ROUTINE_KEY } from './office-data.js';
import { subjectsForClass, classByName } from './academics.js';
import { listCourseContent, typeOf as courseTypeOf } from './course-content.js';
import { examRepository as examRepo, examMatchesStudent, isStudentVisibleExam } from './exam-data.js';
import { toBanglaNumber as bn } from './ui.js';
import { resolveTeacherName } from './teaching-data.js';

const DAY_LABELS = { sat: 'শনিবার', sun: 'রবিবার', mon: 'সোমবার', tue: 'মঙ্গলবার', wed: 'বুধবার', thu: 'বৃহস্পতিবার' };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function todayKey() {
  return ['sun', 'mon', 'tue', 'wed', 'thu', null, 'sat'][new Date(`${dhakaKey()}T12:00:00Z`).getUTCDay()];
}

function tomorrowKey() {
  return ['sun', 'mon', 'tue', 'wed', 'thu', null, 'sat'][(new Date(`${dhakaKey()}T12:00:00Z`).getUTCDay() + 1) % 7];
}

function classesFor(day, student) {
  const routine = loadRoutine() || {};
  const rows = (routine[day]?.classes || []).filter(item => matchesClassSection(item, student));
  return rows;
}

function renderList(id, html) {
  const node = document.getElementById(id);
  if (node) node.innerHTML = html;
}

function classCards(rows, empty) {
  if (!rows.length) return `<p class="teacher-empty">${empty}</p>`;
  return rows.map(item => `<article class="routine-item"><div class="routine-time"><strong>${esc(item.time || '')}</strong><small>${esc(item.period || '')}</small></div><div class="routine-body"><span><strong>${esc(item.subject || 'ক্লাস')}</strong><small>${esc([resolveTeacherName(item.teacherId, item.teacherName || item.teacher), item.room].filter(Boolean).join(' · '))}</small></span></div></article>`).join('');
}

// One square per published attendance session, not a fabricated calendar day.
export function monthlyClassAttendance(activities, student, today = dhakaKey()) {
  const month = today.slice(0, 7);
  const rows = publishedForStudent(activities, student)
    .filter(item => item.type === 'routine' && /^\d{4}-\d{2}-\d{2}$/.test(item.date || '') && item.date.startsWith(month) && item.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(item => ({ ...item, attendance: item.progress?.[student.id]?.value }));
  const recorded = rows.filter(item => ['present', 'late', 'absent'].includes(item.attendance));
  const attended = recorded.filter(item => ['present', 'late'].includes(item.attendance));
  return { rows, percent: recorded.length ? Math.round(attended.length / recorded.length * 100) : null };
}

export function initStudentHubs({ getStudent } = {}) {
  const student = () => getStudent?.() || {};
  let attendanceRequest = 0;
  const count = (key, value) => {
    const node = document.querySelector(`[data-class-count="${key}"]`);
    if (node) {
      node.textContent = bn(value);
      node.classList.toggle('is-zero', !value);
    }
  };
  async function paintAttendance(me) {
    const request = ++attendanceRequest;
    try {
      const db = await teachingRepository.listForStudent(me.id);
      if (request !== attendanceRequest) return;
      const { rows, percent } = monthlyClassAttendance(db.activities || [], me);
      const rate = document.getElementById('classMonthAttendanceRate');
      if (rate) rate.textContent = percent === null ? '—' : `${bn(percent)}%`;
      const labels = { present: 'উপস্থিত', late: 'দেরিতে উপস্থিত', absent: 'অনুপস্থিত' };
      renderList('classMonthAttendanceGrid', rows.map(item => {
        const state = labels[item.attendance] ? item.attendance : 'unknown';
        const label = `${item.date} · ${item.subject || item.title || 'ক্লাস'} · ${labels[item.attendance] || 'নথিভুক্ত হয়নি'}`;
        return `<span class="class-attendance-cell is-${state}" role="img" aria-label="${esc(label)}" title="${esc(label)}"></span>`;
      }).join(''));
      const note = document.getElementById('classMonthAttendanceNote');
      if (note) note.textContent = rows.length ? 'সবুজ: উপস্থিত · লাল: অনুপস্থিত · ধূসর: নথিভুক্ত হয়নি (প্রতি ঘর একটি ক্লাস)' : 'এই মাসে উপস্থিতির কোনো তথ্য নেই।';
      renderList('classAttendanceList', rows.length ? rows.map(item => `<article class="exam-card"><h3>${esc(item.subject || item.title || 'ক্লাস')}</h3><p>${esc(item.date)} · ${esc(labels[item.attendance] || 'নথিভুক্ত হয়নি')}</p></article>`).join('') : '<p class="teacher-empty">এই মাসে উপস্থিতির কোনো তথ্য নেই।</p>');
    } catch {
      if (request !== attendanceRequest) return;
      const note = document.getElementById('classMonthAttendanceNote');
      if (note) note.textContent = 'উপস্থিতির তথ্য লোড হয়নি। পরে আবার চেষ্টা করো।';
      renderList('classMonthAttendanceGrid', '');
      renderList('classAttendanceList', '<p class="teacher-empty">উপস্থিতির তথ্য লোড হয়নি। পরে আবার চেষ্টা করো।</p>');
      const rate = document.getElementById('classMonthAttendanceRate');
      if (rate) rate.textContent = '—';
    }
  }

  function paint() {
    const me = student();
    const today = classesFor(todayKey(), me);
    const tomorrow = classesFor(tomorrowKey(), me);
    renderList('classTodayList', classCards(today, 'আজ কোনো ক্লাস নেই।'));
    renderList('routineTodayList', classCards(today, 'আজ কোনো ক্লাস নেই।'));
    renderList('classUpcomingList', classCards(tomorrow, 'আসন্ন ক্লাস নেই।'));
    renderList('routineTomorrowList', classCards(tomorrow, 'আগামীকাল কোনো ক্লাস নেই।'));
    count('today', today.length);
    const week = WEEK_DAYS.flatMap(day => classesFor(day, me).map(item => ({ ...item, day })));
    count('records', week.length);
    void paintAttendance(me);
    renderList('classRecordList', classCards(week, 'ক্লাস রেকর্ড এখনও নেই।'));
    renderList('routineClassList', WEEK_DAYS.map(day => {
      const rows = classesFor(day, me);
      return `<section class="exam-card"><h3>${DAY_LABELS[day]}</h3>${classCards(rows, 'ক্লাস নেই।')}</section>`;
    }).join(''));
    const subjects = subjectsForClass(me.className || '') || [];
    renderList('classSubjectsList', subjects.length
      ? subjects.map(item => `<article class="exam-card"><h3>${esc(item.name)}</h3></article>`).join('')
      : '<p class="teacher-empty">বিষয় এখনও যোগ হয়নি।</p>');
    const teachers = [...new Set(week.map(item => item.teacher).filter(Boolean))];
    renderList('classTeachersList', teachers.length
      ? teachers.map(name => `<article class="exam-card"><h3>${esc(name)}</h3></article>`).join('')
      : '<p class="teacher-empty">শিক্ষকের নাম রুটিনে এলে এখানে দেখা যাবে।</p>');
    const cls = classByName(me.className);
    const content = cls ? listCourseContent({
      classId: cls.id, group: me.group || '', groupScoped: true, publishedOnly: true, includeInactive: false
    }) : [];
    const notes = content.filter(row => ['note', 'lesson'].includes(courseTypeOf(row)));
    const materials = content.filter(row => ['pdf', 'video', 'previous_question'].includes(courseTypeOf(row)));
    renderList('classNotesList', notes.length ? notes.map(row => `<article class="exam-card"><h3>${esc(row.title)}</h3></article>`).join('') : '<p class="teacher-empty">ক্লাস নোট এখনও নেই।</p>');
    renderList('classMaterialsList', materials.length ? materials.map(row => `<article class="exam-card"><h3>${esc(row.title)}</h3></article>`).join('') : '<p class="teacher-empty">ক্লাস উপকরণ এখনও নেই।</p>');
    const blob = item => `${item.tag || ''} ${item.status || ''} ${item.subject || ''}`.toLowerCase();
    renderList('routineChangedList', classCards(week.filter(item => /পরিবর্ত|changed/.test(blob(item))), 'পরিবর্তিত রুটিন নেই।'));
    renderList('routineHolidayList', classCards(week.filter(item => /ছুটি|holiday/.test(blob(item))), 'ছুটির তালিকা খালি।'));
    renderList('routineImportantList', classCards(week.filter(item => /গুরুত্বপূর্ণ|important/.test(blob(item))), 'গুরুত্বপূর্ণ সময়সূচি নেই।'));
    renderList('routineOtherList', classCards(week.filter(item => !/পরীক্ষা|exam|পরিবর্ত|changed|ছুটি|holiday|গুরুত্বপূর্ণ|important/.test(blob(item))), 'অন্যান্য রুটিন নেই।'));
    renderList('classOtherList', classCards(week, 'অন্যান্য ক্লাসের তথ্য নেই।'));
    void examRepo.listForStudent(me.id).then(db => {
      const now = Date.now();
      const exams = (db.exams || []).filter(exam => isStudentVisibleExam(exam) && examMatchesStudent(exam, me) && exam.startAt > now)
        .sort((a, b) => a.startAt - b.startAt);
      const examHtml = exams.length
        ? exams.map(exam => `<article class="exam-card"><h3>${esc(exam.title)}</h3><p class="exam-note">${esc(exam.subject || '')} • ${new Date(exam.startAt).toLocaleString('bn-BD')}</p></article>`).join('')
        : '<p class="teacher-empty">আসন্ন পরীক্ষার সময়সূচি নেই।</p>';
      renderList('routineExamList', examHtml);
      renderList('examOtherList', examHtml);
    }).catch(() => {});
  }

  window.addEventListener('apc-view-change', event => {
    const view = event.detail?.view || '';
    if (view.startsWith('class-') || view.startsWith('routine-') || view === 'classes' || view === 'routine') paint();
  });
  window.addEventListener('apc-session-ready', paint);
  watchTeachingData(paint);
  window.addEventListener('storage', event => { if (!event.key || event.key === ROUTINE_KEY) paint(); });
  paint();
  return paint;
}
