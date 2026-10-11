/* Login User ID rules — js/user-id.js, the "First Name + Role + .apc" contract.
   Pure module: these tests need no page, no storage and no browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLE_SLUGS,
  LOGIN_ID_PATTERN,
  extractFirstName,
  slugifyName,
  buildLoginId,
  generateLoginId,
  isAutoLoginId,
  normalizeLoginId,
  describeLoginId
} from '../js/user-id.js';

test('every role maps to its own id part', () => {
  assert.equal(ROLE_SLUGS.admin, 'admin');
  assert.equal(ROLE_SLUGS.manager, 'manager');
  assert.equal(ROLE_SLUGS.teacher, 'teacher');
  assert.equal(ROLE_SLUGS['cash-counter'], 'cash');
  assert.equal(ROLE_SLUGS.payment, 'cash');
});

test('first name extraction uses the first usable name only', () => {
  assert.equal(extractFirstName('Rasal Russell Chowdhury'), 'rasal');
  assert.equal(extractFirstName('Karim Ahmed'), 'karim');
  assert.equal(extractFirstName('Abdullah Al Mamun'), 'abdullah');
  assert.equal(extractFirstName('Sadia Rahman'), 'sadia');
  assert.equal(extractFirstName('Tanvir Hasan'), 'tanvir');
  // Honorific prefixes are skipped.
  assert.equal(extractFirstName('Md. Hasan Ali'), 'hasan');
  assert.equal(extractFirstName('Md Hasan Ali'), 'hasan');
  assert.equal(extractFirstName('Mst. Sadia Akter'), 'sadia');
  assert.equal(extractFirstName('Dr. Tanvir Rahman'), 'tanvir');
  assert.equal(extractFirstName('Mohammad Karim'), 'karim');
  // Bengali names get a readable latin base: consonants keep their inherent
  // vowel only before another consonant ("নতুন" → notun, "রাসেল" → rasel).
  assert.equal(slugifyName('রাসেল'), 'rasel');
  assert.equal(slugifyName('নতুন'), 'notun');
  assert.equal(slugifyName('শিক্ষক'), 'shikshok');
  assert.equal(extractFirstName('রাসেল চৌধুরী'), 'rasel');
  // A Bengali honorific is skipped exactly like its latin form.
  assert.equal(extractFirstName('মোঃ করিম'), 'korim');
  assert.equal(extractFirstName('মোহাম্মদ রাহাত'), 'rahat');
  // An initial is not a first name.
  assert.equal(extractFirstName('Dr. A B Rahman'), 'rahman');
  // Empty input never produces an empty slug.
  assert.equal(extractFirstName(''), '');
  assert.equal(extractFirstName('   '), '');
  assert.equal(extractFirstName('!!! ???'), '');
});

test('the slug removes spaces and every special character', () => {
  assert.equal(slugifyName('Rasal-Russell  Chowdhury!'), 'rasalrussellchowdhury');
  assert.equal(slugifyName('O\'Brien'), 'obrien');
  assert.equal(slugifyName('রাসেল ২'), 'rasel2');
});

test('the id is first name + role + .apc', () => {
  assert.equal(buildLoginId('rasal', 'admin'), 'rasal.admin.apc');
  assert.equal(buildLoginId('rasal', 'manager'), 'rasal.manager.apc');
  assert.equal(buildLoginId('rasal', 'teacher'), 'rasal.teacher.apc');
  assert.equal(buildLoginId('rasal', 'cash-counter'), 'rasal.cash.apc');
  assert.equal(buildLoginId('rasal', 'payment'), 'rasal.cash.apc');
});

test('the duplicate number lands on the first name — never on the role or .apc', () => {
  assert.equal(buildLoginId('rasal', 'teacher', 2), 'rasal2.teacher.apc');
  assert.equal(buildLoginId('rasal', 'teacher', 3), 'rasal3.teacher.apc');
  assert.equal(buildLoginId('rasal', 'teacher', 10), 'rasal10.teacher.apc');
  assert.equal(buildLoginId('tanvir', 'cash-counter', 2), 'tanvir2.cash.apc');
  // The forbidden shapes never appear.
  for (const sequence of [2, 3, 9]) {
    const id = buildLoginId('rasal', 'teacher', sequence);
    assert.doesNotMatch(id, /teacher\d/);
    assert.doesNotMatch(id, /apc\d/);
    assert.doesNotMatch(id, /\.\d/);
  }
});

test('an id never breaks the username rule (4–20 chars, starts with a letter)', () => {
  const names = ['rasal', 'abdullah', 'christopher', 'md', 'a', 'রাসেল', 'x'];
  const roles = Object.keys(ROLE_SLUGS);
  for (const name of names) {
    for (const role of roles) {
      for (const sequence of [1, 2, 12, 100]) {
        const id = buildLoginId(name, role, sequence);
        assert.ok(LOGIN_ID_PATTERN.test(id), `${id} breaks the username rule`);
        assert.ok(id.length <= 20, `${id} is longer than 20`);
        assert.ok(id.endsWith('.apc'), `${id} lost the .apc suffix`);
      }
    }
  }
  // A name that starts with digits still produces a letter-first id.
  assert.equal(buildLoginId('2pac', 'teacher'), 'pac.teacher.apc');
  assert.equal(buildLoginId('007', 'teacher'), 'user.teacher.apc');
});

test('generateLoginId walks rasal → rasal2 → rasal3 for the same name and role', () => {
  const taken = [];
  const first = generateLoginId({ fullName: 'Rasal Russell Chowdhury', role: 'teacher', taken });
  assert.equal(first, 'rasal.teacher.apc');
  taken.push(first);
  const second = generateLoginId({ fullName: 'Rasal Ahmed', role: 'teacher', taken });
  assert.equal(second, 'rasal2.teacher.apc');
  taken.push(second);
  const third = generateLoginId({ fullName: 'Rasal Karim', role: 'teacher', taken });
  assert.equal(third, 'rasal3.teacher.apc');
  taken.push(third);
  assert.equal(generateLoginId({ fullName: 'Rasal Hasan', role: 'teacher', taken }), 'rasal4.teacher.apc');
});

test('the same first name in a different role starts again at 1', () => {
  const taken = ['rasal.teacher.apc'];
  assert.equal(generateLoginId({ fullName: 'Rasal Russell Chowdhury', role: 'manager', taken }), 'rasal.manager.apc');
  assert.equal(generateLoginId({ fullName: 'Rasal Russell Chowdhury', role: 'admin', taken }), 'rasal.admin.apc');
  assert.equal(generateLoginId({ fullName: 'Rasal Russell Chowdhury', role: 'cash-counter', taken }), 'rasal.cash.apc');
});

test('the full example table from the specification', () => {
  const rows = [
    ['Rasal Russell Chowdhury', 'admin', 'rasal.admin.apc'],
    ['Rasal Russell Chowdhury', 'manager', 'rasal.manager.apc'],
    ['Rasal Russell Chowdhury', 'teacher', 'rasal.teacher.apc'],
    ['Rasal Russell Chowdhury', 'cash-counter', 'rasal.cash.apc']
  ];
  const taken = [];
  for (const [fullName, role, expected] of rows) {
    const id = generateLoginId({ fullName, role, taken });
    assert.equal(id, expected, `${fullName} / ${role}`);
    taken.push(id);
  }
  // Second/third of each family continue on the first name.
  assert.equal(generateLoginId({ fullName: 'Rasal Ahmed', role: 'teacher', taken }), 'rasal2.teacher.apc');
  assert.equal(generateLoginId({ fullName: 'Karim Ahmed', role: 'manager', taken }), 'karim.manager.apc');
  taken.push('karim.manager.apc');
  assert.equal(generateLoginId({ fullName: 'Karim Hasan', role: 'manager', taken }), 'karim2.manager.apc');
  assert.equal(generateLoginId({ fullName: 'Sadia Rahman', role: 'teacher', taken }), 'sadia.teacher.apc');
  taken.push('sadia.teacher.apc');
  assert.equal(generateLoginId({ fullName: 'Sadia Akter', role: 'teacher', taken }), 'sadia2.teacher.apc');
  assert.equal(generateLoginId({ fullName: 'Tanvir Hasan', role: 'cash-counter', taken }), 'tanvir.cash.apc');
  taken.push('tanvir.cash.apc');
  assert.equal(generateLoginId({ fullName: 'Tanvir Rahman', role: 'cash-counter', taken }), 'tanvir2.cash.apc');
});

test('duplicate checking is case-insensitive', () => {
  assert.equal(
    generateLoginId({ fullName: 'Rasal Russell Chowdhury', role: 'teacher', taken: ['RASAL.TEACHER.APC'] }),
    'rasal2.teacher.apc'
  );
  assert.equal(
    generateLoginId({ fullName: 'Rasal Russell Chowdhury', role: 'teacher', taken: ['rasal.Teacher.apc'] }),
    'rasal2.teacher.apc'
  );
  assert.equal(normalizeLoginId('  Rasal.Teacher.APC '), 'rasal.teacher.apc');
  // A predicate works just as well as a list.
  assert.equal(
    generateLoginId({ fullName: 'Rasal Russell Chowdhury', role: 'admin', taken: id => normalizeLoginId(id) === 'rasal.admin.apc' }),
    'rasal2.admin.apc'
  );
});

test('generated ids are always unique across many names in the same role', () => {
  const taken = [];
  for (let index = 0; index < 25; index += 1) {
    const id = generateLoginId({ fullName: 'Rasal Russell', role: 'teacher', taken });
    assert.equal(taken.includes(id), false, `${id} was handed out twice`);
    taken.push(id);
  }
  assert.equal(taken[0], 'rasal.teacher.apc');
  assert.equal(taken[1], 'rasal2.teacher.apc');
  assert.equal(taken[24], 'rasal25.teacher.apc');
});

test('isAutoLoginId recognises the generated shape of a role', () => {
  assert.equal(isAutoLoginId('rasal.teacher.apc', 'teacher'), true);
  assert.equal(isAutoLoginId('rasal2.teacher.apc', 'teacher'), true);
  assert.equal(isAutoLoginId('rasal.teacher.apc', 'manager'), false);
  assert.equal(isAutoLoginId('teacher.apc', 'teacher'), false, 'a system account id is not auto-generated');
  assert.equal(isAutoLoginId('admin.apc'), false);
  assert.equal(isAutoLoginId('someone@example.com'), false);
});

test('describeLoginId splits an id back into its parts', () => {
  assert.deepEqual(describeLoginId('rasal2.teacher.apc'), { base: 'rasal2', role: 'teacher', valid: true });
  assert.deepEqual(describeLoginId('tanvir.cash.apc'), { base: 'tanvir', role: 'cash', valid: true });
  assert.equal(describeLoginId('nonsense').role, '');
});
