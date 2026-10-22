import { KEYS, readRaw, writeJSON, newId } from './database.js';
import { normalizeClassId } from './class-key.js';
import { escapeHtml } from './sanitize.js';
import { enabledClasses } from './config.js';
import { loadRoster } from './office-data.js';
import { authenticatedStudent } from './student-access.js';
import { hasStaffSession, readStaffAccount, readActiveStaffIdentity } from './staff-auth.js';
import { iconMarkup } from './icons.js';
import {
  CLASS_CHAT_READ_KEY,
  CLASS_CHAT_HEAD_POS_KEY,
  actorReadKey,
  readChatReceipts,
  markClassRoomRead,
  getUnreadClassChatSummary,
  formatUnreadCountBn,
  isChatContainerVisible,
  mountClassChatHead
} from './class-chat-head.js';
export {
  CLASS_CHAT_READ_KEY,
  CLASS_CHAT_HEAD_POS_KEY,
  actorReadKey,
  readChatReceipts,
  markClassRoomRead,
  getUnreadClassChatSummary,
  formatUnreadCountBn,
  isChatContainerVisible,
  mountClassChatHead
};
export {
  CLASS_CHAT_RELAY_TTL_DAYS,
  CLASS_CHAT_RELAY_TTL_MS,
  CLASS_CHAT_RELAY_STATE_KEY,
  CLASS_CHAT_E2EE_ALGO,
  isEncryptedChatEnvelope,
  encryptChatPayload,
  decryptChatPayload,
  applyRelayCloudTransaction,
  mergeCloudRelayIntoLocal,
  syncClassChatRelayCycle
} from './class-chat-relay.js';

export const CLASS_CHAT_KEY = KEYS.classChat;
export const MAX_CHAT_MESSAGE_LENGTH = 1000;
export const QUICK_REACTIONS = Object.freeze(['👍', '❤️', '🎉', '🙏', '💡']);
export const STAFF_ROLE_BADGES = Object.freeze({
  teacher: 'শিক্ষক',
  manager: 'ম্যানেজার',
  admin: 'এডমিন'
});
export const STUDENT_LOCKED_NOTICE = 'এই শ্রেণির চ্যাট বর্তমানে শুধুমাত্র শিক্ষকদের বার্তার জন্য সীমাবদ্ধ';

export const CORE_CHAT_CLASSES = Object.freeze([
  'অষ্টম শ্রেণি',
  'নবম শ্রেণি',
  'দশম শ্রেণি',
  'একাদশ শ্রেণি',
  'দ্বাদশ শ্রেণি'
]);

const CLASS_SHORT_LABELS = Object.freeze({
  'অষ্টম শ্রেণি': 'অষ্টম',
  'নবম শ্রেণি': 'নবম',
  'দশম শ্রেণি': 'দশম',
  'একাদশ শ্রেণি': 'একাদশ',
  'দ্বাদশ শ্রেণি': 'দ্বাদশ'
});

const CLASS_ROOM_SLUGS = Object.freeze({
  'অষ্টম শ্রেণি': 'class_8',
  'নবম শ্রেণি': 'class_9',
  'দশম শ্রেণি': 'class_10',
  'একাদশ শ্রেণি': 'class_11',
  'দ্বাদশ শ্রেণি': 'class_12'
});

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const toBnDigits = value => String(value ?? '').replace(/\d/g, d => BN_DIGITS[Number(d)]);

function chatError(message, code = 'CHAT_ERROR') {
  return Object.assign(new Error(message), { code });
}

export function roomKeyForClass(className) {
  const classId = normalizeClassId(className);
  if (!classId) return '';
  if (CLASS_ROOM_SLUGS[classId]) return CLASS_ROOM_SLUGS[classId];
  let hash = 2166136261;
  for (let i = 0; i < classId.length; i += 1) {
    hash ^= classId.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `class_c${hash.toString(36)}`;
}

export function shortClassTabLabel(className) {
  const classId = normalizeClassId(className);
  return CLASS_SHORT_LABELS[classId] || classId.replace(/\s*শ্রেণি$/, '') || classId;
}

function normalizeReactions(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const emoji of QUICK_REACTIONS) {
    const val = raw[emoji];
    const list = Array.isArray(val)
      ? val.map(v => String(v || '').trim()).filter(Boolean)
      : val && typeof val === 'object'
        ? Object.keys(val).filter(k => Boolean(val[k])).map(k => k.trim()).filter(Boolean)
        : [];
    const unique = [...new Set(list)];
    if (unique.length) out[emoji] = unique;
  }
  return out;
}

function normalizeMessage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const classId = normalizeClassId(raw.classId || raw.className || '');
  const roomKey = String(raw.roomKey || roomKeyForClass(classId)).trim();
  const id = String(raw.id || '').trim();
  if (!id || !classId || !roomKey) return null;
  const senderRole = ['teacher', 'manager', 'admin'].includes(raw.senderRole) ? raw.senderRole : 'student';
  const deleted = raw.deleted === true;
  const replyRaw = !deleted && raw.replyTo && typeof raw.replyTo === 'object' ? raw.replyTo : null;
  const replyTo = replyRaw && replyRaw.id ? {
    id: String(replyRaw.id),
    senderName: String(replyRaw.senderName || 'সদস্য').slice(0, 80),
    senderRole: ['teacher', 'manager', 'admin'].includes(replyRaw.senderRole) ? replyRaw.senderRole : 'student',
    senderBadge: String(replyRaw.senderBadge || STAFF_ROLE_BADGES[replyRaw.senderRole] || ''),
    text: String(replyRaw.text || '').slice(0, 160)
  } : null;
  const createdAt = String(raw.createdAt || new Date().toISOString());
  const updatedAt = Number(raw.updatedAt) || Date.parse(createdAt) || Date.now();
  return {
    id,
    roomKey,
    classId,
    senderId: String(raw.senderId || ''),
    senderName: String(raw.senderName || 'সদস্য').slice(0, 80),
    senderRole,
    senderBadge: senderRole === 'student' ? '' : (STAFF_ROLE_BADGES[senderRole] || String(raw.senderBadge || '')),
    text: deleted ? '' : String(raw.text || '').slice(0, MAX_CHAT_MESSAGE_LENGTH),
    replyTo,
    reactions: deleted ? {} : normalizeReactions(raw.reactions),
    deleted,
    deletedBy: deleted ? String(raw.deletedBy || '') : '',
    deletedById: deleted ? String(raw.deletedById || '') : '',
    deletedByRole: deleted ? String(raw.deletedByRole || '') : '',
    deletedAt: deleted ? String(raw.deletedAt || '') : '',
    createdAt,
    updatedAt
  };
}

