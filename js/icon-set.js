export const ICON_SET = 'active-plus-soft3d';
export const ICON_SET_VERSION = 2;

const ink = 'var(--icon-outline, currentColor)';
const color = name => `var(--icon-${name}, currentColor)`;
const p = (d, fill = 'none', extra = '') => `<path d="${d}" fill="${fill === 'none' ? fill : color(fill)}" ${extra}/>`;
const r = (x, y, width, height, fill, radius = 2, extra = '') => `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${color(fill)}" ${extra}/>`;
const c = (x, y, radius, fill, extra = '') => `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color(fill)}" ${extra}/>`;
const st = (d, paint = 'outline', width = 1.25) => `<path d="${d}" fill="none" stroke="${color(paint)}" stroke-width="${width}"/>`;
const a = content => `<g stroke="${ink}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">${content}</g>`;
const check = (d = 'm15 17 1.7 1.7 3.5-3.7') => st(d, 'on-color', 1.6);
const person = (x, y, shirt = 'blue') => c(x, y, 2.8, 'paper') + p(`M${x-4.6} ${y+8.3}v-1.3a4.6 4.6 0 0 1 9.2 0v1.3Z`, shirt);

export const ILLUSTRATIONS = Object.freeze({
  home: a(p('m2 11 10-8.4L22 11','blue')+p('M4.4 10.7v9.6q0 1.2 1.2 1.2h12.8q1.2 0 1.2-1.2v-9.6','paper')+r(9.3,14,5.4,7.5,'mint',1.4)+r(6.2,11.7,3.2,2.9,'blue-back',.8)+c(13,17.6,.35,'paper','stroke="none"')),
  dashboard: a(r(2.8,3.2,7.5,7.5,'blue',2.1)+r(13.3,3.2,7.5,7.5,'mint',2.1)+r(2.8,13.5,7.5,7.5,'gold',2.1)+r(13.3,13.5,7.5,7.5,'paper',2.1)+st('M5.2 7h2.7M17 5.6v2.7M15.6 7h2.8','on-color')+p('m5.2 17.3 1.2 1.2 1.7-2','none')+st('M15.5 18.5v-2M17.8 18.5v-3','blue')),
  book: a(p('M3.2 5.4h7.9l2.2 2v13.2H5.2a2 2 0 0 1-2-2Z','blue-back')+r(6,3.3,14.8,17.6,'blue',2)+p('M6 17.6h13.4v3.3H7.8a1.7 1.7 0 0 1 0-3.3','paper')+p('M14.8 3.3h3.1v7l-1.55-1.5-1.55 1.5Z','mint','stroke="none"')+st('M9.2 7.5h3M9.2 10.2h3','on-color',1.4)),
  classes: a(r(2.5,3.5,19,13.7,'blue',2.2)+r(4.7,5.7,14.6,8.7,'mint-back',1)+st('M7.2 9h4.5M7.2 11.8h7.8','outline')+p('M8.2 17.2 6.7 21M15.8 17.2l1.5 3.8','none')+st('M10.2 19.4h3.6')+r(15.8,12.8,4.4,2.1,'gold',.7)),
  teacher: a(r(8.8,3.4,12.5,12.5,'mint',1.9)+st('M12 7h6M12 10h3','on-color',1.4)+st('M14.8 15.9V20M11.3 20h7')+person(5.9,10.9,'blue')+st('m9.9 15 2.5-2.8','outline',1.4)),
  users: a(person(6.8,8.3,'mint')+person(17.2,8.3,'blue')+c(12,10,3,'paper')+p('M7 21v-1.5a5 5 0 0 1 10 0V21Z','blue-back')),
  students: a(person(11.2,11.4,'blue')+p('m4 6.5 7.2-3.2 7.2 3.2-7.2 3.2Z','mint')+p('M7.2 8v2.2q4 2.7 8 0V8','mint-back')+st('M18.4 6.5v4.8','outline')+c(18.4,12.1,.75,'gold')+r(15.7,16.6,5.7,4.9,'gold',.8)+st('M17.4 18.7h2.3','outline',1)),
  staff: a(p('M9 4.5V2.8h6v1.7','none')+r(2.8,4.5,18.4,16.5,'paper',2.5)+r(2.8,4.5,18.4,4.3,'blue',2.1)+r(9.2,3.2,5.6,3.4,'mint',1)+c(7.7,12.9,2,'blue-back')+p('M4.8 18v-.8a2.9 2.9 0 0 1 5.8 0v.8Z','mint')+st('M13 12.5h5.3M13 15.2h3.7','blue')),
  user: a(c(12,12,9.1,'blue-back')+c(12,9.1,3.2,'paper')+p('M5.2 18.4a6.8 6.8 0 0 1 13.6 0q-6.8 5.5-13.6 0','blue')+c(19,18.7,3.2,'mint')+check('m17.5 18.7 1 1 1.9-2')),
  calendar: a(r(3,4.7,18,16.3,'paper',2.5)+p('M3 9V7.2a2.5 2.5 0 0 1 2.5-2.5h13A2.5 2.5 0 0 1 21 7.2V9Z','blue')+st('M7.2 2.8v4.3M16.8 2.8v4.3','outline',1.7)+r(6.1,11.8,3.4,3.4,'gold',.8,'stroke="none"')+st('M12.2 12.3h4.6M6.5 17.8h3.4','blue',1.4)+c(18,18.4,4.1,'mint')+check('m15.9 18.4 1.4 1.5 2.8-3')),
  clock: a(c(12,12.3,8.9,'paper')+p('M12 3.4a8.9 8.9 0 0 1 8.9 8.9H12Z','blue-back','stroke="none"')+'<circle cx="12" cy="12.3" r="6.8" fill="none"/>'+st('M12 7.6v4.7l3.4 2','blue',1.8)+c(12,12.3,.8,'mint')+p('m4.2 5-1.5-1.5M19.8 5l1.5-1.5','none')),
  exam: a(r(3.4,3.9,14.5,17.4,'violet',2)+r(5.5,6,10.3,13.2,'paper',.9)+r(7.3,2.5,6.7,4.5,'blue-back',1.4)+st('m7.8 10.3 1 1 1.6-1.9M12.2 10.4h1.6M7.8 14h5.6M7.8 16.7h3.6','blue',1.1)+p('m17.6 11.1 3.2 1.8-5.1 8.5-3.6 1.1-.1-3.6Z','gold')+p('m17.6 11.1 1-1.6a1 1 0 0 1 1.4-.3l1.5.8a1 1 0 0 1 .3 1.4l-1 1.5Z','coral')+st('m12.1 18.9 3.6 2.5','outline',1)),
  mcq: a(r(3.4,2.8,17.2,18.5,'paper',2.3)+p('M3.4 7.2V5.1a2.3 2.3 0 0 1 2.3-2.3h12.6a2.3 2.3 0 0 1 2.3 2.3v2.1Z','blue')+c(7.5,11,1.6,'mint')+c(7.5,16.8,1.6,'blue-back')+st('m6.7 11 .6.6 1.2-1.3','on-color',1)+st('M11.3 11h5.5M11.3 16.8h5.5','blue')),
  result: a(p('M6.8 6.2H3.2v3a4.7 4.7 0 0 0 4.7 4.7M17.2 6.2h3.6v3a4.7 4.7 0 0 1-4.7 4.7','gold')+p('M6.2 3.4h11.6v6.2a5.8 5.8 0 0 1-11.6 0Z','gold')+st('M12 15.4v3.3','outline',1.8)+r(7.3,18.7,9.4,3,'blue',1)+p('m12 5.9 1.1 2.2 2.5.4-1.8 1.7.4 2.5-2.2-1.2-2.2 1.2.4-2.5-1.8-1.7 2.5-.4Z','paper','stroke="none"')),
  attendance: a(person(8.2,7.3,'blue')+p('M3.5 20.7v-4.1a4.7 4.7 0 0 1 9.4 0v4.1Z','blue-back')+r(13.7,6.4,7.6,13.9,'paper',1.5)+p('M13.7 10h7.6V8a1.5 1.5 0 0 0-1.5-1.6h-4.6A1.5 1.5 0 0 0 13.7 8Z','mint')+c(17.5,15.5,2.5,'mint')+check('m16 15.5 1 1.1 2-2.3')),
  notice: a(p('M4.3 8.1h4.8L18.8 4v14l-9.7-4.1H4.3Z','mint')+r(2.4,8.3,4.3,5.4,'blue',1.2)+p('M8.7 13.8 11 21h-4L5 13.8Z','blue')+p('M9.1 8.1v5.8L18.8 18V4Z','paper')+st('M21 7.2 22.3 6M21.4 11h1.5M21 14.8l1.3 1.2','gold',1.5)),
  wallet: a(p('M3.1 8V5.4a2 2 0 0 1 2-2h13.4v6.3','blue-back')+r(7.6,2.5,12.3,9.7,'mint',1.2)+c(13.8,6.9,2,'paper')+st('M10 5.1v3.6M17.6 5.1v3.6','on-color',1)+r(2.8,8,18.4,13.5,'blue',2.5)+r(14.7,12.4,7,5.2,'paper',1.5)+c(17.3,15,.9,'mint','stroke="none"')+st('M5.7 11h4.5','on-color',1.3)),
  receipt: a(p('M5.1 2.6h13.8v19.1l-2.3-1.5-2.3 1.5-2.3-1.5-2.3 1.5-2.3-1.5-2.3 1.5Z','paper')+r(7.5,5.1,9,4.3,'blue',.9)+st('M10.1 7.2h3.8','on-color')+st('M7.7 12.2h3.8M7.7 15.1h5.7','blue')+c(17.7,16.5,3.9,'mint')+check('m15.8 16.5 1.3 1.4 2.6-2.9')),
  reports: a(r(3,3,16,18.5,'paper',2)+r(6,13,2.8,5.5,'blue',.8,'stroke="none"')+r(10.5,10,2.8,8.5,'mint',.8,'stroke="none"')+r(15,7,2.8,11.5,'gold',.8,'stroke="none"')+st('m5.7 9 4.8-2.5 4.7.4 6-4','blue',1.5)+st('m18.2 2.9 3 .1-.6 3','blue',1.5)),
  data: a(p('M3.5 6.4v12.3c0 3.5 17 3.5 17 0V6.4Z','blue')+p('M3.5 12.1c0 3.5 17 3.5 17 0v3.4c0 3.5-17 3.5-17 0Z','mint')+'<ellipse cx="12" cy="6.4" rx="8.5" ry="3.5" fill="var(--icon-paper)"/>'+p('M6.2 6.4c2.2-1.3 9.4-1.3 11.6 0','none')+c(17.3,18.1,.55,'paper','stroke="none"')),
  backup: a(p('M6.1 17.8a4.7 4.7 0 0 1-.9-9.3 6.8 6.8 0 0 1 13.1-1.7 5.6 5.6 0 0 1 .4 11Z','blue-back')+c(12.2,16.7,5.2,'mint')+st('M12.2 19.4v-5.6m-2.1 2.1 2.1-2.1 2.1 2.1','on-color',1.6)),
  settings: a(r(3,3,18,18,'paper',3)+st('M6.2 7.5h11.6M6.2 12h11.6M6.2 16.5h11.6','blue-back',1.6)+c(9,7.5,2,'blue')+c(15,12,2,'mint')+c(10.5,16.5,2,'gold')),
  roles: a(p('m12 2.7 8.3 3.1v6.5c0 5.2-8.3 9.5-8.3 9.5s-8.3-4.3-8.3-9.5V5.8Z','violet')+person(11.2,9.3,'paper')+c(17.4,16.6,2.7,'gold')+st('m17.4 16.6 3.8 4.1M19.4 18.8l1.3-1.2','outline',1.4)),
  shield: a(p('m12 2.7 8.3 3.1v6.5c0 5.2-8.3 9.5-8.3 9.5s-8.3-4.3-8.3-9.5V5.8Z','mint')+p('M12 5.7v12.7c2.6-1.6 5.5-4.3 5.5-6.3V7.7Z','mint-back','stroke="none"')+st('m7.8 11.5 2.6 2.7 5.8-6','on-color',2)),
  assignment: a(p('M2.7 9.3V7a2 2 0 0 1 2-2h5.1l2.1 2.1H20v12.7H4.7a2 2 0 0 1-2-2Z','blue')+r(7.3,2.7,12.3,15.7,'paper',1.7)+st('M10 7.2h6.8M10 10.2h6.8M10 13.2h3.6','blue')+p('M2.7 11.7h18.6l-2 8.9H5.1a2 2 0 0 1-2-1.6Z','gold')+c(18.6,17.9,3.4,'mint')+check('m17 17.9 1.1 1.1 2.1-2.3')),
  approval: a(r(3.2,3,13.7,18.3,'paper',2)+p('M3.2 7.4V5a2 2 0 0 1 2-2h9.7a2 2 0 0 1 2 2v2.4Z','blue')+st('M6.3 11h5.5M6.3 14.2h3.8','blue')+c(17.3,17.6,4.8,'mint')+check('m14.8 17.6 1.7 1.8 3.4-3.7')),
  lock: a(p('M7 10V7.2a5 5 0 0 1 10 0V10','none','stroke-width="2"')+r(4.3,9.3,15.4,12,'blue',2.8)+c(12,13.7,1.6,'gold')+st('M12 15.3v2.6','gold',1.8)),
  key: a(c(7.6,8.3,5,'gold')+c(6.5,7.2,1.5,'paper')+p('m10.7 11.8 7.6 9.5 3.1-2.5-1.9-2.3-1.8 1.3-1.6-2 1.8-1.3-4.3-5.1Z','blue')),
  smartphone: a(r(5.3,2.5,13.4,19.1,'blue',2.6)+r(7.3,5.3,9.4,12.6,'paper',.9)+st('M10.2 4h3.6','on-color',.8)+c(12,19.7,.6,'paper','stroke="none"')+c(12,11.4,3,'mint')+check('m10.4 11.4 1.1 1.2 2.2-2.4')),
  help: a(p('M3 12.8V6.2A3.2 3.2 0 0 1 6.2 3h11.6A3.2 3.2 0 0 1 21 6.2v9.2a3.2 3.2 0 0 1-3.2 3.2H9l-4.8 3v-4','blue-back')+c(12,10.6,6,'paper')+st('M10.1 8.8a2 2 0 0 1 4 0c0 1.8-2 1.6-2 3.3','blue',1.5)+c(12.1,13.8,.55,'blue','stroke="none"')),
  bell: a(p('M5.2 14.8V9.4a6.8 6.8 0 0 1 13.6 0v5.4l2 3H3.2Z','gold')+st('M9.3 20.2a3 3 0 0 0 5.4 0','outline',1.6)+c(18.8,5,3,'mint')+c(18.8,5,.5,'paper','stroke="none"')),
  mail: a(r(2.7,5,18.6,15.5,'paper',2.5)+p('m3.4 6.2 8.6 6.7 8.6-6.7','blue-back')+st('m3.7 19.4 5.8-5.1m10.8 5.1-5.8-5.1','blue')+c(19.3,5.1,3.1,'mint')+check('m17.9 5.1 1 1 1.9-2')),
  phone: a(r(4.8,2.5,14.4,19.1,'mint',2.7)+r(6.8,5.1,10.4,12.9,'paper',1)+st('M10.3 4h3.4','on-color',.8)+p('M9.2 8h2l.7 1.8-1.3.9q.9 2 2.5 2.7l1-1.2 1.8.8v1.9c-4.4.5-7.8-3.3-6.7-6.9','blue')+c(12,19.8,.6,'paper','stroke="none"'))
});

