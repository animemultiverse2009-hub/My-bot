/**
 * INTERACTION LOCK
 * ================
 * Prevents the same button/select from being processed twice
 * when a user double-clicks or Discord retries the interaction.
 *
 * Each lock key auto-expires after 8 seconds so stale locks never block.
 *
 * Usage in interactionCreate.js:
 *   const lock = require('../interactionLock');
 *   if (!lock.acquire(interaction)) return;  // already being processed
 *   // ... do work ...
 *   lock.release(interaction);               // usually auto-released by expiry
 */

const LOCK_TTL_MS = 8000;  // 8 seconds max lock time

// lockKey → expiry timestamp
const locks = new Map();

// Clean up expired locks every 30s
setInterval(() => {
    const now = Date.now();
    for (const [key, expiry] of locks) {
        if (now > expiry) locks.delete(key);
    }
}, 30_000);

module.exports = {
    /**
     * Try to acquire a lock for this interaction.
     * Returns TRUE if acquired (proceed), FALSE if already locked (skip).
     *
     * Lock key = userId + customId (or commandName).
     * This means the same user can't trigger the same button twice in 8s.
     */
    acquire(interaction) {
        const key    = this._key(interaction);
        const now    = Date.now();
        const expiry = locks.get(key);

        if (expiry && now < expiry) {
            console.log(`🔒 Lock blocked duplicate: ${key}`);
            return false;  // already locked
        }

        locks.set(key, now + LOCK_TTL_MS);
        return true;
    },

    /**
     * Release a lock early (call after sending reply, before heavy background work)
     */
    release(interaction) {
        locks.delete(this._key(interaction));
    },

    _key(interaction) {
        const userId = interaction.user?.id || 'unknown';
        const action = interaction.customId || interaction.commandName || 'unknown';
        return `${userId}:${action}`;
    }
};
