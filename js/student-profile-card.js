import qrcode from '../vendor/qrcode/encoder.js';
import { setView } from './shell.js';
/* Read-only identity summary. Photos are optional, resized and device-local;
   the immutable ID and all academic statistics still come from their owners. */
import { teachingRepository, publishedForStudent, watchTeachingData } from './teaching-data.js';
import { courseRepository, watchCourses } from './course-data.js';
import { examRepository, watchExams, gradeFor } from './exam-data.js';
import { calculateStudentHomeStats } from './student-dashboard.js';
import { toBanglaNumber as bn, showFeedback } from './ui.js';

const $ = selector => document.querySelector(selector);
const photoKey = student => `activePlus.profilePhoto.v1.${encodeURIComponent(student?.id || '')}`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const validPhoto = value => /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value || '') && value.length < 250000;
function readPhoto(student) {
  if (!student?.id) return '';
  try { const value = localStorage.getItem(photoKey(student)); return validPhoto(value) ? value : ''; }
  catch { return ''; }
}

export const studentIdQRPayload = student => `Active Plus Coaching | Student ID: ${String(student?.id || '').slice(0, 128)}`;
function qrMarkup(student) {
  const qr = qrcode(0, 'M'); qr.addData(studentIdQRPayload(student)); qr.make();
  const count = qr.getModuleCount(), size = count + 8;
  let paths = '';
  for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) {
    if (qr.isDark(y, x)) paths += `M${x + 4},${y + 4}h1v1h-1z`;
  }
  return `<svg x="102" y="32" width="176" height="176" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="white"/><path d="${paths}" fill="#0e7a55"/></svg>`;
}
const maskedPhone = value => {
  const digits = String(value || '').replace(/[^0-9০-৯]/g, '');
  return digits ? `${digits.slice(0, 3)}${'•'.repeat(Math.max(3, digits.length - 5))}${digits.slice(-2)}` : '—';
};
export function studentIdCardSVG(student, photo = '', side = 'front') {
  const name = student?.name || student?.nameBn || 'শিক্ষার্থী';
  const row = (label, value, y) => `<text x="20" y="${y}" font-size="13">${esc(label)}</text><text x="360" y="${y}" text-anchor="end" font-size="13" font-weight="600"${String(value || '').length > 24 ? ' textLength="220" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(value || '—')}</text><path d="M20 ${y + 9}h340" stroke="white" stroke-opacity=".3"/>`;
  const front = `<text x="190" y="35" text-anchor="middle" font-size="19" font-weight="700">▤ Active Plus Coaching</text>
    <circle cx="190" cy="113" r="49" fill="#ffffff22" stroke="white" stroke-width="2"/>
    ${validPhoto(photo) ? `<defs><clipPath id="id-photo-clip"><circle cx="190" cy="113" r="48"/></clipPath></defs><image x="142" y="65" width="96" height="96" href="${photo}" clip-path="url(#id-photo-clip)"/>` : `<text x="190" y="130" text-anchor="middle" font-size="42">${esc(name.charAt(0))}</text>`}
    <text x="190" y="194" text-anchor="middle" font-size="23" font-weight="600"${name.length > 24 ? ' textLength="330" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(name)}</text><text x="190" y="216" text-anchor="middle" font-size="14">Student</text>
    ${row('Student ID', student?.id, 254)}${row('শ্রেণি', [student?.className, student?.group].filter(Boolean).join(' · '), 289)}${row('ক্লাস রোল', student?.roll ? bn(student.roll) : '—', 324)}${row('প্রতিষ্ঠান', student?.institution || 'Active Plus Coaching', 359)}${row('মেয়াদ', student?.validUntil || 'নির্ধারিত হয়নি', 394)}`;
  const back = `${qrMarkup(student)}<text x="190" y="235" text-anchor="middle" font-size="15">স্ক্যান করে Student ID দেখুন</text>
    ${row('অভিভাবক', maskedPhone(student?.guardianMobile), 279)}${row('জরুরি যোগাযোগ', maskedPhone(student?.studentMobile), 316)}${row('ঠিকানা', student?.address, 353)}
    <text x="190" y="392" text-anchor="middle" font-size="13">কার্ডটি শুধু শিক্ষার্থীর ব্যবহারের জন্য।</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="430" viewBox="0 0 380 430" role="img" aria-label="ডিজিটাল আইডি কার্ড · ${side === 'back' ? 'পেছনের পাশ' : 'সামনের পাশ'}"><rect width="380" height="430" rx="24" fill="#0e7a55"/><g fill="white" font-family="Noto Sans Bengali, sans-serif">${side === 'back' ? back : front}</g></svg>`;
}