function normalizeRoom(raw, fallbackClassId = '') {
  const classId = normalizeClassId(raw?.classId || fallbackClassId);
  const roomKey = String(raw?.roomKey || roomKeyForClass(classId)).trim();
  if (!classId || !roomKey) return null;
  return {
    id: roomKey,
    roomKey,
    classId,
    locked: raw?.locked === true,
    lockedBy: String(raw?.lockedBy || ''),
    lockedByRole: String(raw?.lockedByRole || ''),
    lockedAt: String(raw?.lockedAt || ''),
    pinnedMessageId: String(raw?.pinnedMessageId || ''),
    pinnedBy: String(raw?.pinnedBy || ''),
    pinnedByRole: String(raw?.pinnedByRole || ''),
    pinnedAt: String(raw?.pinnedAt || ''),
    updatedAt: Number(raw?.updatedAt) || 1
  };
}

export function readClassChatStore() {
  try {
    const raw = readRaw(CLASS_CHAT_KEY);
    if (!raw) return { version: 1, rooms: {}, messages: [], updatedAt: 0 };
    const parsed = JSON.parse(raw);
    const rooms = {};
    if (parsed && typeof parsed.rooms === 'object' && parsed.rooms) {
      for (const [key, value] of Object.entries(parsed.rooms)) {
        const room = normalizeRoom({ ...value, roomKey: value?.roomKey || key }, value?.classId || '');
        if (room) rooms[room.roomKey] = room;
      }
    }
    const rawList = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.messages) ? parsed.messages : [];
    const seen = new Set();
    const messages = [];
    for (const item of rawList) {
      const msg = normalizeMessage(item);
      if (!msg || seen.has(msg.id)) continue;
      seen.add(msg.id);
      messages.push(msg);
    }
    messages.sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0) || a.id.localeCompare(b.id));
    return {
      version: 1,
      rooms,
      messages,
      updatedAt: Number(parsed?.updatedAt) || 0
    };
  } catch {
    return { version: 1, rooms: {}, messages: [], updatedAt: 0 };
  }
}

function writeClassChatStore(store, detail = {}) {
  const next = {
    version: 1,
    rooms: store.rooms || {},
    messages: store.messages || [],
    updatedAt: Date.now()
  };
  if (!writeJSON(CLASS_CHAT_KEY, next)) {
    throw chatError('চ্যাট তথ্য সংরক্ষণ করা যায়নি — ডিভাইস স্টোরেজ পরীক্ষা করুন।', 'STORAGE_WRITE_FAILED');
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('apc-class-chat-updated', { detail }));
  }
  return next;
}

export function normalizeChatActor(input) {
  if (!input || typeof input !== 'object') {
    throw chatError('লগইন সেশন পাওয়া যায়নি। অনুগ্রহ করে আবার লগইন করুন।', 'ACCESS_DENIED');
  }
  const role = String(input.role || (input.kind === 'staff' ? 'teacher' : 'student')).trim().toLowerCase();
  if (['teacher', 'manager', 'admin'].includes(role)) {
    const status = String(input.status || input.accountStatus || 'active').trim().toLowerCase();
    if (['inactive', 'suspended', 'rejected'].includes(status)) {
      throw chatError('নিষ্ক্রিয় স্টাফ অ্যাকাউন্ট থেকে চ্যাট ব্যবহার করা যাবে না।', 'ACCESS_DENIED');
    }
    const id = String(input.id || input.staffId || input.username || `${role}.apc`).trim();
    const fallbackName = STAFF_ROLE_BADGES[role] || 'স্টাফ';
    const name = String(input.name || input.fullName || fallbackName).trim() || fallbackName;
    return {
      kind: 'staff',
      role,
      id,
      name,
      badge: STAFF_ROLE_BADGES[role],
      classId: '',
      status: 'active'
    };
  }
  const id = String(input.id || input.studentId || '').trim();
  if (!id) {
    throw chatError('শিক্ষার্থী অ্যাকাউন্ট যাচাই করা যায়নি।', 'ACCESS_DENIED');
  }
  const roster = loadRoster();
  const rosterMatch = Array.isArray(roster) ? roster.find(row => String(row?.id || '') === id) : null;
  const rawStatus = String(input.status || rosterMatch?.status || '').trim().toLowerCase();
  if (rawStatus !== 'approved') {
    throw chatError('শুধুমাত্র অনুমোদিত (approved) শিক্ষার্থীরা শ্রেণি চ্যাটে প্রবেশ করতে পারবে।', 'STUDENT_NOT_APPROVED');
  }
  if (rosterMatch && String(rosterMatch.status || '').trim().toLowerCase() !== 'approved') {
    throw chatError('আপনার শিক্ষার্থী প্রোফাইল বর্তমানে অনুমোদিত নয়।', 'STUDENT_NOT_APPROVED');
  }
  const classId = normalizeClassId(input.className || input.classId || rosterMatch?.className || '');
  if (!classId) {
    throw chatError('শিক্ষার্থীর নির্ধারিত শ্রেণি পাওয়া যায়নি।', 'INVALID_STUDENT_CLASS');
  }
  const name = String(input.name || input.fullName || rosterMatch?.fullName || rosterMatch?.name || 'শিক্ষার্থী').trim() || 'শিক্ষার্থী';
  return {
    kind: 'student',
    role: 'student',
    id,
    name,
    badge: '',
    classId,
    status: 'approved'
  };
}

export async function resolvePortalChatActor(portal = 'student', fallbackProfile = null) {
  if (['teacher', 'manager', 'admin'].includes(portal)) {
    const allowed = await hasStaffSession(portal);
    if (!allowed) throw chatError('স্টাফ সেশন যাচাই করা যায়নি। আবার লগইন করুন।', 'ACCESS_DENIED');
    const activeId = readActiveStaffIdentity();
    const account = (fallbackProfile && typeof fallbackProfile === 'object') ? fallbackProfile : await readStaffAccount(portal);
    const matchesPortal = activeId && (activeId.role === portal || activeId.role === 'admin');
    const username = (matchesPortal && activeId?.username) || account?.username || `${portal}.apc`;
    const id = (matchesPortal && activeId?.staffId) || account?.staffId || username;
    const name = (matchesPortal && activeId?.fullName) || account?.fullName || STAFF_ROLE_BADGES[portal];
    return normalizeChatActor({
      kind: 'staff',
      role: portal,
      id,
      name,
      status: account?.status || 'active'
    });
  }
  const sessionStudent = await authenticatedStudent();
  const roster = loadRoster();
  const rosterRow = Array.isArray(roster) ? roster.find(r => String(r?.id || '') === String(sessionStudent.id)) : null;
  const mergedStatus = rosterRow?.status || fallbackProfile?.status || sessionStudent.status || 'approved';
  return normalizeChatActor({
    ...sessionStudent,
    ...(fallbackProfile && typeof fallbackProfile === 'object' ? fallbackProfile : {}),
    ...(rosterRow || {}),
    id: sessionStudent.id,
    role: 'student',
    status: mergedStatus
  });
}