const s = (base, mark) => `<g transform="translate(0 .2) scale(.82)">${ILLUSTRATIONS[base]}</g><circle cx="18" cy="18" r="5.3" fill="var(--icon-paper)" stroke="var(--icon-outline)" stroke-width=".8"/><g fill="none" stroke="var(--icon-blue)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${mark}</g>`;
export const SEMANTIC_ART = Object.freeze({
  'routine-today': s('calendar','<circle cx="18" cy="18" r="2.4"/><path d="M18 13.8v1M18 21v1M14 18h1M21 18h1"/>'),
  'routine-tomorrow': s('calendar','<path d="M14.8 18h6m-2.5-2.5L21 18l-2.5 2.5"/>'),
  'routine-weekly': s('calendar','<path d="M15 16h6M15 18h6M15 20h6M17 15v6M19 15v6"/>'),
  'routine-exam': s('calendar','<path d="m15 20 4-5 2 2-4 4-2 .5Z"/>'),
  'routine-changed': s('calendar','<path d="M15 17a3 3 0 0 1 5-1l1 1m0-2v2h-2M21 19a3 3 0 0 1-5 1l-1-1m0 2v-2h2"/>'),
  'routine-holiday': s('calendar','<path d="M14.5 18a3.5 3.5 0 0 1 7 0h-7M18 15v5q0 2 2 1"/>'),
  'routine-important': s('clock','<path d="M18 14.5v4M18 21h.01"/>'),
  'routine-other': s('calendar','<circle cx="15.3" cy="18" r=".4"/><circle cx="18" cy="18" r=".4"/><circle cx="20.7" cy="18" r=".4"/>'),
  'suggestion': s('book','<path d="M16 19q-3-5 2-5t2 5l-1 2h-2Z"/>'),
  'materials': s('assignment','<path d="M15 15h6v6h-6ZM18 15v6M15 18h6"/>'),
  'model-test': s('exam','<path d="m15 18 2 2 4-4"/>'),
  'practice': s('mcq','<path d="M15 18a3 3 0 1 1 1 2m-1 1v-2h2"/>'),
  'study-other': s('book','<path d="M15 18h6M18 15v6"/>'),
  'exam-upcoming': s('exam','<path d="M18 15v3l2 1"/><circle cx="18" cy="18" r="3.5"/>'),
  'exam-live': s('exam','<path d="m16 14 5 4-5 4Z"/>'),
  'exam-done': s('exam','<path d="m14.5 18 2.5 2.5 4.5-5"/>'),
  'exam-instant': s('mcq','<path d="m19 14-4 5h3l-1 3 4-5h-3Z"/>'),
  'exam-practice': s('exam','<path d="M15 18a3 3 0 1 1 1 2m-1 1v-2h2"/>'),
  'exam-recent': s('clock','<path d="M15 18h6M18 15v6"/>'),
  'exam-bank': s('mcq','<path d="M15 16h6v5h-6ZM14.5 15h7"/>'),
  'exam-other': s('exam','<circle cx="15.3" cy="18" r=".4"/><circle cx="18" cy="18" r=".4"/><circle cx="20.7" cy="18" r=".4"/>'),
  'class-today': s('classes','<circle cx="18" cy="18" r="2.5"/>'),
  'class-upcoming': s('classes','<path d="M15 18h6m-3-3 3 3-3 3"/>'),
  'class-record': s('reports','<path d="M15 15h6v6h-6ZM17 15v6"/>'),
  'class-subjects': s('book','<path d="M15 20v-5h2l1 3 1-3h2v5"/>'),
  'class-notes': s('assignment','<path d="m15 20 4-5 2 2-4 4-2 .5Z"/>'),
  'class-materials': s('classes','<path d="M15 15h6v6h-6ZM18 15v6"/>'),
  'profile-edit': s('user','<path d="m15 20 4-5 2 2-4 4-2 .5Z"/>'),
  'notification-settings': s('bell','<path d="M14.5 16h7M14.5 20h7M17 15v2M19 19v2"/>'),
  'contact-office': s('staff','<path d="M15 15h6v5h-3l-2 2v-2h-1Z"/>'),
  'offline-data': s('data','<path d="M15 15l6 6M15 19a4 4 0 0 1 6 0"/>'),
  'marks-entry': s('reports','<path d="m15 20 4-5 2 2-4 4-2 .5Z"/>'),
  'exam-create': s('exam','<path d="M15 18h6M18 15v6"/>'),
  'class-other': s('classes','<path d="M15 18h6M18 15v6"/>'),
  'pending-user': s('students','<path d="M18 15v3l2 1"/><circle cx="18" cy="18" r="3.5"/>'),
  'inactive-user': s('user','<path d="M16 15v6M20 15v6"/>'),
  'rejected-user': s('user','<path d="m15 15 6 6m0-6-6 6"/>'),
  'logout': a(r(3.2,3,11.6,18,'paper',2.4)+p('M5.4 5.4h7.2v13.2H5.4Z','blue-back')+c(10.8,12,1,'blue')+c(16.8,12,4.8,'coral')+st('M14.4 12h4.4m-1.8-2 2 2-2 2','on-color',1.5)),
  'download': a(r(3.2,14.4,17.6,6.4,'paper',2.2)+st('M6.4 17.6h11.2','mint',1.5)+c(12,9.2,5.6,'blue')+st('M12 6.2v5.6m-2.4-2.2 2.4 2.4 2.4-2.4','on-color',1.6)),
  'upload': a(r(3.2,14.4,17.6,6.4,'paper',2.2)+st('M6.4 17.6h11.2','blue',1.5)+c(12,9.2,5.6,'mint')+st('M12 12.2V6.6m-2.4 2.2 2.4-2.4 2.4 2.4','on-color',1.6)),
  'sun': a(c(12,12,8.8,'blue-back')+c(12,12,5.2,'gold')+st('M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6','gold',1.6)),
  'moon': a(c(12,12,8.8,'violet')+p('M14.8 6.2a5.8 5.8 0 1 0 3 9.8 4.8 4.8 0 1 1-3-9.8Z','gold')+c(17.2,7.4,1.1,'paper','stroke="none"')+c(18.6,11,.8,'mint','stroke="none"')),
  'sync': a(c(12,12,8.6,'paper')+c(12,12,6.2,'blue')+st('M9.2 9.8a3.4 3.4 0 0 1 5.4-.6l.8.8M14.8 14.2a3.4 3.4 0 0 1-5.4.6l-.8-.8','on-color',1.5)+c(18.2,6.4,2.2,'mint')),
  'warning': a(p('M12 3.2 21.4 19a1.8 1.8 0 0 1-1.6 2.7H4.2A1.8 1.8 0 0 1 2.6 19Z','gold')+c(12,14.2,5.2,'coral')+st('M12 11.4v3.2m0 2.4h.01','on-color',1.7)),
  'delete': a(r(5.4,6.8,13.2,14.2,'paper',2.2)+st('M4 6.8h16M9 4.2h6','coral',1.6)+r(7.4,9.4,9.2,9.2,'coral',1.6)+st('M10.4 11.6v4.8M13.6 11.6v4.8','on-color',1.5)),
  'edit': a(r(3.2,3.4,14.4,17.2,'paper',2.2)+st('M6.4 8.2h6.8M6.4 11.8h4.8','blue',1.4)+p('m13.4 14.8 5.2-5.2 2.4 2.4-5.2 5.2-3 .6Z','gold')+c(18.6,9.6,1.7,'coral')),
  'add': a(r(3.2,3.2,17.6,17.6,'paper',4.6)+c(12,12,6.2,'mint')+st('M12 8.8v6.4M8.8 12h6.4','on-color',1.8)),
  'camera': a(r(2.8,6.2,18.4,13.8,'blue',3)+p('m7.8 6.2 1.6-2.4h5.2l1.6 2.4Z','violet')+c(12,13.2,4.2,'paper')+c(12,13.2,2.2,'mint')+c(17.6,9.4,1.1,'gold','stroke="none"')),
  'whatsapp': a(p('M4.2 19.8 5.6 15a8.2 8.2 0 1 1 3.4 3.4Z','mint')+c(12.4,11.6,5.4,'paper')+st('M10.4 9.6c.4 2 2 3.6 4 4l1.2-1.2','mint',1.6)),
});

