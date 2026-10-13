/* Trusted first-admin provisioning. This module has no Firebase SDK imports so
 * its transaction/rollback invariants can be exercised without credentials.
 * Only bootstrap-first-admin.cjs (ADC or emulators) should invoke it. */
const crypto = require('node:crypto');

function profileForBootstrap({ email, username, fullName, password }) {
  const address = String(email || '').trim().toLowerCase();
  const handle = String(username || '').trim().toLowerCase();
  const name = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.endsWith('@accounts.activeplus.app')) {
    throw new Error('A real email address is required for Firebase Auth');
  }
  if (!/^[a-z][a-z0-9._]{3,19}$/.test(handle) || ['admin', 'administrator', 'root', 'null', 'undefined'].includes(handle)) {
    throw new Error('Admin username is invalid');
  }
  if (name.length < 2 || name.length > 100) throw new Error('Admin name must be 2–100 characters');
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('Admin password must be 12–128 characters');
  }
  return { email: address, username: handle, fullName: name, password };
}

async function bootstrapFirstAdmin({ auth, db, serverTimestamp, profile, claimId = crypto.randomUUID() }) {
  if (!auth || !db || typeof serverTimestamp !== 'function') throw new Error('Trusted Admin SDK required');
  const data = profileForBootstrap(profile || {});
  const bootstrapRef = db.doc('system/bootstrap');
  const usernameRef = db.doc(`usernameIndex/${data.username}`);
  // A durable lock precedes Auth.createUser. A crash leaves the lock in place:
  // never auto-reset it and risk minting another Admin behind an orphaned UID.
  await db.runTransaction(async tx => {
    const [lock, handle] = await Promise.all([tx.get(bootstrapRef), tx.get(usernameRef)]);
    if (lock.exists || handle.exists) throw new Error('Admin already initialized or username reserved');
    tx.create(bootstrapRef, { state: 'provisioning', claimId, requestedAt: serverTimestamp() });
  });
  let created = null;
  try {
    created = await auth.createUser({ email: data.email, password: data.password, displayName: data.fullName, disabled: false });
    await auth.setCustomUserClaims(created.uid, { role: 'admin', status: 'active', mustChangePassword: false });
    await db.runTransaction(async tx => {
      const [lock, handle] = await Promise.all([tx.get(bootstrapRef), tx.get(usernameRef)]);
      if (!lock.exists || lock.data().state !== 'provisioning' || lock.data().claimId !== claimId || handle.exists) {
        throw new Error('Admin bootstrap lock changed; do not retry blindly');
      }
      const now = serverTimestamp();
      tx.create(usernameRef, { uid: created.uid, role: 'admin', createdAt: now });
      tx.create(db.doc(`users/${created.uid}`), {
        uid: created.uid, role: 'admin', status: 'active', accountOwner: 'first-admin',
        fullName: data.fullName, email: data.email, username: data.username,
        mustChangePassword: false, createdAt: now, updatedAt: now
      });
      tx.update(bootstrapRef, {
        state: 'active', uid: created.uid, username: data.username,
        createdAt: now, claimId: null
      });
    });
    return { uid: created.uid, email: data.email, username: data.username };
  } catch (error) {
    // Only unlock after the UID has been removed. A failed rollback retains the
    // lock for manual recovery instead of allowing a second Admin account.
    let removed = !created;
    if (created) {
      try { await auth.deleteUser(created.uid); removed = true; } catch { /* retain lock */ }
    }
    if (removed) {
      try {
        await db.runTransaction(async tx => {
          const lock = await tx.get(bootstrapRef);
          if (lock.exists && lock.data().state === 'provisioning' && lock.data().claimId === claimId) tx.delete(bootstrapRef);
        });
      } catch { /* a stale lock is safer than a second Admin */ }
    }
    throw error;
  }
}

module.exports = { bootstrapFirstAdmin, profileForBootstrap };