export function initStudentProfileCard({ getStudent }) {
  if (!$('#myProfileView')) return;
  let request = 0;
  function paintPhoto() {
    const photo = readPhoto(getStudent());
    const image = $('#profilePhoto'), avatar = $('#profileAvatar');
    if (image) { image.hidden = !photo; if (photo) image.src = photo; else image.removeAttribute('src'); }
    if (avatar) avatar.hidden = Boolean(photo);
  }
  async function refresh() {
    paintPhoto();
    const current = ++request, student = getStudent() || {};
    const ids = ['#profileAttendanceRate', '#profileAverageGrade', '#profileAbsenceRate'];
    ids.forEach(id => { if ($(id)) $(id).textContent = '—'; });
    if (!student.id) return;
    try {
      const [teaching, exams] = await Promise.all([
        teachingRepository.listForStudent(student.id), examRepository.listForStudent(student.id)
      ]);
      if (current !== request) return;
      const stats = calculateStudentHomeStats({ student,
        activities: publishedForStudent(teaching.activities || [], student), examDb: exams,
        courses: courseRepository.readStudentCoursesSync(student) });
      if ($('#profileAttendanceRate')) $('#profileAttendanceRate').textContent = stats.attendancePercent === null ? '—' : `${bn(stats.attendancePercent)}%`;
      if ($('#profileAbsenceRate')) $('#profileAbsenceRate').textContent = stats.attendancePercent === null ? '—' : `${bn(100 - stats.attendancePercent)}%`;
      if ($('#profileAverageGrade')) $('#profileAverageGrade').textContent = stats.averageResultPercent === null ? '—' : gradeFor(stats.averageResultPercent, 100);
    } catch { /* Unknown is not zero, nor fabricated performance. */ }
  }
  $('#profilePhotoButton')?.addEventListener('click', () => $('#profilePhotoInput')?.click());
  $('#profilePhotoInput')?.addEventListener('change', async event => {
    const file = event.target.files?.[0], student = getStudent();
    if (!file || !student?.id) return;
    const key = photoKey(student);
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('৫ MB-এর মধ্যে JPG, PNG বা WebP ছবি বেছে নিন।');
      const url = URL.createObjectURL(file);
      try {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 240;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('ছবি প্রস্তুত করা যায়নি।');
        const side = Math.min(image.width, image.height);
        context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 240, 240);
        if (getStudent()?.id !== student.id) return;
        localStorage.setItem(key, canvas.toDataURL('image/jpeg', .8));
        paintPhoto(); showFeedback('ছবি শুধু এই ডিভাইসে সংরক্ষিত হয়েছে।');
      } finally { URL.revokeObjectURL(url); }
    } catch (error) { showFeedback(error.message || 'ছবি সংরক্ষণ হয়নি। আবার চেষ্টা করুন।'); }
    finally { event.target.value = ''; }
  });
  let cardSide = 'front';
  const cardSVG = () => studentIdCardSVG(getStudent(), readPhoto(getStudent()), cardSide);
  function paintCard() {
    const preview = $('#studentIdCardPreview');
    if (preview) preview.innerHTML = cardSVG();
    document.querySelectorAll('[data-id-card-side]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.idCardSide === cardSide)));
    if ($('#studentIdCardFlip')) $('#studentIdCardFlip').textContent = cardSide === 'front' ? 'পেছনে' : 'সামনে';
  }
  const cardFileName = () => `student-id-${String(getStudent()?.id || '').replace(/[^a-zA-Z0-9_-]/g, '_')}-${cardSide}.svg`;
  function downloadCard() {
    if (!getStudent()?.id) return showFeedback('শিক্ষার্থীর তথ্য পাওয়া যায়নি।');
    const url = URL.createObjectURL(new Blob([cardSVG()], { type: 'image/svg+xml;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = cardFileName();
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('#profileIdCardButton')?.addEventListener('click', () => { cardSide = 'front'; setView('student-id-card'); paintCard(); });
  document.querySelectorAll('[data-id-card-side]').forEach(button => button.addEventListener('click', () => {
    cardSide = button.dataset.idCardSide === 'back' ? 'back' : 'front'; paintCard();
  }));
  $('#studentIdCardFlip')?.addEventListener('click', () => { cardSide = cardSide === 'front' ? 'back' : 'front'; paintCard(); });
  $('#studentIdCardDownload')?.addEventListener('click', downloadCard);
  $('#studentIdCardShare')?.addEventListener('click', async () => {
    if (!getStudent()?.id) return;
    const file = new File([cardSVG()], cardFileName(), { type: 'image/svg+xml' });
    if (!navigator.canShare?.({ files: [file] })) {
      showFeedback('এই ব্রাউজারে ফাইল শেয়ার নেই। কার্ডটি ডাউনলোড করে শেয়ার করুন।'); return;
    }
    try { await navigator.share({ files: [file], title: 'Active Plus · শিক্ষার্থী কার্ড' }); }
    catch (error) { if (error.name !== 'AbortError') showFeedback('শেয়ার করা যায়নি। ডাউনলোড করে শেয়ার করুন।'); }
  });
  window.addEventListener('apc-view-change', event => { if (event.detail?.view === 'student-id-card') paintCard(); });
  window.addEventListener('apc-session-ready', refresh);
  window.addEventListener('apc-view-change', event => { if (event.detail?.view === 'my-profile') void refresh(); });
  watchTeachingData(refresh); watchCourses(refresh); watchExams(refresh);
  void refresh();
  return refresh;
}
