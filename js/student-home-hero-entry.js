import { initHomeHero } from './home-hero.js?v=379';

export const STUDENT_HOME_HERO_SLIDES = Object.freeze([
  {
    id: 'own-pace',
    title: 'নিজের ছন্দে',
    description: 'অন্যের সঙ্গে নয়, গতকালের নিজের সঙ্গে প্রতিযোগিতা করো।',
    image: 'assets/student-home-hero/hero-own-pace.webp?v=379',
    imageAlt: 'বাংলাদেশি ছাত্র খোলা বই পড়ছে আর পাশে ছাত্রী নোট লিখছে; টেবিলে বই, পেন্সিল বক্স ও স্কুলব্যাগ।'
  },
  {
    id: 'daily-goal',
    title: 'আজকের লক্ষ্য',
    description: 'আজ অন্তত ২০ মিনিট মনোযোগ দিয়ে পড়ার চেষ্টা করো।',
    image: 'assets/student-home-hero/hero-daily-goal.webp?v=379',
    imageAlt: 'বাংলাদেশি স্কুলছাত্রী খোলা বইয়ের পাশে ঘড়ি রেখে চেকলিস্টে টিক দিচ্ছে ও পড়ার পরিকল্পনা লিখছে।'
  },
  {
    id: 'joy-of-learning',
    title: 'শেখার আনন্দ',
    description: 'প্রতিটি নতুন বিষয় তোমাকে আরও দক্ষ করে তুলছে।',
    image: 'assets/student-home-hero/hero-joy-of-learning.webp?v=379',
    imageAlt: 'বাংলাদেশি ছাত্র ও ছাত্রী খোলা বইয়ের বিজ্ঞানচিত্র নিয়ে আলোচনা করছে; টেবিলে খাতা ও পেন্সিল বক্স।'
  },
  {
    id: 'daily-tip',
    title: 'আজকের পরামর্শ',
    description: 'পড়ার পর বই বন্ধ করে নিজের ভাষায় বিষয়টি মনে করার চেষ্টা করো।',
    image: 'assets/student-home-hero/hero-daily-tip.webp?v=379',
    imageAlt: 'বাংলাদেশি ছাত্র পাশে বন্ধ বই রেখে নিজের ভাষায় মনে করে খাতায় নোট লিখছে।'
  }
]);

if (typeof document !== 'undefined') {
  for (const root of document.querySelectorAll('[data-student-home-hero]')) {
    initHomeHero(root, { slides: STUDENT_HOME_HERO_SLIDES });
  }
}
