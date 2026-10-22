#!/usr/bin/env node
/* Strictly READ-ONLY student data validation & duplicate audit script.
   Scans seeded datasets or an optional JSON export/RTDB snapshot file and reports:
     • blank / missing Student IDs
     • non-YYMMDDSSS Student IDs (legacy or malformed)
     • duplicate Student IDs
     • invalid or duplicate Bangladeshi mobile numbers (after normalization)
     • invalid or case-insensitively duplicate usernames
     • invalid or case-insensitively duplicate emails
     • any plaintext password/PIN fields
   NEVER mutates, overwrites, or deletes any file, storage key, or database node. */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { adminStudents, initialTransactions } from '../js/admin-data.js';
import { isValidStudentId, toAsciiDigits } from '../js/idGenerator.js';
import { contactNumber, isContactNumber, normalizeEmail, isValidEmail, normalizeUsername, usernameError } from '../js/account-policy.js';

export function auditStudentDataset({ students = [], accounts = [], sourceName = 'dataset' } = {}) {
  const report = {
    sourceName,
    readOnly: true,
    scannedStudents: Array.isArray(students) ? students.length : 0,
    scannedAccounts: Array.isArray(accounts) ? accounts.length : 0,
    validNineDigitIds: 0,
    blankIds: [],
    nonStandardIds: [],
    duplicateIds: [],
    invalidMobiles: [],
    duplicateMobiles: [],
    invalidUsernames: [],
    duplicateUsernames: [],
    invalidEmails: [],
    duplicateEmails: [],
    plaintextSecrets: []
  };

  const idMap = new Map();
  const mobileMap = new Map();
  const usernameMap = new Map();
  const emailMap = new Map();

  const rows = Array.isArray(students) ? students : [];
  rows.forEach((rawRow, idx) => {
    const row = rawRow && typeof rawRow === 'object' ? rawRow : {};
    const label = `row#${idx + 1} (${row.name || row.nameBn || row.nameEn || 'unnamed'})`;
    const rawId = String(row.id ?? '').trim();
    const normalizedId = toAsciiDigits(rawId);

    if (!normalizedId) {
      report.blankIds.push({ index: idx, name: row.name || '', status: row.status || '' });
    } else {
      if (isValidStudentId(normalizedId)) {
        report.validNineDigitIds += 1;
      } else {
        report.nonStandardIds.push({
          index: idx,
          id: rawId,
          name: row.name || row.nameBn || '',
          status: row.status || '',
          note: 'Legacy / non-YYMMDDSSS format (preserved untouched)'
        });
      }
      const prev = idMap.get(normalizedId);
      if (prev) {
        report.duplicateIds.push({ id: normalizedId, first: prev, duplicate: label });
      } else {
        idMap.set(normalizedId, label);
      }
    }

    const rawMobile = String(row.mobile || row.studentMobile || '').trim();
    const normalizedMobile = contactNumber(rawMobile);
    if (!normalizedMobile || !isContactNumber(normalizedMobile)) {
      report.invalidMobiles.push({ index: idx, id: rawId || null, mobile: rawMobile });
    } else {
      const prevMobile = mobileMap.get(normalizedMobile);
      if (prevMobile && prevMobile.index !== idx) {
        report.duplicateMobiles.push({ mobile: normalizedMobile, first: prevMobile.label, duplicate: label });
      } else if (!prevMobile) {
        mobileMap.set(normalizedMobile, { index: idx, id: normalizedId, label });
      }
    }

    const rawUsername = String(row.username || '').trim();
    if (rawUsername) {
      const normalizedUser = normalizeUsername(rawUsername);
      const err = usernameError(normalizedUser);
      if (err) {
        report.invalidUsernames.push({ index: idx, id: rawId || null, username: rawUsername, error: err });
      } else {
        const prevUser = usernameMap.get(normalizedUser);
        if (prevUser && prevUser.index !== idx) {
          report.duplicateUsernames.push({ username: normalizedUser, first: prevUser.label, duplicate: label });
        } else if (!prevUser) {
          usernameMap.set(normalizedUser, { index: idx, id: normalizedId, label });
        }
      }
    }

    const rawEmail = String(row.email || '').trim();
    if (rawEmail) {
      const normalizedMail = normalizeEmail(rawEmail);
      if (!isValidEmail(normalizedMail)) {
        report.invalidEmails.push({ index: idx, id: rawId || null, email: rawEmail });
      } else {
        const prevMail = emailMap.get(normalizedMail);
        if (prevMail && prevMail.index !== idx) {
          report.duplicateEmails.push({ email: normalizedMail, first: prevMail.label, duplicate: label });
        } else if (!prevMail) {
          emailMap.set(normalizedMail, { index: idx, id: normalizedId, label });
        }
      }
    }

    if (typeof row.pin === 'string' || typeof row.password === 'string') {
      report.plaintextSecrets.push({ scope: 'student', id: rawId || null, label });
    }
  });

  const acctRows = Array.isArray(accounts) ? accounts : [];
  acctRows.forEach((rawAcct, idx) => {
    const acct = rawAcct && typeof rawAcct === 'object' ? rawAcct : {};
    const acctId = toAsciiDigits(String(acct.studentId || acct.student?.id || '').trim());
    const label = `account#${idx + 1} (${acct.username || acctId || 'unnamed'})`;

    if (acct.username) {
      const normalizedUser = normalizeUsername(acct.username);
      const err = usernameError(normalizedUser);
      if (err) {
        report.invalidUsernames.push({ index: idx, id: acctId || null, username: acct.username, error: err });
      } else {
        const prevUser = usernameMap.get(normalizedUser);
        if (prevUser && prevUser.id && acctId && prevUser.id !== acctId) {
          report.duplicateUsernames.push({ username: normalizedUser, first: prevUser.label, duplicate: label });
        } else if (!prevUser) {
          usernameMap.set(normalizedUser, { id: acctId, label });
        }
      }
    }

    if (acct.email) {
      const normalizedMail = normalizeEmail(acct.email);
      if (!isValidEmail(normalizedMail)) {
        report.invalidEmails.push({ index: idx, id: acctId || null, email: acct.email });
      } else {
        const prevMail = emailMap.get(normalizedMail);
        if (prevMail && prevMail.id && acctId && prevMail.id !== acctId) {
          report.duplicateEmails.push({ email: normalizedMail, first: prevMail.label, duplicate: label });
        } else if (!prevMail) {
          emailMap.set(normalizedMail, { id: acctId, label });
        }
      }
    }

    if (typeof acct.pin === 'string' || typeof acct.password === 'string') {
      report.plaintextSecrets.push({ scope: 'account', id: acctId || null, label });
    }
  });

  return report;
}

