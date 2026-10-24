# Active Plus — ফায়ারবেস অডিট রিপোর্ট (নতুন করে, রাউন্ড ৬)

তারিখ: ২০২৬-০৯-২৯ · ব্রাঞ্চ: `arena/01a0eacc-apc` · **PR #31 মার্জ হয়েছে — `main` = `024f72f`; লাইভ Pages সাইট (`ajfrinch-ctrl.github.io/apc`) এই সংস্করণই দেখাচ্ছে**

আগের রাউন্ড-৪ অডিট (`AUDIT.md`) পুরো অ্যাপের ছিল; এই রিপোর্টটি সম্পূর্ণ **ফায়ারবেস স্তরের** —
Realtime Database সেতু, Firestore নিয়ম, Cloud Functions, push, App Check/CSP ও ডিপ্লয় অ্যাসেট।

---

## ১. কীভাবে অডিট করা হয়েছে

| ধাপ | কী করা হয়েছে | ফলাফল |
| --- | --- | --- |
| ১ | `firebase.json`, `database.rules.json`, `firestore.rules`, `.firebaserc` (নতুন), `js/firebase-config.js`, `sw.js` — লাইন ধরে পড়া | গঠন ঠিক; **দুটি ডিপ্লয়মেন্ট ফাঁদ** পাওয়া গেছে (নিচে F4, F5) |
| ২ | `js/realtime-sync.js` (সম্পূর্ণ), `js/record-sync.js`, `js/sync-collections.js`, `js/realtime-value-codec.js`, `js/username-sync-codec.js`, `js/sync-status.js`, `js/notification-rules.js`, `js/push-notifications.js` — পড়া | প্রতিটি ক্লাউড পথ চিহ্নিত; **তিনটি ওয়্যার-ঝুঁকি** পাওয়া গেছে (F1, F2, F3) |
| ৩ | স্ট্যাটিক প্রোব `fbaudit/probe.mjs` — codec round-trip, RTDB কী-নিয়ম, push-token কী, পাথ-লিটারাল স্ক্যান | codec round-trip সব পাস; কী-নিয়মে ৩টি ব্যর্থতা (কৃত্রিম হোস্টাইল ইনপুটে) |
| ৪ | `functions/index.js`, `functions/notification-payload.js`, `functions/package.json` — সম্পূর্ণ পড়া; `firebase-functions` v6-এ `onValueWritten` আছে কি না যাচাই (6.6.0 tarball) | API বৈধ; region ডেটাবেসের সাথে মেলে (`us-central1`); মৃত টোকেন নিজে থেকে মুছে যায় |
| ৫ | দুটি ডিভাইসে **আসল অ্যাপ কোড** + মক Realtime Database (jsdom) — নতুন টেস্ট `tests/firebase-hardening.test.mjs` | ৫/৫ পাস; এবং **ফিক্স ফিরিয়ে নিয়ে প্রমাণ করা হয়েছে টেস্টগুলো আগের কোডে ব্যর্থ হয়** |
| ৬ | সম্পূর্ণ টেস্ট স্যুট | **৪০৭/৪০৭ পাস**, ব্যর্থ ০ |

মক Realtime Database-কে এই রাউন্ডে আরও কঠোর করা হয়েছে: আসল সার্ভিস যেমন **পাথের অংশ**ও
যাচাই করে (`.` `#` `$` `[` `]` থাকলে সাথে সাথে প্রত্যাখ্যান), মকও এখন তাই করে — তাই মক-টেস্টে
আর কোনো "নিষিদ্ধ পাথ চুপচাপ কাজ করে যায়" না।

---

## ২. যা পাওয়া গেছে এবং ঠিক করা হয়েছে

### F1 — নিষিদ্ধ অক্ষরের একটি রেকর্ড পুরো সেতু বন্ধ করে দিত (উচ্চ ঝুঁকি) → **ঠিক**

