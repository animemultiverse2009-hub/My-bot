/**
 * DATA CACHE — In-memory store with debounced atomic disk writes
 * ==============================================================
 * This is the core of the speed system.
 *
 * BEFORE: Every button click → readFileSync from disk (~5-20ms each)
 * AFTER:  Every button click → read from RAM (~0.01ms)
 *         Disk writes happen in background every 2 seconds max
 *
 * Usage:
 *   const cache = require('./dataCache');
 *   cache.get(guildId, 'claims')          → object (from RAM)
 *   cache.set(guildId, 'claims', data)    → writes to RAM, schedules disk flush
 *   cache.patch(guildId, 'claims', fn)    → atomic read-modify-write in RAM
 */

const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const FLUSH_DEBOUNCE_MS = 1500;   // write to disk at most once per 1.5s per file
const GUILDS_DIR = path.join(__dirname, 'guilds');

// ── Internal state ────────────────────────────────────────────────────────────
// store[guildId][filename] = { data: object, dirty: bool, timer: TimeoutId }
const store = {};

// ── Helpers ───────────────────────────────────────────────────────────────────
function guildDir(guildId) {
    const dir = path.join(GUILDS_DIR, guildId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function readFromDisk(guildId, filename) {
    try {
        const fp = path.join(guildDir(guildId), filename + '.json');
        if (!fs.existsSync(fp)) return {};
        return JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch { return {}; }
}

function writeToDisk(guildId, filename, data) {
    try {
        const fp  = path.join(guildDir(guildId), filename + '.json');
        const tmp = fp + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, fp);   // atomic replace
    } catch (e) {
        console.error(`❌ Cache flush ${guildId}/${filename}:`, e.message);
    }
}

function ensureGuild(guildId) {
    if (!store[guildId]) store[guildId] = {};
}

function ensureFile(guildId, filename) {
    ensureGuild(guildId);
    if (!store[guildId][filename]) {
        // Load from disk on first access — this is the ONLY disk read per file per session
        store[guildId][filename] = {
            data:  readFromDisk(guildId, filename),
            dirty: false,
            timer: null
        };
    }
}

function schedulFlush(guildId, filename) {
    const entry = store[guildId][filename];
    entry.dirty = true;

    // Debounce: reset timer on every write — only flush after writes stop
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
        writeToDisk(guildId, filename, entry.data);
        entry.dirty = false;
        entry.timer = null;
    }, FLUSH_DEBOUNCE_MS);
}

// ── Public API ────────────────────────────────────────────────────────────────

const cache = {
    /**
     * Get entire file contents from memory (instant)
     */
    get(guildId, filename) {
        ensureFile(guildId, filename);
        return store[guildId][filename].data;
    },

    /**
     * Replace entire file contents in memory + schedule disk write
     */
    set(guildId, filename, data) {
        ensureFile(guildId, filename);
        store[guildId][filename].data = data;
        schedulFlush(guildId, filename);
    },

    /**
     * Atomic read-modify-write.
     * fn receives the current object and must return the modified object.
     * Example: cache.patch(guildId, 'claims', c => { c[channelId] = newClaim; return c; })
     */
    patch(guildId, filename, fn) {
        ensureFile(guildId, filename);
        const current  = store[guildId][filename].data;
        const updated  = fn(current);
        store[guildId][filename].data = updated;
        schedulFlush(guildId, filename);
        return updated;
    },

    /**
     * Force immediate flush of a specific file (use before process exit)
     */
    flushNow(guildId, filename) {
        if (!store[guildId]?.[filename]) return;
        const entry = store[guildId][filename];
        if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
        if (entry.dirty) {
            writeToDisk(guildId, filename, entry.data);
            entry.dirty = false;
        }
    },

    /**
     * Flush ALL dirty files immediately (call on SIGINT/SIGTERM)
     */
    flushAll() {
        let count = 0;
        for (const guildId of Object.keys(store)) {
            for (const filename of Object.keys(store[guildId])) {
                const entry = store[guildId][filename];
                if (entry.dirty || entry.timer) {
                    if (entry.timer) clearTimeout(entry.timer);
                    writeToDisk(guildId, filename, entry.data);
                    entry.dirty = false;
                    entry.timer = null;
                    count++;
                }
            }
        }
        if (count > 0) console.log(`💾 Cache: flushed ${count} dirty file(s) on shutdown`);
    },

    /**
     * Preload all files for all guilds at startup (warms the cache)
     * Call this once in ready.js after guilds are available
     */
    warmup(guildIds) {
        const files = ['invites', 'claims', 'stats', 'config'];
        let loaded  = 0;
        for (const gid of guildIds) {
            for (const f of files) {
                ensureFile(gid, f);
                loaded++;
            }
        }
        console.log(`🔥 Cache warmed: ${loaded} files across ${guildIds.length} guild(s) loaded into RAM`);
    },

    /** Direct user invite access helpers (convenience wrappers) */
    getInvites(guildId) {
        return this.get(guildId, 'invites');
    },

    getUserInvites(userId, guildId) {
        const invites = this.getInvites(guildId);
        return invites[userId] || { total: 0, bonus: 0, left: 0, fake: 0, verified: 0, invitedUsers: [] };
    },

    setUserInvites(userId, data, guildId) {
        this.patch(guildId, 'invites', inv => {
            inv[userId] = {
                total:        Math.max(0, data.total    || 0),
                bonus:        Math.max(0, data.bonus    || 0),
                left:         Math.max(0, data.left     || 0),
                fake:         Math.max(0, data.fake     || 0),
                verified:     Math.max(0, data.verified || 0),
                invitedUsers: data.invitedUsers || []
            };
            return inv;
        });
    },

    getClaims(guildId) {
        return this.get(guildId, 'claims');
    },

    getClaim(channelId, guildId) {
        return this.getClaims(guildId)[channelId] || null;
    },

    setClaim(channelId, claimData, guildId) {
        this.patch(guildId, 'claims', c => { c[channelId] = claimData; return c; });
    },

    deleteClaim(channelId, guildId) {
        this.patch(guildId, 'claims', c => { delete c[channelId]; return c; });
    }
};

module.exports = cache;