export function assertRoomReadAccess(actorInput, targetClassName) {
  const actor = normalizeChatActor(actorInput);
  const classId = normalizeClassId(targetClassName);
  if (!classId) {
    throw chatError('সঠিক শ্রেণি নির্বাচন করুন।', 'INVALID_CLASS');
  }
  if (actor.kind === 'student' && actor.classId !== classId) {
    throw chatError('আপনি শুধুমাত্র নিজের শ্রেণির চ্যাট রুম দেখতে ও ব্যবহার করতে পারবেন।', 'CLASS_ACCESS_DENIED');
  }
  return { actor, classId, roomKey: roomKeyForClass(classId) };
}

export function assertStaffModerationAccess(actorInput, targetClassName) {
  const { actor, classId, roomKey } = assertRoomReadAccess(actorInput, targetClassName);
  if (actor.kind !== 'staff' || !['teacher', 'manager', 'admin'].includes(actor.role)) {
    throw chatError('শুধুমাত্র শিক্ষক, ম্যানেজার ও এডমিন মডারেশন নিয়ন্ত্রণ ব্যবহার করতে পারবেন।', 'MODERATION_DENIED');
  }
  return { actor, classId, roomKey };
}

export function sanitizeChatText(rawText) {
  const cleaned = String(rawText ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  if (!cleaned) {
    throw chatError('ফাঁকা বার্তা পাঠানো যাবে না।', 'EMPTY_MESSAGE');
  }
  if (cleaned.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw chatError(`বার্তাটি সর্বোচ্চ ${toBnDigits(MAX_CHAT_MESSAGE_LENGTH)} অক্ষরের মধ্যে হতে হবে।`, 'MESSAGE_TOO_LONG');
  }
  return cleaned;
}

export function listAvailableChatClasses() {
  const seen = new Set();
  const list = [];
  const push = raw => {
    const classId = normalizeClassId(raw);
    if (!classId || seen.has(classId)) return;
    seen.add(classId);
    list.push(classId);
  };
  CORE_CHAT_CLASSES.forEach(push);
  try { (enabledClasses() || []).forEach(push); } catch { /* optional */ }
  try { (loadRoster() || []).forEach(s => push(s?.className)); } catch { /* optional */ }
  const store = readClassChatStore();
  Object.values(store.rooms).forEach(r => push(r?.classId));
  store.messages.forEach(m => push(m?.classId));
  return list;
}

export function countActiveClassMembers(className) {
  const classId = normalizeClassId(className);
  if (!classId) return 0;
  const roster = loadRoster();
  const approvedIds = new Set();
  if (Array.isArray(roster)) {
    for (const student of roster) {
      if ((student?.status === 'approved' || student?.status === 'active') && normalizeClassId(student.className) === classId && student.id) {
        approvedIds.add(String(student.id));
      }
    }
  }
  const store = readClassChatStore();
  const roomKey = roomKeyForClass(classId);
  for (const msg of store.messages) {
    if (msg.roomKey === roomKey && msg.senderRole === 'student' && msg.senderId) {
      const inRoster = Array.isArray(roster) && roster.some(s => String(s?.id || '') === msg.senderId);
      if (!inRoster) approvedIds.add(msg.senderId);
    }
  }
  return approvedIds.size;
}

export function getClassRoomView(className, { actor: actorInput, search = '' } = {}) {
  const { actor, classId, roomKey } = assertRoomReadAccess(actorInput, className);
  const store = readClassChatStore();
  const room = store.rooms[roomKey] || normalizeRoom({ roomKey, classId }, classId);
  const roomMessages = store.messages.filter(m => m.roomKey === roomKey);
  const pinnedMessage = room.pinnedMessageId
    ? roomMessages.find(m => m.id === room.pinnedMessageId && !m.deleted) || null
    : null;
  const q = String(search || '').trim().toLowerCase();
  const filteredMessages = q
    ? roomMessages.filter(m => !m.deleted && (
      m.text.toLowerCase().includes(q)
      || m.senderName.toLowerCase().includes(q)
      || (m.senderBadge && m.senderBadge.toLowerCase().includes(q))
    ))
    : roomMessages;
  const canModerate = actor.kind === 'staff';
  const canSend = actor.kind === 'staff' || !room.locked;
  return {
    classId,
    roomKey,
    title: `${classId} — আলোচনা কক্ষ`,
    locked: Boolean(room.locked),
    lockedBy: room.lockedBy || '',
    lockedByRole: room.lockedByRole || '',
    pinnedMessage,
    messages: roomMessages,
    filteredMessages,
    activeMemberCount: countActiveClassMembers(classId),
    canSend,
    canModerate,
    actor
  };
}

export function sendClassMessage({ className, text, replyToId = '', actor: actorInput } = {}) {
  const { actor, classId, roomKey } = assertRoomReadAccess(actorInput, className);
  const store = readClassChatStore();
  const room = store.rooms[roomKey] || normalizeRoom({ roomKey, classId }, classId);
  if (room.locked && actor.kind !== 'staff') {
    throw chatError(STUDENT_LOCKED_NOTICE, 'ROOM_LOCKED');
  }
  const cleanText = sanitizeChatText(text);
  let replyTo = null;
  const cleanReplyId = String(replyToId || '').trim();
  if (cleanReplyId) {
    const target = store.messages.find(m => m.roomKey === roomKey && m.id === cleanReplyId && !m.deleted);
    if (target) {
      replyTo = {
        id: target.id,
        senderName: target.senderName,
        senderRole: target.senderRole,
        senderBadge: target.senderBadge || '',
        text: target.text.slice(0, 160)
      };
    }
  }
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const message = normalizeMessage({
    id: newId('MSG'),
    roomKey,
    classId,
    senderId: actor.id,
    senderName: actor.name,
    senderRole: actor.role,
    senderBadge: actor.badge || '',
    text: cleanText,
    replyTo,
    reactions: {},
    deleted: false,
    createdAt: nowIso,
    updatedAt: nowMs
  });
  store.rooms[roomKey] = { ...room, classId, roomKey };
  store.messages.push(message);
  writeClassChatStore(store, { action: 'send', classId, roomKey, messageId: message.id });
  return message;
}

export function toggleMessageReaction({ className, messageId, emoji, actor: actorInput } = {}) {
  const { actor, classId, roomKey } = assertRoomReadAccess(actorInput, className);
  if (!QUICK_REACTIONS.includes(emoji)) {
    throw chatError('অনুমোদিত ইমোজি প্রতিক্রিয়া নির্বাচন করুন।', 'INVALID_REACTION');
  }
  const store = readClassChatStore();
  const idx = store.messages.findIndex(m => m.roomKey === roomKey && m.id === String(messageId || ''));
  if (idx < 0) throw chatError('বার্তাটি পাওয়া যায়নি।', 'MESSAGE_NOT_FOUND');
  const current = store.messages[idx];
  if (current.deleted) throw chatError('মুছে ফেলা বার্তায় প্রতিক্রিয়া দেওয়া যাবে না।', 'MESSAGE_DELETED');
  const reactions = normalizeReactions(current.reactions);
  const existing = new Set(reactions[emoji] || []);
  const added = !existing.has(actor.id);
  if (added) existing.add(actor.id);
  else existing.delete(actor.id);
  if (existing.size) reactions[emoji] = [...existing];
  else delete reactions[emoji];
  const updated = {
    ...current,
    reactions,
    updatedAt: Date.now()
  };
  store.messages[idx] = updated;
  writeClassChatStore(store, { action: 'react', classId, roomKey, messageId: updated.id, emoji, added });
  return updated;
}

export function deleteClassMessage({ className, messageId, actor: actorInput } = {}) {
  const { actor, classId, roomKey } = assertStaffModerationAccess(actorInput, className);
  const store = readClassChatStore();
  const idx = store.messages.findIndex(m => m.roomKey === roomKey && m.id === String(messageId || ''));
  if (idx < 0) throw chatError('বার্তাটি পাওয়া যায়নি।', 'MESSAGE_NOT_FOUND');
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const updated = {
    ...store.messages[idx],
    text: '',
    replyTo: null,
    reactions: {},
    deleted: true,
    deletedBy: actor.name,
    deletedById: actor.id,
    deletedByRole: actor.role,
    deletedAt: nowIso,
    updatedAt: nowMs
  };
  store.messages[idx] = updated;
  const room = store.rooms[roomKey];
  if (room && room.pinnedMessageId === updated.id) {
    store.rooms[roomKey] = {
      ...room,
      pinnedMessageId: '',
      pinnedBy: '',
      pinnedByRole: '',
      pinnedAt: '',
      updatedAt: nowMs
    };
  }
  writeClassChatStore(store, { action: 'delete', classId, roomKey, messageId: updated.id });
  return updated;
}

export function pinClassMessage({ className, messageId, actor: actorInput } = {}) {
  const { actor, classId, roomKey } = assertStaffModerationAccess(actorInput, className);
  const store = readClassChatStore();
  const target = store.messages.find(m => m.roomKey === roomKey && m.id === String(messageId || ''));
  if (!target) throw chatError('পিন করার জন্য বার্তাটি পাওয়া যায়নি।', 'MESSAGE_NOT_FOUND');
  if (target.deleted) throw chatError('মুছে ফেলা বার্তা পিন করা যাবে না।', 'MESSAGE_DELETED');
  const prevRoom = store.rooms[roomKey] || normalizeRoom({ roomKey, classId }, classId);
  const nextRoom = {
    ...prevRoom,
    classId,
    roomKey,
    pinnedMessageId: target.id,
    pinnedBy: actor.name,
    pinnedByRole: actor.role,
    pinnedAt: new Date().toISOString(),
    updatedAt: Date.now()
  };
  store.rooms[roomKey] = nextRoom;
  writeClassChatStore(store, { action: 'pin', classId, roomKey, messageId: target.id });
  return nextRoom;
}

export function unpinClassMessage({ className, actor: actorInput } = {}) {
  const { classId, roomKey } = assertStaffModerationAccess(actorInput, className);
  const store = readClassChatStore();
  const prevRoom = store.rooms[roomKey] || normalizeRoom({ roomKey, classId }, classId);
  const nextRoom = {
    ...prevRoom,
    classId,
    roomKey,
    pinnedMessageId: '',
    pinnedBy: '',
    pinnedByRole: '',
    pinnedAt: '',
    updatedAt: Date.now()
  };
  store.rooms[roomKey] = nextRoom;
  writeClassChatStore(store, { action: 'unpin', classId, roomKey });
  return nextRoom;
}

export function setClassRoomLock({ className, locked, actor: actorInput } = {}) {
  const { actor, classId, roomKey } = assertStaffModerationAccess(actorInput, className);
  const store = readClassChatStore();
  const prevRoom = store.rooms[roomKey] || normalizeRoom({ roomKey, classId }, classId);
  const isLocked = Boolean(locked);
  const nextRoom = {
    ...prevRoom,
    classId,
    roomKey,
    locked: isLocked,
    lockedBy: isLocked ? actor.name : '',
    lockedByRole: isLocked ? actor.role : '',
    lockedAt: isLocked ? new Date().toISOString() : '',
    updatedAt: Date.now()
  };
  store.rooms[roomKey] = nextRoom;
  writeClassChatStore(store, { action: isLocked ? 'lock' : 'unlock', classId, roomKey });
  return nextRoom;
}

/* ---------- Formatting & XSS-safe HTML Builders ---------- */

function avatarInitial(name) {
  const clean = String(name || '').trim();
  if (!clean) return 'স';
  const chars = Array.from(clean);
  return chars[0] || 'স';
}

function dayBucketKey(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'unknown';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function formatChatDateDivider(isoString, now = new Date()) {
  const targetKey = dayBucketKey(isoString);
  const todayKey = dayBucketKey(now.toISOString());
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayKey = dayBucketKey(yesterday.toISOString());
  if (targetKey === todayKey) return 'আজ';
  if (targetKey === yesterdayKey) return 'গতকাল';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('bn-BD', {
      timeZone: 'Asia/Dhaka',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  } catch {
    return escapeHtml(targetKey);
  }
}

export function formatChatTimestamp(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('bn-BD', {
      timeZone: 'Asia/Dhaka',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  } catch {
    return toBnDigits(date.toTimeString().slice(0, 5));
  }
}

export function renderMessageBubbleHtml(msg, actorInput, { pinnedMessageId = '' } = {}) {
  const actor = normalizeChatActor(actorInput);
  const isMine = msg.senderId === actor.id && msg.senderRole === actor.role;
  const isStaffSender = ['teacher', 'manager', 'admin'].includes(msg.senderRole);
  const roleBadgeText = isStaffSender ? (STAFF_ROLE_BADGES[msg.senderRole] || msg.senderBadge || '') : '';
  const isPinned = Boolean(pinnedMessageId && pinnedMessageId === msg.id && !msg.deleted);
  const timeLabel = formatChatTimestamp(msg.createdAt);

  if (msg.deleted) {
    const deletedMeta = msg.deletedByRole && STAFF_ROLE_BADGES[msg.deletedByRole]
      ? ` (${escapeHtml(STAFF_ROLE_BADGES[msg.deletedByRole])} কর্তৃক অপসারিত)`
      : '';
    return `<article class="chat-row ${isMine ? 'is-mine' : 'is-other'} is-deleted" data-chat-msg-id="${escapeHtml(msg.id)}">
      ${isMine ? '' : `<div class="chat-avatar" aria-hidden="true">${escapeHtml(avatarInitial(msg.senderName))}</div>`}
      <div class="chat-bubble-wrap">
        <div class="chat-bubble is-deleted-bubble">
          <p class="chat-deleted-copy">বার্তাটি মুছে ফেলা হয়েছে${deletedMeta}</p>
          <span class="chat-time">${escapeHtml(timeLabel)}</span>
        </div>
      </div>
    </article>`;
  }

  const badgeHtml = roleBadgeText
    ? `<span class="chat-role-badge is-${escapeHtml(msg.senderRole)}">${escapeHtml(roleBadgeText)}</span>`
    : '';
  const pinnedTag = isPinned ? `<span class="chat-pin-indicator" title="পিন করা বার্তা">📌 পিন করা</span>` : '';

  const replyHtml = msg.replyTo
    ? `<button type="button" class="chat-reply-quote" data-chat-action="jump-msg" data-target-msg-id="${escapeHtml(msg.replyTo.id)}">
        <span class="chat-reply-quote-author">${escapeHtml(msg.replyTo.senderName)}${msg.replyTo.senderBadge ? ` • ${escapeHtml(msg.replyTo.senderBadge)}` : ''}</span>
        <span class="chat-reply-quote-text">${escapeHtml(msg.replyTo.text)}</span>
      </button>`
    : '';

  const reactionCounts = QUICK_REACTIONS.map(emoji => {
    const users = Array.isArray(msg.reactions?.[emoji]) ? msg.reactions[emoji] : [];
    const active = users.includes(actor.id);
    return `<button type="button" class="chat-reaction-btn${users.length ? ' has-count' : ''}${active ? ' is-reacted' : ''}" data-chat-action="react" data-msg-id="${escapeHtml(msg.id)}" data-emoji="${escapeHtml(emoji)}" aria-pressed="${active ? 'true' : 'false'}" title="${escapeHtml(emoji)} প্রতিক্রিয়া">
      <span aria-hidden="true">${escapeHtml(emoji)}</span>${users.length ? `<span class="chat-reaction-count">${toBnDigits(users.length)}</span>` : ''}
    </button>`;
  }).join('');

  const modControls = actor.kind === 'staff'
    ? `<button type="button" class="chat-msg-tool" data-chat-action="${isPinned ? 'unpin' : 'pin'}" data-msg-id="${escapeHtml(msg.id)}">${isPinned ? 'আনপিন' : '📌 পিন'}</button>
       <button type="button" class="chat-msg-tool is-danger" data-chat-action="delete" data-msg-id="${escapeHtml(msg.id)}">মুছুন</button>`
    : '';

  return `<article class="chat-row ${isMine ? 'is-mine' : 'is-other'}${isStaffSender ? ' is-staff' : ''}${isPinned ? ' is-pinned' : ''}" data-chat-msg-id="${escapeHtml(msg.id)}">
    ${isMine ? '' : `<div class="chat-avatar is-${escapeHtml(msg.senderRole)}" aria-hidden="true">${escapeHtml(avatarInitial(msg.senderName))}</div>`}
    <div class="chat-bubble-wrap">
      <div class="chat-bubble">
        <header class="chat-bubble-meta">
          <strong class="chat-sender-name">${escapeHtml(msg.senderName)}</strong>
          ${badgeHtml}
          ${pinnedTag}
        </header>
        ${replyHtml}
        <div class="chat-bubble-text">${escapeHtml(msg.text)}</div>
        <footer class="chat-bubble-foot">
          <time class="chat-time" datetime="${escapeHtml(msg.createdAt)}">${escapeHtml(timeLabel)}</time>
          <div class="chat-msg-tools">
            <button type="button" class="chat-msg-tool" data-chat-action="reply" data-msg-id="${escapeHtml(msg.id)}">উত্তর দিন</button>
            ${modControls}
          </div>
        </footer>
      </div>
      <div class="chat-reactions-bar" role="group" aria-label="প্রতিক্রিয়া">${reactionCounts}</div>
    </div>
  </article>`;
}

/* ---------- Interactive WhatsApp / Telegram-Style Portal Widget ---------- */

export function mountClassChat(target, options = {}) {
  const root = typeof target === 'string' ? document.querySelector(target) : target;
  if (!root) return null;
  if (root.__apcClassChatInstance) {
    const pendingCls = typeof window !== 'undefined' ? normalizeClassId(window.__apcPendingChatClass || '') : '';
    if (pendingCls) {
      window.__apcPendingChatClass = '';
      try { root.__apcClassChatInstance.selectClass(pendingCls); } catch { /* ignore */ }
    }
    void root.__apcClassChatInstance.refresh();
    return root.__apcClassChatInstance;
  }

  const portal = ['teacher', 'manager', 'admin'].includes(options.portal) ? options.portal : 'student';
  const pendingInitialClass = (!options.initialClass && typeof window !== 'undefined' && portal !== 'student')
    ? normalizeClassId(window.__apcPendingChatClass || '')
    : '';
  if (pendingInitialClass && typeof window !== 'undefined') window.__apcPendingChatClass = '';
  const state = {
    actor: null,
    selectedClass: normalizeClassId(options.initialClass || pendingInitialClass || '') || CORE_CHAT_CLASSES[2],
    search: '',
    replyTo: null,
    error: '',
    highlightedId: '',
    destroyed: false
  };

  root.innerHTML = `
    <div class="class-chat-shell" data-chat-portal="${escapeHtml(portal)}">
      <div class="class-chat-switcher-wrap" data-chat-switcher-wrap ${portal === 'student' ? 'hidden' : ''}>
        <div class="class-chat-tabs" role="tablist" aria-label="শ্রেণি নির্বাচন ট্যাব" data-chat-class-tabs></div>
        <label class="class-chat-select-label">
          <span class="sr-only">শ্রেণি নির্বাচন</span>
          <select class="class-chat-select" data-chat-class-select aria-label="শ্রেণি নির্বাচন করুন"></select>
        </label>
      </div>

      <header class="class-chat-header">
        <div class="class-chat-header-main">
          <span class="class-chat-room-icon" aria-hidden="true">${iconMarkup('chat')}</span>
          <div class="class-chat-room-copy">
            <h2 class="class-chat-room-title" data-chat-room-title>শ্রেণি চ্যাট</h2>
            <p class="class-chat-room-sub">
              <span data-chat-member-count>সক্রিয় সদস্য: ০ জন</span>
              <span class="class-chat-e2ee-pill" data-chat-e2ee-badge title="বার্তা এই ডিভাইসে স্থায়ীভাবে সেভ থাকে এবং AES-256-GCM এনক্রিপ্টেড ফায়ারবেস রিলে ৭ দিন পর স্বয়ংক্রিয়ভাবে মুছে যায়">🔐 এনক্রিপ্টেড রিলে (৭ দিন)</span>
              <span class="class-chat-lock-pill" data-chat-lock-pill hidden>🔒 স্টাফ অনলি</span>
            </p>
          </div>
        </div>
        <div class="class-chat-header-tools">
          <div class="class-chat-search-box">
            <span class="class-chat-search-icon" aria-hidden="true">🔍</span>
            <input type="search" class="class-chat-search-input" data-chat-search placeholder="বার্তা খুঁজুন…" autocomplete="off" aria-label="চ্যাটে বার্তা খুঁজুন">
            <button type="button" class="class-chat-search-clear" data-chat-action="clear-search" aria-label="খোঁজা মুছুন" hidden>×</button>
          </div>
          <button type="button" class="class-chat-lock-btn" data-chat-action="toggle-lock" aria-pressed="false" ${portal === 'student' ? 'hidden' : ''}>🔒 চ্যাট লক</button>
        </div>
      </header>

      <div class="class-chat-pinned" data-chat-pinned-banner hidden></div>

      <div class="class-chat-access-gate" data-chat-access-gate role="status" hidden></div>

      <div class="class-chat-feed" data-chat-feed role="log" aria-live="polite" aria-label="শ্রেণি আলোচনা বার্তা তালিকা"></div>

      <div class="class-chat-reply-bar" data-chat-reply-bar hidden></div>

      <p class="class-chat-error" data-chat-error role="alert" hidden></p>

      <footer class="class-chat-composer-wrap" data-chat-composer-wrap>
        <div class="class-chat-locked-notice" data-chat-locked-notice role="status" hidden>${escapeHtml(STUDENT_LOCKED_NOTICE)}</div>
        <div class="class-chat-staff-lock-hint" data-chat-staff-lock-hint hidden>🔒 চ্যাট লক চালু আছে — শিক্ষার্থীরা শুধু পড়তে পারবে, স্টাফ বার্তা পাঠাতে পারবেন।</div>
        <div class="class-chat-composer" data-chat-composer-form>
          <textarea class="class-chat-input" data-chat-input rows="1" maxlength="${MAX_CHAT_MESSAGE_LENGTH}" placeholder="বার্তা লিখুন… (পাঠাতে Enter, নতুন লাইন Shift+Enter)" aria-label="বার্তা লিখুন"></textarea>
          <div class="class-chat-send-col">
            <small class="class-chat-char-count" data-chat-char-count>০/${toBnDigits(MAX_CHAT_MESSAGE_LENGTH)}</small>
            <button type="button" class="class-chat-send-btn" data-chat-action="send" aria-label="বার্তা পাঠান">পাঠান ➤</button>
          </div>
        </div>
      </footer>
    </div>
  `;

  const el = selector => root.querySelector(selector);
  const switcherWrap = el('[data-chat-switcher-wrap]');
  const classTabsEl = el('[data-chat-class-tabs]');
  const classSelectEl = el('[data-chat-class-select]');
  const titleEl = el('[data-chat-room-title]');
  const memberCountEl = el('[data-chat-member-count]');
  const lockPillEl = el('[data-chat-lock-pill]');
  const lockBtnEl = el('[data-chat-action="toggle-lock"]');
  const searchInput = el('[data-chat-search]');
  const searchClearBtn = el('[data-chat-action="clear-search"]');
  const pinnedBannerEl = el('[data-chat-pinned-banner]');
  const accessGateEl = el('[data-chat-access-gate]');
  const feedEl = el('[data-chat-feed]');
  const replyBarEl = el('[data-chat-reply-bar]');
  const errorEl = el('[data-chat-error]');
  const composerWrapEl = el('[data-chat-composer-wrap]');
  const lockedNoticeEl = el('[data-chat-locked-notice]');
  const staffLockHintEl = el('[data-chat-staff-lock-hint]');
  const composerFormEl = el('[data-chat-composer-form]');
  const inputEl = el('[data-chat-input]');
  const charCountEl = el('[data-chat-char-count]');

  function showError(msg = '') {
    state.error = msg;
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  }

  function autoResizeInput() {
    if (!inputEl) return;
    inputEl.style.height = 'auto';
    const nextHeight = Math.min(Math.max(inputEl.scrollHeight || 42, 42), 132);
    inputEl.style.height = `${nextHeight}px`;
    if (charCountEl) {
      const len = inputEl.value.length;
      charCountEl.textContent = `${toBnDigits(len)}/${toBnDigits(MAX_CHAT_MESSAGE_LENGTH)}`;
      charCountEl.classList.toggle('is-near-limit', len >= MAX_CHAT_MESSAGE_LENGTH - 80);
    }
  }

  async function resolveCurrentActor() {
    if (typeof options.getActor === 'function') {
      const custom = await options.getActor();
      if (custom) return normalizeChatActor(custom);
    }
    const profileHint = typeof options.getStudent === 'function'
      ? options.getStudent()
      : typeof options.getStaff === 'function'
        ? await options.getStaff()
        : null;
    return resolvePortalChatActor(portal, profileHint);
  }

  function scrollToBottom(force = false) {
    if (!feedEl) return;
    const nearBottom = (feedEl.scrollHeight - feedEl.scrollTop - feedEl.clientHeight) < 120;
    if (force || nearBottom) {
      feedEl.scrollTop = feedEl.scrollHeight;
    }
  }

  function highlightMessage(messageId) {
    if (!messageId || !feedEl) return;
    if (state.search) {
      state.search = '';
      if (searchInput) searchInput.value = '';
      if (searchClearBtn) searchClearBtn.hidden = true;
      paintLoaded();
    }
    const row = Array.from(feedEl.querySelectorAll('[data-chat-msg-id]'))
      .find(node => node.dataset.chatMsgId === String(messageId));
    if (!row) return;
    row.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    row.classList.remove('is-highlighted');
    void row.offsetWidth;
    row.classList.add('is-highlighted');
    clearTimeout(highlightMessage.timer);
    highlightMessage.timer = setTimeout(() => row.classList.remove('is-highlighted'), 1800);
  }

  function renderReplyBar() {
    if (!replyBarEl) return;
    if (!state.replyTo) {
      replyBarEl.hidden = true;
      replyBarEl.innerHTML = '';
      return;
    }
    replyBarEl.hidden = false;
    replyBarEl.innerHTML = `
      <div class="class-chat-reply-preview">
        <div class="class-chat-reply-copy">
          <strong>উত্তর দিচ্ছেন: ${escapeHtml(state.replyTo.senderName)}</strong>
          <span>${escapeHtml(state.replyTo.text)}</span>
        </div>
        <button type="button" class="class-chat-reply-cancel" data-chat-action="cancel-reply" aria-label="উত্তর বাতিল করুন">×</button>
      </div>
    `;
  }

  function renderStaffClassSwitcher(classes, activeClassId) {
    if (portal === 'student' || !switcherWrap) {
      if (switcherWrap) switcherWrap.hidden = true;
      return;
    }
    switcherWrap.hidden = false;
    const store = readClassChatStore();
    const unreadSummary = state.actor ? getUnreadClassChatSummary(state.actor) : { byClass: {} };
    if (classTabsEl) {
      classTabsEl.innerHTML = classes.map(cls => {
        const active = cls === activeClassId;
        const rk = roomKeyForClass(cls);
        const count = store.messages.filter(m => m.roomKey === rk && !m.deleted).length;
        const unreadCount = !active ? (unreadSummary.byClass?.[cls] || 0) : 0;
        const locked = store.rooms[rk]?.locked === true;
        return `<button type="button" role="tab" class="class-chat-tab${active ? ' is-active' : ''}${unreadCount ? ' has-unread' : ''}" data-chat-select-class="${escapeHtml(cls)}" aria-selected="${active ? 'true' : 'false'}">
          <span>${escapeHtml(shortClassTabLabel(cls))}</span>
          ${locked ? '<span aria-hidden="true">🔒</span>' : ''}
          ${unreadCount ? `<span class="class-chat-tab-unread" data-chat-tab-unread>${formatUnreadCountBn(unreadCount)}</span>` : (count ? `<span class="class-chat-tab-count">${toBnDigits(count)}</span>` : '')}
        </button>`;
      }).join('');
    }
    if (classSelectEl) {
      classSelectEl.innerHTML = classes.map(cls =>
        `<option value="${escapeHtml(cls)}"${cls === activeClassId ? ' selected' : ''}>${escapeHtml(cls)}</option>`
      ).join('');
      classSelectEl.value = activeClassId;
    }
  }

  function paintGateMessage(message) {
    if (accessGateEl) {
      accessGateEl.hidden = false;
      accessGateEl.textContent = message;
    }
    if (feedEl) feedEl.hidden = true;
    if (pinnedBannerEl) pinnedBannerEl.hidden = true;
    if (composerWrapEl) composerWrapEl.hidden = true;
  }

  function paintLoaded(forceBottom = false) {
    if (!state.actor) return;
    const classes = listAvailableChatClasses();
    if (state.actor.kind === 'staff' && typeof window !== 'undefined' && window.__apcPendingChatClass) {
      const targetCls = normalizeClassId(window.__apcPendingChatClass);
      window.__apcPendingChatClass = '';
      if (targetCls && classes.includes(targetCls)) state.selectedClass = targetCls;
    }
    const activeClass = state.actor.kind === 'student'
      ? state.actor.classId
      : (classes.includes(state.selectedClass) ? state.selectedClass : (classes[0] || CORE_CHAT_CLASSES[2]));
    state.selectedClass = activeClass;

    if (isChatContainerVisible(root)) {
      markClassRoomRead(state.actor, activeClass);
    }

    renderStaffClassSwitcher(classes, activeClass);

    let view;
    try {
      view = getClassRoomView(activeClass, { actor: state.actor, search: state.search });
    } catch (err) {
      paintGateMessage(err?.message || 'চ্যাট রুম লোড করা যায়নি।');
      return;
    }

    if (accessGateEl) accessGateEl.hidden = true;
    if (feedEl) feedEl.hidden = false;
    if (composerWrapEl) composerWrapEl.hidden = false;

    if (titleEl) titleEl.textContent = view.title;
    if (memberCountEl) memberCountEl.textContent = `সক্রিয় সদস্য: ${toBnDigits(view.activeMemberCount)} জন`;
    if (lockPillEl) lockPillEl.hidden = !view.locked;

    if (lockBtnEl) {
      lockBtnEl.hidden = !view.canModerate;
      lockBtnEl.setAttribute('aria-pressed', view.locked ? 'true' : 'false');
      lockBtnEl.classList.toggle('is-locked', view.locked);
      lockBtnEl.textContent = view.locked ? '🔓 চ্যাট আনলক করুন' : '🔒 চ্যাট লক (স্টাফ অনলি)';
    }

    if (pinnedBannerEl) {
      if (view.pinnedMessage) {
        pinnedBannerEl.hidden = false;
        pinnedBannerEl.innerHTML = `
          <button type="button" class="class-chat-pinned-jump" data-chat-action="jump-pinned" data-target-msg-id="${escapeHtml(view.pinnedMessage.id)}">
            <span class="class-chat-pinned-icon" aria-hidden="true">📌</span>
            <span class="class-chat-pinned-body">
              <strong>পিন করা বার্তা • ${escapeHtml(view.pinnedMessage.senderName)}</strong>
              <span>${escapeHtml(view.pinnedMessage.text)}</span>
            </span>
          </button>
          ${view.canModerate ? `<button type="button" class="class-chat-pinned-unpin" data-chat-action="unpin" aria-label="পিন সরান">আনপিন</button>` : ''}
        `;
      } else {
        pinnedBannerEl.hidden = true;
        pinnedBannerEl.innerHTML = '';
      }
    }

    if (state.replyTo && !view.messages.some(m => m.id === state.replyTo.id && !m.deleted)) {
      state.replyTo = null;
    }
    renderReplyBar();

    if (feedEl) {
      if (!view.filteredMessages.length) {
        const emptyText = state.search
          ? `"${escapeHtml(state.search)}" দিয়ে কোনো বার্তা পাওয়া যায়নি।`
          : `${escapeHtml(view.classId)}-এর আলোচনা কক্ষে এখনো কোনো বার্তা নেই। প্রথম বার্তাটি লিখে আলোচনা শুরু করুন!`;
        feedEl.innerHTML = `<div class="class-chat-empty"><p>${emptyText}</p></div>`;
      } else {
        let lastBucket = '';
        const chunks = [];
        const pinnedId = view.pinnedMessage?.id || '';
        for (const msg of view.filteredMessages) {
          const bucket = dayBucketKey(msg.createdAt);
          if (bucket !== lastBucket) {
            lastBucket = bucket;
            chunks.push(`<div class="class-chat-date-divider"><span>${escapeHtml(formatChatDateDivider(msg.createdAt))}</span></div>`);
          }
          chunks.push(renderMessageBubbleHtml(msg, state.actor, { pinnedMessageId: pinnedId }));
        }
        feedEl.innerHTML = chunks.join('');
      }
      scrollToBottom(forceBottom);
    }

    const studentBlockedByLock = view.locked && state.actor.kind === 'student';
    if (lockedNoticeEl) lockedNoticeEl.hidden = !studentBlockedByLock;
    if (staffLockHintEl) staffLockHintEl.hidden = !(view.locked && state.actor.kind === 'staff');
    if (composerFormEl) composerFormEl.hidden = studentBlockedByLock;
    if (inputEl) inputEl.disabled = studentBlockedByLock;
  }

  async function refresh(forceBottom = false) {
    if (state.destroyed) return;
    try {
      state.actor = await resolveCurrentActor();
      if (state.actor.kind === 'student') state.selectedClass = state.actor.classId;
      showError('');
      paintLoaded(forceBottom);
    } catch (err) {
      state.actor = null;
      paintGateMessage(err?.message || 'শ্রেণি চ্যাট ব্যবহার করতে অনুমোদিত অ্যাকাউন্টে লগইন করুন।');
    }
  }

  function submitComposer() {
    if (!state.actor || !inputEl) return;
    showError('');
    try {
      sendClassMessage({
        className: state.selectedClass,
        text: inputEl.value,
        replyToId: state.replyTo?.id || '',
        actor: state.actor
      });
      inputEl.value = '';
      state.replyTo = null;
      autoResizeInput();
      paintLoaded(true);
    } catch (err) {
      showError(err?.message || 'বার্তা পাঠানো যায়নি।');
      paintLoaded(false);
    }
  }

  root.addEventListener('click', event => {
    const classBtn = event.target.closest('[data-chat-select-class]');
    if (classBtn && state.actor?.kind === 'staff') {
      state.selectedClass = normalizeClassId(classBtn.dataset.chatSelectClass);
      state.replyTo = null;
      showError('');
      paintLoaded(true);
      return;
    }

    const actionBtn = event.target.closest('[data-chat-action]');
    if (!actionBtn) return;
    const action = actionBtn.dataset.chatAction;

    if (action === 'clear-search') {
      state.search = '';
      if (searchInput) searchInput.value = '';
      if (searchClearBtn) searchClearBtn.hidden = true;
      paintLoaded(false);
      return;
    }
    if (action === 'send') {
      submitComposer();
      return;
    }
    if (action === 'cancel-reply') {
      state.replyTo = null;
      renderReplyBar();
      return;
    }
    if (action === 'jump-pinned' || action === 'jump-msg') {
      highlightMessage(actionBtn.dataset.targetMsgId);
      return;
    }

    if (!state.actor) return;
    showError('');
    try {
      if (action === 'reply') {
        const view = getClassRoomView(state.selectedClass, { actor: state.actor });
        const msg = view.messages.find(m => m.id === actionBtn.dataset.msgId && !m.deleted);
        if (msg) {
          state.replyTo = {
            id: msg.id,
            senderName: msg.senderName,
            text: msg.text.slice(0, 140)
          };
          renderReplyBar();
          inputEl?.focus();
        }
      } else if (action === 'react') {
        toggleMessageReaction({
          className: state.selectedClass,
          messageId: actionBtn.dataset.msgId,
          emoji: actionBtn.dataset.emoji,
          actor: state.actor
        });
        paintLoaded(false);
      } else if (action === 'pin') {
        pinClassMessage({
          className: state.selectedClass,
          messageId: actionBtn.dataset.msgId,
          actor: state.actor
        });
        paintLoaded(false);
      } else if (action === 'unpin') {
        unpinClassMessage({
          className: state.selectedClass,
          actor: state.actor
        });
        paintLoaded(false);
      } else if (action === 'delete') {
        deleteClassMessage({
          className: state.selectedClass,
          messageId: actionBtn.dataset.msgId,
          actor: state.actor
        });
        paintLoaded(false);
      } else if (action === 'toggle-lock') {
        const currentView = getClassRoomView(state.selectedClass, { actor: state.actor });
        setClassRoomLock({
          className: state.selectedClass,
          locked: !currentView.locked,
          actor: state.actor
        });
        paintLoaded(false);
      }
    } catch (err) {
      showError(err?.message || 'কাজটি সম্পন্ন করা যায়নি।');
    }
  });

  classSelectEl?.addEventListener('change', () => {
    if (state.actor?.kind !== 'staff') return;
    state.selectedClass = normalizeClassId(classSelectEl.value);
    state.replyTo = null;
    showError('');
    paintLoaded(true);
  });

  searchInput?.addEventListener('input', () => {
    state.search = searchInput.value || '';
    if (searchClearBtn) searchClearBtn.hidden = !state.search;
    paintLoaded(false);
  });

  inputEl?.addEventListener('input', () => {
    if (state.error) showError('');
    autoResizeInput();
  });

  inputEl?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submitComposer();
    }
  });

  const onExternalUpdate = event => {
    if (state.destroyed) return;
    if (event?.type === 'storage' && event.key && event.key !== CLASS_CHAT_KEY && event.key !== KEYS.students) return;
    if (event?.type === 'apc-sync-updated') {
      const col = event.detail?.collection;
      if (col && col !== 'classChat' && col !== 'students' && col !== 'academics') return;
    }
    void refresh(false);
  };

  window.addEventListener('storage', onExternalUpdate);
  window.addEventListener('apc-sync-updated', onExternalUpdate);
  window.addEventListener('apc-class-chat-updated', onExternalUpdate);

  const instance = {
    refresh,
    selectClass(className) {
      if (state.actor?.kind === 'student') {
        assertRoomReadAccess(state.actor, className);
      }
      state.selectedClass = normalizeClassId(className) || state.selectedClass;
      state.replyTo = null;
      paintLoaded(true);
    },
    destroy() {
      state.destroyed = true;
      window.removeEventListener('storage', onExternalUpdate);
      window.removeEventListener('apc-sync-updated', onExternalUpdate);
      window.removeEventListener('apc-class-chat-updated', onExternalUpdate);
      delete root.__apcClassChatInstance;
    }
  };

  root.__apcClassChatInstance = instance;
  autoResizeInput();
  void refresh(true);
  return instance;
}