Realtime Database কোনো key-তে `.` `#` `$` `[` `]` `/` বা control character মানে না — এবং শুধু
*মান* নয়, **পাথও** যাচাই করে। অর্থাৎ `examDb/exams/EXAM.260929` ভ্যালু দেখার আগেই প্রত্যাখ্যাত।

বেশির ভাগ কালেকশন নিরাপদ, কারণ সেতু প্রতিটি রেকর্ড-কী শতাংশ-এনকোড করে
(`js/realtime-value-codec.js`)। কিন্তু তিনটি পথ অ্যাপের অবজেক্ট **যেমন আছে তেমনই** লিখে:

- চারটি স্টাফ রোল অ্যাকাউন্ট (`staffAccounts/<role>`),
- শিক্ষার্থীর লগইন রেকর্ড (`studentAccounts/<id>`),
- পরীক্ষার ডেটাবেস (`examDb/exams/<id>`, `examDb/attempts/<id>`)।

আমদানি করা বা হাতে-সম্পাদিত একটি রেকর্ডে এ রকম কী থাকলে (যেমন `.`-যুক্ত exam id, বা
`answers`/`marks`/`results` ম্যাপে `.`-যুক্ত কী) আগে **লেখাটাই ব্যর্থ হত**, আর স্টার্টআপের
batch একসাথে await করা ছিল বলে পুরো সেতু abort করত: ওই ডিভাইসে স্টাফ অ্যাকাউন্টই লোড হত না,
ক্রস-ডিভাইস লগইন বন্ধ, আর কারণ কেবল কনসোলে।

**সমাধান** (`js/rtdb-keys.js` + `js/realtime-sync.js`):

- প্রতিটি raw-path লেখার আগে রেকর্ড যাচাই হয় — id সহ (id-ই তো পাথ-সেগমেন্ট) ও ভেতরের সব key;
- যে রেকর্ড লেখা যাবে না, সেটি **ডিভাইসেই থাকে**, আর স্ট্যাটাস-বারে স্পষ্ট বাংলা বার্তা আসে:
  *"একটি রেকর্ডে ফায়ারবেস-নিষিদ্ধ অক্ষর (. # $ [ ] /) আছে — সেটি বাদে বাকি সব সিঙ্ক হয়েছে"*;
- পরীক্ষার মিররে একটি খারাপ রেকর্ড **একই push-এর বাকি রেকর্ডগুলো** আটকায় না;
- ডিভাইসে কী-টি ঠিক করলে পরের লেখাতেই সংশোধিত রেকর্ড ক্লাউডে চলে যায় — reload লাগে না।

### F2 — একটি ব্যর্থ task পুরো sync startup বাতিল করত (উচ্চ ঝুঁকি) → **ঠিক**

স্টার্টআপে সব কালেকশন/অ্যাকাউন্ট/পরীক্ষা একসাথে `await` করা হত; `Promise.allSettled` থাকা
সত্ত্বেও **প্রথম rejection-এই throw** করা হত। ফলে ওপরের F1-এর মতো একটি ঘটনা (বা নিয়ম-ফাঁক,
বড় কালেকশন) পুরো ব্রিজ মেরে দিত — অথচ একই ডিভাইসের বাকি সব ডেটা সিঙ্কযোগ্য ছিল।

এখন শুধু **সম্পূর্ণ ব্যর্থতা** (প্রত্যেকটি task ব্যর্থ = ক্লাউডেই পৌঁছানো যাচ্ছে না) ব্রিজ বন্ধ করে
ও স্ট্যাটাসে ত্রুটি দেখায়; আংশিক ব্যর্থতা কেবল রিপোর্ট হয়, ব্রিজ চালু থাকে।

### F3 — push-token-এর স্লট সংঘর্ষ: `dev.1` ≡ `dev-1` (মাঝারি ঝুঁকি) → **ঠিক**

