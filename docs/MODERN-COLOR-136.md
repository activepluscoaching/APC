# আধুনিক রঙের স্তর (136)

তারিখ: ২০২৬-১০-০১

## কেন

"এপটা দেখতে কিছুটা পুরাতন পুরাতন লাগে" — ফ্ল্যাট বেসলাইনে সাদা কার্ড, ধূসর বাটম-নেভ আর
সমতল নীল অ্যাকসেন্ট ছাড়া রং ছিল না; ডার্ক থিমে টাইলগুলো প্রায় ব্যাকগ্রাউন্ডের মতোই কালো।
প্যালেটে `--tone-*` ক্লাসগুলো ছিল, কিন্তু CSS-এ সেগুলো কখনো বসানো হয়নি।

## কী যোগ হলো (`css/ui-interior.css` § 3, `css/foundation.css`)

| # | উপাদান | কী |
| --- | --- | --- |
| 3a | সেকশন শিরোনাম | বাঁয়ে ৪px ব্র্যান্ড বার (`primary → brand-2`), `.eyebrow` এখন ব্র্যান্ড নীল |
| 3b | হিরো কার্ড | ব্র্যান্ড ওয়াশ: `.study-progress-card`, `.admin-hero`, `.teacher-summary`, `.pay-search-card`, `.finance-search-card`, `.rc-head`, `.learning-summary`, `.recovery-summary` |
| 3c | টাইল | `.admin-stat-tile`/`.admin-feature-tile`/`.dash-finance-tile`/`.admin-stat`/`.pay-pulse-tile`-এ `::before` টোন ওয়াশ + আইকনে টোন; `tone-*` ক্লাস ও nth-child সাইকেল |
| 3d | স্ট্যাট আইকন | ছাত্র ড্যাশবোর্ডের ৩টি স্ট্যাটে নীল/অ্যাম্বার/মিন্ট |
| 3e | অগ্রগতি | `.progress-ring` এখন রিং গেজ (conic-gradient + ভেতরে ডিস্ক), `--progress` অপরিবর্তিত |
| 3f | নেভিগেশন/ব্যাজ | অ্যাক্টিভ ট্যাবে গ্রেডিয়েন্ট চিপ + গ্লো; চিপ/ব্যাজে টোন ওয়াশ |
| 3g | প্রাইমারি বাটন | একটাই ব্র্যান্ড গ্রেডিয়েন্ট + রঙিন গ্লো (গ্লাস ব্লকের পুরোনো ভাড়া করা গ্রেডিয়েন্ট সরানো) |

## নিয়ম (গার্ড: `tests/modern-color.test.mjs`)

- **শুধু `background-image`** — `background-color` নয়। তাই গ্লাসের `.62` সাদা প্যান বা
  ফ্ল্যাট `--color-surface` অটুট থাকে; রং তার উপরের স্তর।
- দুই থিমেই টোকেন (`--brand-2`, `--tone-*`, `--tone-*-soft`, `--ring-track`); AMOLED-এ
  উজ্জ্বল, লাইটে গাঢ় — `--accent-glow`/`--card-glow` শ্যাডোও থিম-নির্দিষ্ট।
- nested CSS নেই (পুরোনো WebView), `@media screen`-এর ভেতরে (প্রিন্ট ফ্ল্যাট), এবং
  `prefers-reduced-transparency` শুধু ট্রান্সপারেন্সি সরায় — রং থাকে।
- রঙের স্তর **লেআউট ছোঁয় না** — বাটন-সারির গ্রিড এখনও `css/ui-forms.css`-এর স্কুল নিয়ম।

## যাচাই

- `npm test` → ৬০৯/০ (৬০৫ + নতুন ৪)।
- Chromium (৩৯০px লাইট/AMOLED, ৩২০px AMOLED): `scrollWidth` = ভিউপোর্ট (কোনো
  আড়াআড়ি স্ক্রল নেই), টাইলের আইকন টোন রঙে (`rgb(14,159,110)` লাইট / `rgb(84,224,164)` AMOLED),
  লেবেল কনট্রাস্ট ১১.২:১, অ্যাক্টিভ নেভ চিপে গ্রেডিয়েন্ট, শিরোনাম বার বসেছে।
- ছবি: `preview/modern-{student,admin}-{light,amoled}.png`, `preview/modern-student-320.png`,
  `preview/modern-manager-amoled.png`, `preview/modern-payment-amoled.png`,
  `preview/modern-teacher-light.png`।
- ক্যাশে **136**।
