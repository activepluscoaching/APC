import test from 'node:test';
import assert from 'node:assert/strict';
import { studentIdCardSVG, studentIdQRPayload } from '../js/student-profile-card.js';
test('downloaded ID card escapes identity text and rejects external image references', () => {
  const svg = studentIdCardSVG({ id: 'AP-42', name: '<script>alert(1)</script>', institution: 'A&B', className: 'দশম শ্রেণি' }, 'https://example.com/image.jpg');
  assert.match(svg, /AP-42/);
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /A&amp;B/);
  assert.doesNotMatch(svg, /<script|https:\/\/example.com/);
});

test('back card has a real QR matrix with ID-only payload and masks phone numbers', () => {
  const student = { id: 'AP-42', name: 'Name', guardianMobile: '01712345678', studentMobile: '01812345678', address: 'Dhaka' };
  assert.equal(studentIdQRPayload(student), 'Active Plus Coaching | Student ID: AP-42');
  const back = studentIdCardSVG(student, '', 'back');
  assert.match(back, /shape-rendering="crispEdges"/);
  assert.match(back, /017••••••78/);
  assert.doesNotMatch(back, /01712345678|01812345678/);
  assert.match(back, /Dhaka/);
});