`tokenPathKey()` নিষিদ্ধ অক্ষরকে `-` দিয়ে বদলাত, ফলে ভিন্ন দুটি ডিভাইস আইডি একই নোড-নাম পেত
(`dev.1|camera:…` আর `dev-1|camera:…`) — একটি ডিভাইসের টোকেন আরেকটির উপর লিখে যেত, অর্থাৎ
একটি ফোন নোটিফিকেশন পেত না। এখন শতাংশ-এনকোডিং (`%` → `~`, readability-র জন্য), তাই প্রতিটি
ডিভাইস/রোল আলাদা স্লট পায়; পুরোনো এনকোডিং-এর টোকেন থেকে গেলে শুধু নতুন নামে জমা হবে
(`NOTIFICATIONS.md`-এ লেখা)।

### F4 — ডিপ্লয় টার্গেট ফাইল ছিল না → **ঠিক**

`.firebaserc` না থাকলে `firebase deploy --only database` (ডকুমেন্টের ধাপ ৩) CLI-এর সর্বশেষ
নির্বাচিত প্রজেক্টে যায় বা কিছুই করে না — অর্থাৎ নিয়ম deploy নাও হতে পারে, আর ব্যবহারকারী
"Permission denied" দেখে ফায়ারবেসে দোষ খুঁজতে থাকেন। এখন `{"projects":{"default":"active-plus"}}`
যোগ করা হয়েছে (`js/firebase-config.js`-এর `projectId`-র সাথে মিলিয়ে)।

### F5 — App Check-এর reCAPTCHA CSP-তে নিষিদ্ধ ছিল → **ঠিক**

পাঁচটি পেজের `Content-Security-Policy` ছিল `script-src 'self' https://www.gstatic.com` — অর্থাৎ
reCAPTCHA-ভিত্তিক App Check (যা `https://www.google.com/recaptcha/` থেকে স্ক্রিপ্ট ও ফ্রেম
লোড করে) পেজেই ব্লক হত। তখন `appCheckReady` টোকেন ছাড়াই resolve করত, আর enforcement চালু
থাকলে **প্রতিটি sync পড়া/লেখা** `Permission denied` হয় — ব্যবহারকারীর কাছে মনে হত "সিঙ্ক
ভাঙা", কারণটা সম্পূর্ণ অন্য জায়গায়। এখন `script-src`-এ `google.com/recaptcha/` ও
`gstatic.com/recaptcha/`, আর `frame-src 'self' https://www.google.com/recaptcha/` যোগ করা
হয়েছে (`js/firebase-config.js` ও `FIREBASE_SETUP.md`-এ এই ফাঁদের কথা লেখা থাকল, যেন CSP আবার
কষাকষি করলে একই ভুল ফিরে না আসে)।

---

## ৩. যাচাই করে ঠিক পাওয়া (পরিবর্তন লাগেনি)

| দিক | ফল |
| --- | --- |
| নিয়ম (RTDB) | `activePlusSync` ছাড়া আর কোনো পথ নেই; দুটোই `auth != null` |
| অ্যাপের সব পথ | `activePlusSync/v1/*`-এর ভেতরেই (staffAccounts, studentAccounts, usernames, staffDirectory, সাতটি কালেকশন, examDb, pushTokens) |
| Firestore নিয়ম | `users`/`usernameIndex`/`system` শুধু সার্ভার-লেখা; `students` কেবল manager-approval-আকারে, `transactions` admin/payment, `notices`/`exams` রোল-গেটেড |
| গোপনীয়তা | সেতুতে কেবল PBKDF2 **হ্যাশ** যায়; প্লেইন পাসওয়ার্ড/সেশন টোকেন/সিকিউরিটি-উত্তর কখনো নয়; রিপোতে কোনো service-account/private key নেই; লগে সংবেদনশীল ডেটা নেই |
| CSP বাকি অংশ | `connect-src 'self' https: wss:` — Firebase Auth ও Realtime Database-এ যাওয়ার অনুমতি আগেই ছিল; F5-এর বদল কেবল `script-src`/`frame-src`-এ reCAPTCHA যোগ করে, কোনো কিছু বন্ধ করে না |
| আপডেট পৌঁছানোর পথ | service worker network-first, তাই অনলাইনে থাকলে নতুন HTML/module সাথে সাথেই আসে (নিরাপত্তার জন্য cache নাম `v94-firebasehardening`) |
| Functions | `firebase-functions` v6-এ ব্যবহৃত API (`onValueWritten`) সত্যিই আছে (6.6.0-এ যাচাই); region `us-central1` ডেটাবেসের সাথে মেলে; মৃত টোকেন prune হয়; পেলোডে `url` নেই এবং SW `data.url` পড়ে না (ফিশিং-পথ বন্ধ) |
| ডকুমেন্ট | `FIREBASE_SETUP.md`/`NOTIFICATIONS.md` স্তর ৩-কে স্পষ্টভাবে "VAPID কী + Functions deploy বাকি" বলছে — সম্পূর্ণ হয়েছে বলে দাবি করে না |

