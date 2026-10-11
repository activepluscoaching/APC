/* Additive, deterministic demo fixtures. Existing records and edits always win. */
export function populateRoleDemo(db) {
  const now = new Date();
  const date = days => new Date(now.getTime() + days * 86400000).toISOString();
  const add = (table, row) => { if (!db[table].some(existing => existing.id === row.id)) db[table].push(row); };
  const names = ['আয়েশা আক্তার', 'রাফি হাসান', 'নুসরাত জাহান', 'সাদমান ইসলাম', 'মারিয়া সুলতানা', 'তানভীর আহমেদ', 'সুমাইয়া রহমান', 'ইশরাত জাহান'];
  const subjects = ['বাংলা', 'ইংরেজি', 'গণিত', 'বিজ্ঞান'];
  const days = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার'];
  const titles = { 6: 'ষষ্ঠ', 7: 'সপ্তম', 8: 'অষ্টম', 9: 'নবম', 10: 'দশম', 11: 'একাদশ', 12: 'দ্বাদশ' };
  const teacher = db.accounts.find(a => a.id === 'teacher');
  const counter = db.accounts.find(a => a.id === 'payment');
  for (let grade = 6; grade <= 12; grade++) for (const section of ['A', 'B']) {
    const classId = section === 'A' && [8, 9].includes(grade) ? `class-${grade}` : `demo-class-${grade}-${section}`;
    const label = `${titles[grade]} শ্রেণি • সেকশন ${section}`;
    add('classes', { id: classId, title: label, section, grade, room: `${grade}0${section === 'A' ? 1 : 2}`, shift: section === 'A' ? 'সকাল' : 'বিকাল', status: 'published' });
    // Do not expand an existing teacher's assignment silently. Demo teacher is
    // assigned these sections only when fixtures create the workspace initially.
    const teacherId = `demo-teacher-${grade}-${section}`;
    add('accounts', { id: teacherId, username: `teacher${grade}${section.toLowerCase()}.demo`, name: `${label} — বিষয় শিক্ষক`, role: 'teacher', active: true, authVersion: 1, classIds: [classId], password: teacher.password });
    const batchTeacher = teacherId;
    for (let i = 0; i < 8; i++) {
      const sid = `demo-student-${grade}-${section}-${i + 1}`;
      const name = `${names[(i + grade) % names.length]} (${grade}${section}-${i + 1})`;
      const status = i === 6 ? 'pending' : i === 7 ? 'rejected' : 'approved';
      add('students', { id: sid, name, classId, section, roll: i + 1, status, monthlyFee: grade >= 11 ? 2500 : grade >= 9 ? 2000 : 1500, mobile: `01700${String(grade * 100 + (section === 'A' ? 10 : 20) + i).padStart(6, '0')}`, guardian: 'ডেমো অভিভাবক', joinedAt: date(-90 + i) });
      add('accounts', { id: `account-${sid}`, studentId: sid, username: `student${grade}${section.toLowerCase()}${i + 1}.demo`, name, role: 'student', active: true, authVersion: 1, classIds: [], password: db.accounts.find(a => a.id === 'student').password });
      if (status !== 'approved') continue;
      for (let month = 0; month < 3; month++) {
        const createdAt = date(-month * 30 - i);
        const approved = month > 0 || i % 2 === 0;
        add('payments', { id: `demo-payment-${sid}-${month}`, studentId: sid, counterId: counter.id, amount: month === 0 ? 500 + i * 100 : 1500, month: createdAt.slice(0, 7), feeType: 'মাসিক বেতন', method: i % 2 ? 'বিকাশ' : 'নগদ', status: approved ? 'approved' : 'pending', createdAt, ...(approved ? { reviewedBy: 'manager', reviewedAt: createdAt } : {}) });
      }
      for (let day = 1; day <= 5; day++) add('attendance', { id: `demo-attendance-${sid}-${day}`, title: day === 3 && i % 3 === 0 ? 'অনুপস্থিত — অভিভাবককে জানানো হয়েছে' : 'উপস্থিত', date: date(-day).slice(0, 10), classId, studentId: sid, authorId: batchTeacher, status: 'published' });
      add('feedback', { id: `demo-feedback-${sid}`, title: i % 2 ? 'ইংরেজি শব্দভাণ্ডারে উন্নতি প্রয়োজন। প্রতিদিন ১০টি শব্দ অনুশীলন করবে।' : 'নিয়মিত উপস্থিতি ও গণিতে ভালো অগ্রগতি। পরবর্তী মূল্যায়নের জন্য প্রস্তুত।', classId, studentId: sid, authorId: batchTeacher, status: 'published' });
      for (let subject = 0; subject < subjects.length; subject++) {
        add('results', { id: `demo-result-${sid}-${subject}`, title: `${subjects[subject]} — মাসিক মূল্যায়ন`, classId, studentId: sid, authorId: batchTeacher, marks: 55 + (grade + i * 7 + subject * 3) % 43, status: subject === 3 ? 'pending' : 'published', ...(subject === 3 ? {} : { reviewedBy: 'manager', publishedAt: date(-2) }) });
        add('submissions', { id: `demo-submission-${sid}-${subject}`, assignmentId: `demo-assignment-${classId}-${subject}`, studentId: sid, classId, answer: `${subjects[subject]} অনুশীলন সম্পন্ন করেছি। সমাধান ও প্রয়োজনীয় ব্যাখ্যা সংযুক্ত ডেমো উত্তর।`, status: i % 2 ? 'submitted' : 'graded', ...(i % 2 ? {} : { marks: 70 + i * 3 }) });
      }
    }
    subjects.forEach((subject, i) => {
      add('routines', { id: `demo-routine-${classId}-${i}`, title: `${days[i]} • ${section === 'A' ? 'সকাল ৯' : 'বিকাল ৪'}:${i % 2 ? '৩০' : '০০'} — ${subject}`, classId, authorId: 'manager', status: 'published', teacher: `${label} বিষয় শিক্ষক`, room: `${grade}0${section === 'A' ? 1 : 2}` });
      add('assignments', { id: `demo-assignment-${classId}-${i}`, title: `${subject}: অধ্যায় ${i + 2}-এর অনুশীলনী ১–১০ সমাধান`, classId, authorId: batchTeacher, status: 'published', dueAt: date(i + 2) });
      add('exams', { id: `demo-exam-${classId}-${i}`, title: `${subject} — ${i % 2 ? 'সাপ্তাহিক পরীক্ষা' : 'মাসিক মূল্যায়ন'}`, classId, authorId: batchTeacher, status: i === 3 ? 'pending' : 'published', totalMarks: 100, durationMinutes: 60, scheduledAt: date(i + 1), ...(i === 3 ? {} : { reviewedBy: 'manager', publishedAt: date(-1) }) });
    });
    add('notices', { id: `demo-notice-${classId}-1`, title: `${label}: আগামী সাপ্তাহিক পরীক্ষায় সব অধ্যায়ের সূত্র ও গুরুত্বপূর্ণ প্রশ্ন প্রস্তুত করবে।`, classId, authorId: batchTeacher, status: 'published' });
    add('notices', { id: `demo-notice-${classId}-2`, title: `${label}: অভিভাবক সভা আগামী শুক্রবার বিকাল ৪টায়।`, classId, authorId: 'manager', status: 'published' });
  }
  // Keep the original five demonstration logins useful, without giving the
  // original Teacher extra class permissions or exposing other pupils to Student.
  const own = db.students.find(s => s.id === 'student-1');
  if (own) {
    ['attendance', 'feedback', 'results', 'submissions'].forEach(table => {
      db[table].filter(r => r.studentId === 'demo-student-8-A-1').forEach((row, index) => add(table, { ...row, id: `demo-own-${table}-${index}`, studentId: own.id, authorId: teacher.id }));
    });
    subjects.forEach((subject, i) => {
      add('assignments', { id: `demo-own-assignment-${i}`, title: `${subject} — নিজে অনুশীলন করো`, classId: own.classId, authorId: teacher.id, status: 'published', dueAt: date(i + 3) });
      add('payments', { id: `demo-own-payment-${i}`, studentId: own.id, counterId: counter.id, amount: 1000 + i * 100, month: date(-30 * (i + 1)).slice(0, 7), status: 'approved', createdAt: date(-30 * (i + 1)), reviewedBy: 'manager', reviewedAt: date(-29 * (i + 1)) });
    });
  }
  add('notices', { id: 'demo-global-notice', title: 'কোচিং অফিস খোলা: সকাল ৮টা–রাত ৮টা। পরীক্ষার সময়সূচি নিয়মিত দেখুন।', classId: 'all', authorId: 'manager', status: 'published' });
  add('audit', { id: 'demo-fixtures-v1', actorId: 'admin', role: 'admin', action: 'demo.populate', target: 'all classes and sections', at: now.toISOString() });
  return Object.fromEntries(['classes', 'students', 'accounts', 'payments', 'notices', 'routines', 'assignments', 'submissions', 'exams', 'results', 'attendance', 'feedback'].map(table => [table, db[table].length]));
}