const l = d => `<path d="${d}"/>`;
export const GLYPHS = Object.freeze({
  camera: '<path d="M3 7h4l2-3h6l2 3h4v14H3Z"/><circle cx="12" cy="13" r="4"/>',
  home: l('m3 10.5 9-7.7 9 7.7M5.2 9.3v10a1.7 1.7 0 0 0 1.7 1.7h10.2a1.7 1.7 0 0 0 1.7-1.7v-10M9.5 21v-6.5h5V21'),
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.8"/><rect x="14" y="3" width="7" height="7" rx="1.8"/><rect x="3" y="14" width="7" height="7" rx="1.8"/><rect x="14" y="14" width="7" height="7" rx="1.8"/>',
  book: l('M12 5q-4-2.5-8-1.2v15.9q4-1.3 8 1.2 4-2.5 8-1.2V3.8Q16 2.5 12 5Zm0 0v15.9M7 7.8l2 .5M15 8.3l2-.5'),
  classes: '<rect x="3" y="3.5" width="18" height="13" rx="2.2"/>'+l('M6 7h6M6 10.5h10M8.5 16.5 7 21M15.5 16.5 17 21'),
  teacher: '<rect x="9" y="3" width="12" height="13" rx="2"/>'+l('M12 7h6M12 10h4M15 16v5M12 21h6')+'<circle cx="5.5" cy="11" r="2.5"/>'+l('M2 21v-2a3.5 3.5 0 0 1 7 0v2'),
  users: '<circle cx="9" cy="7.3" r="3.4"/>'+l('M2.5 21v-3a6.5 6.5 0 0 1 13 0v3M16 4.5a3.3 3.3 0 0 1 0 6.4M18 14a5.4 5.4 0 0 1 3.5 5v2'),
  students: l('m3 6.2 9-3.5 9 3.5-9 3.5ZM6 7.5v3q6 3.5 12 0v-3M21 6.2v6')+'<circle cx="12" cy="13.5" r="2.4"/>'+l('M6.5 21v-.5a5.5 5.5 0 0 1 11 0v.5'),
  staff: '<rect x="3" y="5" width="18" height="16" rx="2.3"/><rect x="9" y="2.5" width="6" height="4" rx="1"/><circle cx="8" cy="12.5" r="2"/>'+l('M5 18a3 3 0 0 1 6 0M14 11.5h4M14 15.5h4'),
  user: '<circle cx="12" cy="7.5" r="4"/>'+l('M4 21v-1.5a8 8 0 0 1 16 0V21'),
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/>'+l('M7.5 2.5v5M16.5 2.5v5M3 10h18M7 14h2M14.5 14h2M7 18h2'),
  clock: '<circle cx="12" cy="12" r="9"/>'+l('M12 7v5l3.5 2.2'),
  exam: '<rect x="4" y="4.5" width="16" height="17" rx="2"/><rect x="8" y="2.5" width="8" height="4" rx="1.2"/>'+l('M8 11h8M8 15h5M8 18h5'),
  mcq: '<rect x="3" y="3" width="18" height="18" rx="2.2"/>'+l('m6.2 7.5.9.9 1.5-1.8M12 7.5h5M6.2 12.3h2.5M12 12.3h5M6.2 17.3h2.5M12 17.3h5'),
  result: l('M7 4h10v6a5 5 0 0 1-10 0Zm0 2H3.5v3a4 4 0 0 0 4.3 4M17 6h3.5v3a4 4 0 0 1-4.3 4M12 15v4M7 21h10M9 19h6'),
  attendance: '<circle cx="8.5" cy="7" r="3.5"/>'+l('M2.5 21v-2.5a6 6 0 0 1 12 0V21m1.3-9 2 2 4-4'),
  notice: l('M3.5 9h5l11-5v15l-11-5h-5Zm5 0v5M6 14l2.2 7H12l-2.2-6.5M22 9v5'),
  wallet: '<rect x="3" y="7" width="18" height="14" rx="2.5"/>'+l('M3 8V5.5A2.5 2.5 0 0 1 5.5 3H18v4M21 12.5h-5a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h5')+'<circle cx="17.7" cy="15" r=".6" fill="currentColor" stroke="none"/>',
  receipt: l('M5 3h14v18l-3.5-1.7L12 21l-3.5-1.7L5 21ZM8.5 7h7M8.5 11h7M8.5 15h4'),
  reports: '<rect x="3" y="3" width="18" height="18" rx="2.2"/>'+l('M7.5 16.5v-4M12 16.5v-9M16.5 16.5V10'),
  data: '<ellipse cx="12" cy="5.5" rx="8.5" ry="3"/>'+l('M3.5 5.5v13c0 4 17 4 17 0v-13M3.5 12c0 4 17 4 17 0'),
  backup: l('M6 17.5a4.5 4.5 0 0 1-.9-8.9 6.8 6.8 0 0 1 13.1-1.4 5.3 5.3 0 0 1 .6 10.3M12 21V12m-3.5 3.5 3.5-3.5 3.5 3.5'),
  settings: l('M3.5 6h5m4 0h8M3.5 12h10m4 0h3.5M3.5 18h3m4 0h10')+'<circle cx="10.5" cy="6" r="2"/><circle cx="15.5" cy="12" r="2"/><circle cx="8.5" cy="18" r="2"/>',
  roles: l('m12 3 8 3v6c0 4.8-8 9-8 9s-8-4.2-8-9V6Z')+'<circle cx="12" cy="10" r="2.2"/>'+l('M8 17a4 4 0 0 1 8 0'),
  shield: l('m12 3 8 3v6c0 4.8-8 9-8 9s-8-4.2-8-9V6Zm-4 9 2.5 2.6 5.5-5.7'),
  assignment: l('M4 3h10l6 6v12H4Zm10 0v6h6M8 13h8M8 17h5'),
  approval: '<circle cx="12" cy="12" r="9"/>'+l('m7.5 12 3.1 3.2L17 8.5'),
  lock: '<rect x="5" y="10" width="14" height="11" rx="2.4"/>'+l('M8 10V7a4 4 0 0 1 8 0v3M12 14.5v2.5'),
  key: '<circle cx="7.5" cy="8" r="4.5"/>'+l('m10.5 11.5 9 9m-3.8-3.8 2.3-2.3m.5 5.1 2.3-2.3'),
  smartphone: '<rect x="6" y="2" width="12" height="20" rx="2.3"/>'+l('M10 4.5h4M10.5 19.5h3'),
  help: '<circle cx="12" cy="12" r="9"/>'+l('M9.2 9.2a2.8 2.8 0 1 1 5 1.7c-1.2 1.1-2.2 1-2.2 3.1')+'<circle cx="12" cy="17.3" r=".6" fill="currentColor" stroke="none"/>',
  bell: l('M5.5 16V9a6.5 6.5 0 0 1 13 0v7l2 2h-17Zm4 5a3 3 0 0 0 5 0'),
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/>'+l('M16 5V3H3v13h2'),
  chat: '<rect x="3" y="3.5" width="18" height="13.5" rx="2.5"/>'+l('M5.5 17v4l5.3-4M7 8.5h10M7 12h6'),
  search: '<circle cx="10.5" cy="10.5" r="7"/>'+l('m16 16 5 5'),
  whatsapp: l('M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.2 20.8l4.5-1.2A8.8 8.8 0 1 0 12 3.2Z')+l('M9 8.6c.3-.6.7-.6 1-.6h.6c.2 0 .4.1.5.5l.6 1.5c.1.2 0 .4-.1.6l-.5.5c-.1.2-.2.3 0 .6.3.6.9 1.2 1.5 1.6.6.3.9.4 1.2.3l.5-.5c.2-.2.4-.2.6-.1l1.4.7c.3.2.4.3.4.6 0 .5-.3 1.1-.7 1.4-.5.3-1.2.3-2 0-.9-.4-1.8-1-2.5-1.7-.7-.7-1.2-1.6-1.5-2.3-.3-.8-.3-1.4 0-1.8Z'),
  add: l('M12 4v16M4 12h16'),
  edit: l('m4 16.5 12-12 3.5 3.5-12 12-4.5 1Zm9.5-9.5 3.5 3.5'),
  delete: l('M3.5 6h17M9 6V3.5h6V6M5.5 6l1 14.5h11l1-14.5M10 10v6.5M14 10v6.5'),
  save: '<rect x="3" y="3" width="18" height="18" rx="2"/>'+l('M7 3v6h10V3M7 21v-8h10v8'),
  download: l('M12 3v12m-4-4 4 4 4-4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4'),
  upload: l('M12 16V3m-4 4 4-4 4 4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4'),
  print: l('M7 8V3h10v5M7 17H3V8h18v9h-4M7 14h10v7H7ZM17 11h1'),
  logout: l('M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5M8 12h13m-5-5 5 5-5 5'),
  back: l('M20 12H4m6-6-6 6 6 6'),
  next: l('M4 12h16m-6-6 6 6-6 6'),
  close: l('m6 6 12 12M18 6 6 18'),
  filter: l('M3 4h18l-7 8v8l-4-2v-6Z'),
  check: l('m4.5 12 5 5L20 6.5'),
  warning: l('m12 3 10 18H2ZM12 9v5')+'<circle cx="12" cy="17.5" r=".5" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="9"/>'+l('M12 11v6')+'<circle cx="12" cy="7.3" r=".6" fill="currentColor" stroke="none"/>',
  more: '<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>',
  menu: l('M3.5 5h17M3.5 12h17M3.5 19h17'),
  sync: l('M20.5 8.5a8.5 8.5 0 0 0-14.7-3L3 8.5M3 3v5.5h5.5M3.5 15.5a8.5 8.5 0 0 0 14.7 3l2.8-3M21 21v-5.5h-5.5'),
  online: l('M2.5 8a15 15 0 0 1 19 0M6 12a9.5 9.5 0 0 1 12 0M9.5 16a4 4 0 0 1 5 0')+'<circle cx="12" cy="20" r=".6" fill="currentColor"/>',
  offline: l('M3 3l18 18M2.5 8A15 15 0 0 1 6 6M11 4.8A15 15 0 0 1 21.5 8M6 12l2-1.3M16 11l2 1M9.5 16l1-.6')+'<circle cx="12" cy="20" r=".6" fill="currentColor"/>',
  eye: l('M2.5 12q9.5-12.5 19 0-9.5 12.5-19 0Z')+'<circle cx="12" cy="12" r="3"/>',
  phone: l('M7 3H4q-1 0-1 2c0 8.9 6.1 15 15 15q2 0 2-1v-3l-4-2-2 2a14 14 0 0 1-6-6l2-2Z'),
  mail: '<rect x="3" y="5" width="18" height="15" rx="2.3"/>'+l('m3.5 6 8.5 6.5L20.5 6'),
  sun: '<circle cx="12" cy="12" r="4"/>'+l('M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5'),
  moon: l('M20.5 14.6a9 9 0 0 1-11.1-11A9 9 0 1 0 20.5 14.6Z'),
  play: l('m8 4.5 11 7.5L8 19.5Z'),
  pause: l('M8 4.5v15M16 4.5v15'),
  fingerprint: l('M4 13V9a8 8 0 0 1 16 0v4M8 19V9a4 4 0 0 1 8 0v8M12 9v12'),
  bolt: l('m13.5 2.5-9 11h6l-1 8 10-12h-6Z')
});