---

## ৪. সীমা — যা এখনো বাকি (লুকানো হয়নি)

1. **স্টোর-গ্রেড নিরাপত্তা নয়:** ক্লাউড নিয়ম এখনো `auth != null`, অর্থাৎ প্রকল্পের anonymous
   লগইন থাকা যে কেউ `activePlusSync` পড়তে/লিখতে পারে। এটি **ক্রস-ডিভাইস পরীক্ষামূলক সেতু**;
   প্রকৃত সমাধান প্রোডাকশন Firebase Auth/UID মাইগ্রেশন — আলাদা কাজ, এখনো শুরু হয়নি।
2. **পুরোনো নিষিদ্ধ-কী রেকর্ড নিজে থেকে ঠিক হয় না:** সংশ্লিষ্ট রেকর্ডটি ডিভাইসে থেকে যায় এবং
   স্ট্যাটাস-বারে বার্তা দেখায়; ব্যবহারকারীকে ঠিক করতে হবে (এটি ডিজাইনগত — চুপচাপ ডেটা বাদ
   দেওয়া বা মুছে ফেলা হয় না)।
3. **স্তর ৩ push এখনো চালু হয়নি:** `FCM_VAPID_KEY` খালি এবং Cloud Functions deploy হয়নি
   (Blaze plan দরকার) — এগুলো ব্যবহারকারীর কাজ, কোড প্রস্তুত।
4. **মক ≠ আসল ফায়ারবেস:** সব ইন্টিগ্রেশন টেস্ট loopback মকে চলে; আসল ক্লাউডের নিয়ম/App
   Check/কোটা এখান থেকে যাচাই করা যায় না।
5. **লাইভ সাইট এখনো পুরোনো:** GitHub Pages `main` সার্ভ করে; এই ব্রাঞ্চের কাজ লাইভ নয়।
6. **ফাংশন-টেস্ট এখানে চলে না:** `functions/test/firestore-rules.test.js`-এ emulator দরকার;
   এখানে কেবল syntax (`node --check`) যাচাই হয়েছে।

---

## ৫. রিগ্রেশন টেস্ট (প্রতিটি ফিক্সের জন্য)

`tests/firebase-hardening.test.mjs` — ৫টি টেস্ট, আসল অ্যাপ কোড + দুই jsdom ডিভাইস + কঠোর মক:

1. নিষিদ্ধ কী-এর স্তূপ (`.`-যুক্ত exam id, ভেতরে `.`-যুক্ত key — `facts: {'গণিত.q1': …}`,
   `.`-যুক্ত attempt id, student account-এর `results`/`marks`-এ `.`) নিয়েও **ব্রিজ চালু হয়**,
   প্রথম Admin তৈরি হয়, ক্লাউডে ওঠে এবং **লগইন কাজ করে**;
