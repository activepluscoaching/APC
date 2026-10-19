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
  return `<svg x="57" y="174" width="180" height="180" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="white"/><path d="${paths}" fill="#0e7a55"/></svg>`;
}
const maskedPhone = value => {
  const digits = String(value || '').replace(/[^0-9০-৯]/g, '');
  return digits ? `${digits.slice(0, 3)}${'•'.repeat(Math.max(3, digits.length - 5))}${digits.slice(-2)}` : '—';
};
export function studentIdCardSVG(student, photo = '', side = 'front') {
  const name = student?.nameBn || student?.name || 'শিক্ষার্থী';
  const classLine = [student?.className, student?.group].filter(Boolean).join(' · ') || 'শ্রেণি নির্ধারিত হয়নি';
  const idSource = String(student?.roll || student?.registrationNo || student?.id || '001').replace(/[^a-zA-Z0-9]/g, '');
  const classCode = String(student?.className || 'ST').replace(/[^a-zA-Z0-9]/g, '').slice(0, 3) || 'ST';
  const idCode = 'APC-' + classCode + '-' + idSource.slice(-3).padStart(3, '0');
  const session = String(student?.session || student?.academicYear || new Date().getFullYear());
  const row = (label, value, y) => '<text x="458" y="' + y + '" font-size="21" fill="#425466">' + esc(label) + '</text><text x="820" y="' + y + '" text-anchor="end" font-size="22" font-weight="650" fill="#172b25">' + esc(value || '—') + '</text><path d="M458 ' + (y + 12) + 'H820" stroke="#dfe8e3" stroke-width="1.5"/>';
  const logoUrl = new URL('assets/icons/logo-128.png', window.location.href).href;
  const logo = '<image href="' + esc(logoUrl) + '" x="30" y="24" width="76" height="76" preserveAspectRatio="xMidYMid meet"/>';
  const front = '<rect x="0" y="0" width="856" height="116" fill="#0e7a55"/>' +
    logo +
    '<text x="126" y="56" font-size="31" font-weight="750" fill="#ffffff">Active Plus Coaching</text>' +
    '<text x="128" y="86" font-size="19" fill="#e6fff4">শিখতে থাকো, এগিয়ে যাও</text>' +
    '<rect x="684" y="30" width="142" height="42" rx="21" fill="#ffffff" fill-opacity=".16" stroke="#d9fff0" stroke-opacity=".7"/>' +
    '<text x="755" y="57" text-anchor="middle" font-size="19" font-weight="700" fill="#ffffff">আইডি কার্ড</text>' +
    '<circle cx="110" cy="270" r="68" fill="#e4f4ec" stroke="#b5ddca" stroke-width="4"/>' +
    (validPhoto(photo) ? '<defs><clipPath id="id-photo-clip"><circle cx="110" cy="270" r="64"/></clipPath></defs><image x="46" y="206" width="128" height="128" href="' + photo + '" clip-path="url(#id-photo-clip)" preserveAspectRatio="xMidYMid slice"/>' : '<text x="110" y="290" text-anchor="middle" font-size="58" font-weight="700" fill="#0e7a55">' + esc(name.trim().charAt(0) || 'শি') + '</text>') +
    '<text x="208" y="178" font-size="18" fill="#61746b">শিক্ষার্থীর নাম</text>' +
    '<text x="208" y="218" font-size="31" font-weight="750" fill="#172b25">' + esc(name) + '</text>' +
    '<text x="208" y="252" font-size="21" fill="#0e7a55">শিক্ষার্থী</text>' +
    '<text x="208" y="286" font-size="22" font-weight="600" fill="#344b41">' + esc(classLine) + '</text>' +
    row('শিক্ষার্থী আইডি', idCode, 356) +
    row('ক্লাস রোল', student?.roll ? bn(student.roll) : '—', 402) +
    row('সেশন', bn(session), 448) +
    '<rect x="30" y="490" width="796" height="2" rx="1" fill="#e3eee8"/>' +
    '<text x="30" y="520" font-size="17" fill="#61746b">শুধু কোচিং পরিচয়ের জন্য · সরকারি পরিচয়পত্র নয়</text>';
  const back = '<rect x="0" y="0" width="856" height="116" fill="#0e7a55"/>' +
    '<text x="32" y="54" font-size="30" font-weight="750" fill="#ffffff">Active Plus Coaching</text>' +
    '<text x="34" y="84" font-size="19" fill="#e6fff4">শিক্ষার্থী পরিচয় যাচাই</text>' +
    '<rect x="28" y="142" width="238" height="270" rx="20" fill="#f1f8f4" stroke="#d9e9e0" stroke-width="2"/>' +
    qrMarkup(student) +
    '<text x="147" y="384" text-anchor="middle" font-size="18" font-weight="650" fill="#0e7a55">স্ক্যান করে আইডি দেখুন</text>' +
    '<text x="310" y="164" font-size="18" fill="#61746b">শিক্ষার্থীর নাম</text>' +
    '<text x="310" y="198" font-size="25" font-weight="700" fill="#172b25">' + esc(name) + '</text>' +
    row('অভিভাবকের মোবাইল', maskedPhone(student?.guardianMobile), 260) +
    row('জরুরি যোগাযোগ', maskedPhone(student?.studentMobile), 306) +
    row('ঠিকানা', student?.address, 352) +
    '<rect x="28" y="440" width="800" height="60" rx="14" fill="#f1f8f4"/>' +
    '<text x="428" y="465" text-anchor="middle" font-size="18" font-weight="650" fill="#0e7a55">কার্ডটি হারিয়ে গেলে Active Plus Coaching-এ যোগাযোগ করুন</text>' +
    '<text x="428" y="489" text-anchor="middle" font-size="16" fill="#61746b">এটি সরকারি পরিচয়পত্র নয়; QR-এ শিক্ষার্থী আইডি রয়েছে</text>';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="856" height="540" viewBox="0 0 856 540" role="img" aria-label="ডিজিটাল আইডি কার্ড">' +
    '<rect width="856" height="540" rx="28" fill="#ffffff"/><rect x="1.5" y="1.5" width="853" height="537" rx="27" fill="none" stroke="#d9e5de" stroke-width="3"/>' +
    '<g font-family="Noto Sans Bengali, sans-serif">' + (side === 'back' ? back : front) + '</g></svg>';
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
  async function cardPNGFile() {
    const svgBlob = new Blob([cardSVG()], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 1712; canvas.height = 1080;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('কার্ডের ছবি তৈরি করা যায়নি।');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG তৈরি করা যায়নি।');
      return new File([blob], cardFileName().replace('.svg', '.png'), { type: 'image/png' });
    } finally { URL.revokeObjectURL(url); }
  }
  async function downloadCard() {
    if (!getStudent()?.id) return showFeedback('শিক্ষার্থীর তথ্য পাওয়া যায়নি।');
    try {
      const file = await cardPNGFile();
      const url = URL.createObjectURL(file);
      const link = document.createElement('a'); link.href = url; link.download = file.name;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) { showFeedback(error.message || 'কার্ড ডাউনলোড করা যায়নি।'); }
  }
  $('#profileIdCardButton')?.addEventListener('click', () => { cardSide = 'front'; setView('student-id-card'); paintCard(); });
  document.querySelectorAll('[data-id-card-side]').forEach(button => button.addEventListener('click', () => {
    cardSide = button.dataset.idCardSide === 'back' ? 'back' : 'front'; paintCard();
  }));
  $('#studentIdCardFlip')?.addEventListener('click', () => { cardSide = cardSide === 'front' ? 'back' : 'front'; paintCard(); });
  $('#studentIdCardDownload')?.addEventListener('click', downloadCard);
  $('#studentIdCardShare')?.addEventListener('click', async () => {
    if (!getStudent()?.id) return;
    try {
      const file = await cardPNGFile();
      if (!navigator.canShare?.({ files: [file] })) {
        showFeedback('এই ব্রাউজারে ফাইল শেয়ার নেই। কার্ডটি ডাউনলোড করে শেয়ার করুন।'); return;
      }
      await navigator.share({ files: [file], title: 'Active Plus · শিক্ষার্থী কার্ড' });
    } catch (error) { if (error.name !== 'AbortError') showFeedback(error.message || 'শেয়ার করা যায়নি। ডাউনলোড করে শেয়ার করুন।'); }
  });
  window.addEventListener('apc-view-change', event => { if (event.detail?.view === 'student-id-card') paintCard(); });
  window.addEventListener('apc-session-ready', refresh);
  window.addEventListener('apc-view-change', event => { if (event.detail?.view === 'my-profile') void refresh(); });
  watchTeachingData(refresh); watchCourses(refresh); watchExams(refresh);
  void refresh();
  return refresh;
}
