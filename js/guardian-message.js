/* Only a wa.me draft URL. No automatic message or server-side delivery. */
import { taka } from './money.js';
export function guardianDraft(student, topic, detail = '') {
  const mobile = String(student?.guardianMobile || '').replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)).replace(/\D/g, '');
  const phone = /^01[3-9]\d{8}$/.test(mobile) ? `88${mobile}` : /^8801[3-9]\d{8}$/.test(mobile) ? mobile : '';
  if (!phone) throw new Error('অভিভাবকের সঠিক মোবাইল নম্বর নেই।');
  const name = String(student.name || student.nameBn || 'শিক্ষার্থী').slice(0, 80);
  const messages = {
    absence: `${name} আজ অনুপস্থিত ছিলেন। বিস্তারিত জানতে প্রতিষ্ঠানে যোগাযোগ করুন।`,
    result: `${name}-এর নতুন ফলাফল প্রকাশিত হয়েছে। বিস্তারিত শিক্ষার্থী প্যানেলে দেখুন।`,
    due: detail === '' || detail == null ? `${name}-এর ফি/বকেয়ার তথ্য শিক্ষার্থী প্যানেলে দেখে নিন। বিস্তারিত জানতে প্রতিষ্ঠানে যোগাযোগ করুন।` : `${name}-এর বকেয়া ফি ৳${taka(detail)}। বিস্তারিত জানতে প্রতিষ্ঠানে যোগাযোগ করুন।`
  };
  if (!Object.hasOwn(messages, topic)) throw new Error('বার্তার ধরন সঠিক নয়।');
  return `https://wa.me/${phone}?text=${encodeURIComponent(`Active Plus Coaching: ${messages[topic]} (এটি খসড়া; পাঠানোর আগে যাচাই করুন।)`)}`;
}