2. একই push-এ খারাপ রেকর্ড বাদ পড়ে, ভালো রেকর্ডগুলো যায়, আর ডিভাইস "ফায়ারবেস-নিষিদ্ধ" বার্তা দেখায়;
3. কী ঠিক করলে reload ছাড়াই সংশোধিত রেকর্ড ক্লাউডে যায়;
4. `js/rtdb-keys.js`-এর রায়: স্বাভাবিক স্টাফ/স্টুডেন্ট রেকর্ড নিরাপদ, `.`-যুক্ত কী ধরা পড়ে,
   `id` নিজেও যাচাই হয়, আর **মানের ভেতরের** `.` (যেমন `'ক.খ'`) কখনো বাধা নয়;
5. `.firebaserc` প্রজেক্ট মিল + পাঁচ পেজের CSP-তে reCAPTCHA সোর্স উপস্থিত (F4/F5 যেন নীরবে
   মুছে না যায়)।

**অডিটের ধরা একটি নিজস্ব ভুল:** `?v=` স্ট্যাম্প এক জায়গায় বদলে বাকি পাঁচ জায়গায় না বদলালে
একই মডিউলের দুই কপি লোড হত (দুই সেতু, দুই অবস্থা) — `sync-module-single-instance` টেস্ট সাথে সাথে
ধরেছে, এবং সব importer-এ স্ট্যাম্প এক করা হয়েছে।

**প্রমাণ যে টেস্টগুলো সত্যিই ফিক্স ধরে:** F1/F2 কোড আগের অবস্থায় ফিরিয়ে চালানো হলে টেস্ট ১ ও ২
ব্যর্থ হয় — ডিভাইস বলে *"sync did not start: sync-failed"* (অর্থাৎ পুরো ব্রিজ বন্ধ)। ফিক্স ফিরিয়ে
দিলে ৫/৫ পাস। লগ: `/home/user/fbaudit/` (প্রোব) ও `npm test` আউটপুট।

সম্পূর্ণ স্যুট: **৪০৭/৪০৭ পাস** (আগের ৪০২ + ৫টি নতুন), ব্যর্থ ০।

---

## ৬. পরিবর্তিত ফাইল

| ফাইল | কী |
| --- | --- |
| `js/rtdb-keys.js` (নতুন) | RTDB কী-নিয়ম: `unsafeKeyPath()` (ভেতরের key ধরে), `isRtdbKey()` (id/পাথ-সেগমেন্ট ধরে) |
| `js/realtime-sync.js` | তিন raw-path গার্ড + startup isolation + আংশিক ব্যর্থতা রিপোর্ট |
| `js/sync-status.js` | `unsafe-record` বার্তা |
| `js/notification-rules.js` | `tokenPathKey()` ইনজেক্টিভ এনকোডিং |
| `.firebaserc` (নতুন) | ডিপ্লয় টার্গেট `active-plus` |
| `index.html`, `admin.html`, `manager.html`, `teacher.html`, `payment.html` | CSP: reCAPTCHA `script-src`/`frame-src` |
| `js/firebase-config.js`, `FIREBASE_SETUP.md`, `NOTIFICATIONS.md` | F1/F3/F4/F5-এর ব্যাখ্যা ও সতর্কতা |
| `sw.js` | cache `v94-firebasehardening` + `js/rtdb-keys.js` app shell-এ |
| `js/realtime-sync-entry.js`, `js/login.js`, `js/push-notifications.js`, `js/register.js`, `js/staff-directory.js` | বদলানো মডিউলের `?v=20260929-fbaudit` স্ট্যাম্প — **সব import-এ একই** (ভিন্ন স্ট্যাম্প মানে দুইটি আলাদা module instance; `tests/sync-module-single-instance.test.mjs` এটাই ধরে ফেলেছিল, তখন ঠিক করা হয়েছে) |
| `tests/firebase-hardening.test.mjs` (নতুন) | ৫টি রিগ্রেশন টেস্ট |
| `tests/two-device-harness.mjs`, `tests/two-device-child.mjs`, `tests/child-quiet-hook.mjs` (নতুন), `tests/notification-rules.test.mjs` | কঠোর মক পাথ-যাচাই, নতুন helper কমান্ড, injective token-key টেস্ট |
