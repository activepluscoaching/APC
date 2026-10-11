/* Explicit, additive fixtures for app review. Never replace a user's records. */
import { adminStudents } from './admin-data.js';
import { validateExam, examTemplate, scoreAttempt } from './exam-data.js';
import { DEMO_TEACHER, validateActivity, todayISO } from './teaching-data.js';
const roster = () => adminStudents.filter(s => s.status === 'approved').map(s => ({ id: s.id, name: s.name, className: s.className }));
export function buildDemoExams(now = Date.now(), batch = 'initial') {
  const hour = 3600000, people = roster();
  const definitions = [
    ['live', 'mcq', 'চলমান MCQ — এখনই অংশ নিন', -hour / 30, hour * 58 / 60, 'published'],
    ['upcoming', 'mcq', 'আসন্ন গণিত পরীক্ষা', 2 * hour, 3 * hour, 'published'],
    ['completed', 'mcq', 'সম্পন্ন MCQ — ফলাফল ও উত্তরপত্র', -26 * hour, -25 * hour, 'published'],
    ['written', 'written', 'লিখিত — প্রশ্নপত্র ও ক্লাসের নম্বর', -26 * hour, -25 * hour, 'published'],
    ['short', 'short', 'সংক্ষিপ্ত উত্তর — ক্লাস মূল্যায়ন', -26 * hour, -25 * hour, 'published'],
    ['pending', 'mcq', 'Admin অনুমোদনের অপেক্ষায়', 4 * hour, 5 * hour, 'pending'],
    ['draft', 'short', 'সম্পাদনার জন্য খসড়া', 6 * hour, 7 * hour, 'draft'],
    ['rejected', 'written', 'সংশোধনের জন্য ফেরত', 8 * hour, 9 * hour, 'rejected']
  ];
  const exams = definitions.map(([key, type, title, start, end, status]) => ({
    ...validateExam({ type, title: `ডেমো: ${title}`, subject: 'গণিত', startAt: now + start, endAt: now + end, lateMinutes: key === 'live' ? 60 : 15, negative: .5, passPercent: 33, template: examTemplate(type), instructions: 'এটি অ্যাপ যাচাইয়ের নমুনা পরীক্ষা। সব প্রশ্ন পড়ুন। চাইলে নাম, সময় ও প্রশ্ন বদলে নতুন খসড়া তৈরি করুন।' }),
    id: `DEMO-EX-${batch}-${key}`, teacherId: DEMO_TEACHER.id, teacherName: DEMO_TEACHER.name,
    status, reviewNote: status === 'rejected' ? 'ডেমো মন্তব্য: প্রশ্নের ভাষা সহজ করে পুনরায় অনুমোদনের জন্য পাঠান।' : '',
    participants: status === 'published' ? people : [], createdAt: now, updatedAt: now, demoFixture: true,
    ...(type !== 'mcq' && status === 'published' ? { absentIds: [people[1].id] } : {})
  }));
  const attempts = [];
  function result(exam, person, answers) {
    const attempt = { id: `DEMO-AT-${batch}-${exam.type}-${exam.id.split('-').at(-1)}-${person.id}`, examId: exam.id, studentId: person.id, name: person.name, className: person.className, number: 1, status: 'submitted', startedAt: exam.startAt + 1000, finishedAt: Math.min(now - 1000, exam.endAt - 1000), savedAt: Math.min(now - 1000, exam.endAt - 1000), answers, demoFixture: true, order: exam.type === 'mcq' ? exam.questions.map(q => ({ id: q.id, options: q.options.map(o => o.id) })) : [] };
    if (exam.type === 'mcq') Object.assign(attempt, scoreAttempt(exam, attempt));
    // The written/short marks come from the exam's own questions, so editing a
    // template can never leave the demo fixture disagreeing with its exam.
    else {
      const scores = Object.fromEntries(exam.questions.map((q, index) => [q.id, index === 0 ? q.marks : Math.max(0, q.marks - 1)]));
      attempt.questionScores = scores;
      attempt.score = Object.values(scores).reduce((sum, mark) => sum + mark, 0);
      attempt.finishedAt = now - 1000;
    }
    attempts.push(attempt);
  }
  const live = exams[0], complete = exams[2];
  result(live, people[1], { q1: 'A', q2: 'C' }); result(live, people[2], { q1: 'B', q2: 'C' });
  result(complete, people[0], { q1: 'A' }); result(complete, people[1], { q1: 'A', q2: 'C' }); result(complete, people[2], { q1: 'B', q2: 'C' });
  result(exams[3], people[0], {}); result(exams[4], people[0], {});
  return { exams, attempts };
}
export function buildDemoTeaching(now = Date.now()) {
  const date = offset => todayISO(new Date(now + offset * 86400000)), timestamp = new Date(now).toISOString();
  return [
    ['exam', 'গত ক্লাসের গণিত পরীক্ষা', -1, 'published'], ['homework', 'আজকের বাড়ির কাজ', 1, 'published'],
    ['suggestion', 'গণিত সাজেশন ও পড়ার নোট', 0, 'published'], ['routine', 'আজকের সহায়ক গণিত ক্লাস', 0, 'published'], ['exam', 'পরবর্তী ক্লাসের খসড়া পরীক্ষা', 2, 'draft']
  ].map(([type, title, day, status]) => ({
    ...validateActivity({ type, title: `ডেমো: ${title}`, subject: 'গণিত', className: 'দশম শ্রেণি', group: 'বিজ্ঞান বিভাগ', date: date(day), time: type === 'routine' ? '16:00' : '18:00', duration: 60, totalMarks: 100, status, room: 'রুম ২০৩', details: 'বীজগণিতের প্রথম অধ্যায় পড়বে। অনুশীলনী ১-এর প্রশ্ন সমাধান করবে। এটি অ্যাপ চেক করার নমুনা কাজ।', resourceURL: '' }),
    id: `DEMO-ACT-${type}-${status}`, teacherId: DEMO_TEACHER.id, teacherName: DEMO_TEACHER.name, createdAt: timestamp, updatedAt: timestamp,
    progress: status === 'draft' || type === 'suggestion' ? {} : Object.fromEntries(['AP-1024', '260810021'].map((id, i) => [id, { value: type === 'exam' ? 85 + i * 5 : type === 'homework' ? (i ? 'done' : 'pending') : (i ? 'late' : 'present'), updatedAt: timestamp }])), demoFixture: true
  }));
}