const aliases = Object.freeze({
  courses: 'book', routine: 'calendar', results: 'result', notices: 'notice', profile: 'user',
  teachers: 'teacher', managers: 'staff', payments: 'wallet', payment: 'wallet', finance: 'wallet', money: 'wallet',
  database: 'data', cloud: 'backup', security: 'shield', homework: 'assignment', exams: 'exam',
  trash: 'delete', forward: 'next', refresh: 'sync', error: 'warning', notification: 'bell', class: 'classes',
  sliders: 'settings', summary: 'reports', grid: 'dashboard', clipboard: 'exam', trending: 'reports', award: 'result',
  success: 'approval', verified: 'approval', approvals: 'pending-user', 'question-bank': 'exam-bank',
  checkCircle: 'approval', 'check-circle': 'approval', 'arrow-right': 'next',
  'arrow-left': 'back', 'chevron-right': 'next', plus: 'add', megaphone: 'notice', support: 'help', app: 'smartphone', card: 'receipt'
});
export function resolveIcon(name) {
  const key = String(name).replace(/^icon-/, '');
  return Object.prototype.hasOwnProperty.call(aliases, key) ? aliases[key] : key;
}
export function iconArtwork(name, variant = 'color') {
  const resolved = resolveIcon(name);
  const key = Object.prototype.hasOwnProperty.call(SEMANTIC_ART, resolved) || Object.prototype.hasOwnProperty.call(ILLUSTRATIONS, resolved) || Object.prototype.hasOwnProperty.call(GLYPHS, resolved) || resolved === 'chevron-down' ? resolved : 'help';
  // Generated raster illustrations plus matching local vector controls. The
  // outer SVG, semantic name and all caller/control attributes remain intact.
  const generated = variant === 'color' && ['book','calendar','exam','wallet'].includes(key);
  const url = `assets/icons/ai-3d/${key}.${generated ? 'png' : 'svg'}`;
  const isIllustrated = Object.prototype.hasOwnProperty.call(ILLUSTRATIONS, key) || Object.prototype.hasOwnProperty.call(SEMANTIC_ART, key);
  return { markup: `<image href="${url}" width="24" height="24" preserveAspectRatio="xMidYMid meet"/>`, style: variant === 'color' && isIllustrated ? 'color' : 'glyph', canonical: key };
}