function parseExternalSnapshot(filePath) {
  const raw = JSON.parse(readFileSync(resolve(filePath), 'utf8'));
  const root = raw?.activePlusSync?.v1 || raw?.collections || raw;
  const studentsNode = root?.students || raw?.['activePlus.admin.students.v1'] || [];
  const accountsNode = root?.studentAccounts || root?.accounts || raw?.['activePlus.accounts.v1'] || [];
  const students = Array.isArray(studentsNode) ? studentsNode : Object.values(studentsNode || {});
  const accounts = Array.isArray(accountsNode) ? accountsNode : Object.values(accountsNode || {});
  return { students, accounts };
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isCli) {
  const argPath = process.argv[2];
  const reports = [];
  if (argPath) {
    const ext = parseExternalSnapshot(argPath);
    reports.push(auditStudentDataset({ ...ext, sourceName: argPath }));
  } else {
    const mainReport = auditStudentDataset({
      students: adminStudents,
      accounts: [],
      sourceName: 'js/admin-data.js (adminStudents)'
    });
    mainReport.referencedIdsInTransactions = [...new Set((initialTransactions || []).map(tx => tx?.studentId).filter(Boolean))];
    reports.push(mainReport);
  }
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), mode: 'READ_ONLY_NO_MUTATIONS', reports }, null, 2));
}
