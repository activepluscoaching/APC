# নোটিফিকেশন পপ-আপ রিডিজাইন (135)

তারিখ: ২০২৬-১০-০১

## যা বদলেছে

নতুন নোটিশ এলে আগে পর্দার নিচে একটা কার্ড বসত — পেছনের কিছুই ব্লার হত না, আর কোনো
নিশ্চিতকরণ বাটন ছিল না (শুধু × আর "সব দেখুন")। এখন:

1. **ব্লার করা ব্যাকড্রপ** — পপ-আপের পেছনে `.apc-alert-backdrop` (`background:
   var(--modal-backdrop)` + গ্লাস স্কিনের `backdrop-filter: blur(var(--glass-blur-thin))` (৬px লাইট / ৮px AMOLED)), তাই টপবার,
   ড্যাশবোর্ড কার্ড ও বটম-নেভ ঝাপসা হয়ে যায়। `prefers-reduced-transparency` বা
   প্রিন্টে ব্লার বন্ধ, শুধু ডিম থাকে।
2. **ক্যান্সেল ও বুঝেছি** — প্রতিটি অবস্থাতেই (নতুন খবর, "নোটিফিকেশন বন্ধ" ব্যাখ্যা)
   নিচে দুই-কলামের অ্যাকশন সারি। দুটোই পপ-আপ বন্ধ করে, খবর ইনবক্সে থেকে যায়।
   `সব দেখুন` তার উপরে পুরো সারি জুড়ে।
3. **আইকন** — হেডারে + প্রতি সারিতে; স্প্রাইট না থাকলে `js/icons.js`-এর নিজস্ব path
   থেকে একই গ্লিফ আঁকা হয়, তাই ফাঁকা বর্গা আর দেখা যায় না।
4. **বন্ধ থাকার ব্যাখ্যা পপ-আপে** — `showInfo('denied'|'disabled'|'unsupported')`
   (`window.apcNoticeCenter.showInfo`)। `js/notifications.js`-এর পিল এখন ব্যাখ্যা
   বার-নোটে না দিয়ে এই পপ-আপ খোলে; নোটিফিকেশন বন্ধ করার পরেও একই শিট আসে।
5. **কিবোর্ড/ট্যাপ** — `Escape`, ব্যাকড্রপে ট্যাপ, `×`, `ক্যান্সেল`, `বুঝেছি` — সবই বন্ধ করে।
   `role="dialog"`, `aria-modal="true"`, `aria-labelledby="apcAlertTitle"`.

## ফাইল

| ফাইল | কী |
| --- | --- |
| `css/ui-features.css` | পপ-আপ, ব্যাকড্রপ, হেডার, সারি, দুই-উত্তরের অ্যাকশন সারি |
| `css/ui-interior.css` | ব্যাকড্রপে ব্লার + ভেতরের চিপে কাচ; কম-স্বচ্ছতা/প্রিন্ট fallback |
| `js/notice-center.js` | `ensureAlertShell`/`paintAlerts`/`showInfo`, ইভেন্ট, `showInfo` API |
| `js/notifications.js` | পিলের ক্লিক ও `disableNotifications()` এখন `explainOff()` দিয়ে পপ-আপ খোলে |
| `tests/notification-inapp.test.mjs` | +৩ টেস্ট: দুই বাটন ও ব্যাকড্রপ, বুঝেছি/Escape, বন্ধ-অবস্থার পপ-আপ |

## যাচাই

- `npm test` → **৬০৫/০** (আগে ৬০২/০; নতুন ৩টি টেস্ট যোগ হয়েছে)।
- ব্রাউজারে (Chromium, 390px ও 320px, লাইট + AMOLED): ব্যাকড্রপ `blur(6px)` (লাইট), শিটের
  প্রস্থ 366/296px, বাটন প্রতিটি অর্ধ-সারি 162/127px, উচ্চতা 44px, `scrollWidth` =
  ভিউপোর্ট (কোনো আড়াআড়ি স্ক্রল নেই)।
- ছবি: `preview/popup-light.png`, `preview/popup-amoled.png`, `preview/popup-320.png`,
  `preview/popup-off-light.png`, `preview/popup-off-amoled.png`।
- ক্যাশে ভার্সন **135** (`sw.js` + ছয়টি পেজের `?v=135`)।
