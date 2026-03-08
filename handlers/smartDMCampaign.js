/**
 * SMART DM CAMPAIGN SYSTEM
 * ========================
 * Scores every member in enabled guilds by activity level, then DMs them
 * from highest → lowest priority. Never DMs the same person twice globally.
 * Respects Discord rate limits automatically.
 *
 * Activity scoring (max 100 points per member):
 *   +30  Currently online
 *   +20  Currently idle (still active, just stepped away)
 *   +25  Joined within last 7 days (freshest attention)
 *   +15  Joined within last 30 days
 *   +10  Has 3+ roles (engaged, participated in server)
 *   + 5  Has any role beyond @everyone
 *   +10  Has a custom status or activity set (actively using Discord right now)
 *   + 5  Has a profile avatar (not a default account)
 *   - 0  Offline / invisible / DND (still gets DM'd, just lowest priority)
 *   - ∞  Bots, already DM'd users, members with DMs closed → skipped entirely
 */

const fs   = require('fs');
const path = require('path');

// ── Constants ─────────────────────────────────────────────────────────────────
const DM_SENT_FILE    = path.join(__dirname, '../data/dm-sent.json');
const DM_CONFIG_FILE  = path.join(__dirname, '../data/dm-campaign.json');
const DM_STATS_FILE   = path.join(__dirname, '../data/dm-stats.json');

// Speed presets (delay between DMs in milliseconds)
const SPEED_PRESETS = {
    slow:   { min: 8 * 60 * 1000,  max: 14 * 60 * 1000, label: 'Slow (8–14 min)'    },
    medium: { min: 3 * 60 * 1000,  max: 7  * 60 * 1000, label: 'Medium (3–7 min)'   },
    fast:   { min: 90 * 1000,       max: 3  * 60 * 1000, label: 'Fast (1.5–3 min)'   }
};

// ── File helpers ──────────────────────────────────────────────────────────────
function loadFile(filepath, defaultVal = {}) {
    try {
        if (!fs.existsSync(filepath)) {
            fs.mkdirSync(path.dirname(filepath), { recursive: true });
            fs.writeFileSync(filepath, JSON.stringify(defaultVal, null, 2));
            return defaultVal;
        }
        return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch { return defaultVal; }
}

function saveFile(filepath, data) {
    try {
        fs.mkdirSync(path.dirname(filepath), { recursive: true });
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    } catch (e) { console.error('DM System save error:', e.message); }
}

// ── Activity Scorer ───────────────────────────────────────────────────────────
function scoreMember(member) {
    let score = 0;
    const reasons = [];

    // Presence / online status
    const status = member.presence?.status;
    if (status === 'online') {
        score += 30;
        reasons.push('+30 online');
    } else if (status === 'idle') {
        score += 20;
        reasons.push('+20 idle');
    } else if (status === 'dnd') {
        score += 5;
        reasons.push('+5 dnd');
    }
    // offline/invisible = +0

    // Active client (desktop/mobile/web detected via activities)
    const hasActivity = member.presence?.activities?.length > 0;
    if (hasActivity) {
        score += 10;
        reasons.push('+10 has activity/status');
    }

    // Join recency
    const joinedAt   = member.joinedAt ? member.joinedAt.getTime() : 0;
    const daysSince  = (Date.now() - joinedAt) / (1000 * 60 * 60 * 24);
    if (daysSince <= 7) {
        score += 25;
        reasons.push('+25 joined <7d ago');
    } else if (daysSince <= 30) {
        score += 15;
        reasons.push('+15 joined <30d ago');
    } else if (daysSince <= 90) {
        score += 5;
        reasons.push('+5 joined <90d ago');
    }

    // Role engagement (more roles = more embedded in the server)
    const roleCount = member.roles.cache.size - 1; // exclude @everyone
    if (roleCount >= 5) {
        score += 12;
        reasons.push('+12 5+ roles');
    } else if (roleCount >= 3) {
        score += 10;
        reasons.push('+10 3+ roles');
    } else if (roleCount >= 1) {
        score += 5;
        reasons.push('+5 has roles');
    }

    // Has a real avatar (invested in their account)
    if (member.user.avatar) {
        score += 5;
        reasons.push('+5 has avatar');
    }

    // Account age — newer accounts are less likely to engage, older = more real
    const accountAge  = (Date.now() - member.user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (accountAge >= 365) {
        score += 8;
        reasons.push('+8 account >1yr old');
    } else if (accountAge >= 90) {
        score += 4;
        reasons.push('+4 account >90d old');
    } else if (accountAge < 30) {
        score -= 5;
        reasons.push('-5 account <30d old (likely alt)');
    }

    return { score, reasons };
}

// ── Main Campaign Class ───────────────────────────────────────────────────────
class SmartDMCampaign {
    constructor(client) {
        this.client       = client;
        this.isRunning    = false;
        this.currentTimer = null;
        this.queue        = []; // [{ userId, guildId, score }]
        this.rateLimited  = false;
        this.pausedUntil  = null;

        // Load persistent data
        this.sent    = loadFile(DM_SENT_FILE,   { users: {}, totalSent: 0 });
        this.cfg     = loadFile(DM_CONFIG_FILE, { enabled: false, speed: 'slow', message: null, enabledGuilds: [], startedAt: null });
        this.dmStats = loadFile(DM_STATS_FILE,  { total: 0, failed: 0, skipped: 0, byGuild: {} });
    }

    // ── Public controls ───────────────────────────────────────────────────────

    async start() {
        if (this.isRunning) return { ok: false, reason: 'Already running.' };
        if (!this.cfg.message) return { ok: false, reason: 'No DM message set. Run `/owner dm-campaign set-message` first.' };
        if (!this.cfg.enabledGuilds.length) return { ok: false, reason: 'No guilds enabled. Run `/owner dm-campaign enable [guildId]`.' };

        console.log('\n📨 Smart DM Campaign STARTING...');
        await this.buildQueue();

        if (!this.queue.length) return { ok: false, reason: 'No eligible members found to DM (all already sent or none match criteria).' };

        this.isRunning = true;
        this.cfg.startedAt = Date.now();
        saveFile(DM_CONFIG_FILE, this.cfg);

        this.scheduleNext();
        console.log(`📨 Campaign started — ${this.queue.length} members queued`);
        return { ok: true, queueSize: this.queue.length };
    }

    stop() {
        this.isRunning = false;
        if (this.currentTimer) { clearTimeout(this.currentTimer); this.currentTimer = null; }
        saveFile(DM_CONFIG_FILE, this.cfg);
        console.log('📨 DM Campaign STOPPED');
        return { stopped: true, remaining: this.queue.length };
    }

    setMessage(text) {
        this.cfg.message = text;
        saveFile(DM_CONFIG_FILE, this.cfg);
    }

    setSpeed(preset) {
        if (!SPEED_PRESETS[preset]) return false;
        this.cfg.speed = preset;
        saveFile(DM_CONFIG_FILE, this.cfg);
        return true;
    }

    enableGuild(guildId) {
        if (!this.cfg.enabledGuilds.includes(guildId)) {
            this.cfg.enabledGuilds.push(guildId);
            saveFile(DM_CONFIG_FILE, this.cfg);
        }
    }

    disableGuild(guildId) {
        this.cfg.enabledGuilds = this.cfg.enabledGuilds.filter(id => id !== guildId);
        saveFile(DM_CONFIG_FILE, this.cfg);
        // Remove queued members from that guild
        this.queue = this.queue.filter(m => m.guildId !== guildId);
    }

    getStats() {
        return {
            isRunning:    this.isRunning,
            speed:        SPEED_PRESETS[this.cfg.speed]?.label || this.cfg.speed,
            queueSize:    this.queue.length,
            totalSent:    this.sent.totalSent,
            totalFailed:  this.dmStats.failed,
            totalSkipped: this.dmStats.skipped,
            rateLimited:  this.rateLimited,
            pausedUntil:  this.pausedUntil,
            enabledGuilds: this.cfg.enabledGuilds.length,
            message:      this.cfg.message ? `${this.cfg.message.slice(0, 60)}...` : null,
            byGuild:      this.dmStats.byGuild
        };
    }

    // ── Queue builder ─────────────────────────────────────────────────────────

    async buildQueue() {
        console.log('📊 Building smart DM queue...');
        this.queue = [];

        for (const guildId of this.cfg.enabledGuilds) {
            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) { console.warn(`   ⚠️ Guild ${guildId} not in cache`); continue; }

            // Fetch ALL members with presence data (requires GuildMembers + GuildPresences intents)
            let members;
            try {
                members = await guild.members.fetch({ withPresences: true });
                console.log(`   📋 Fetched ${members.size} members from ${guild.name}`);
            } catch (err) {
                console.error(`   ❌ Failed to fetch members for ${guild.name}: ${err.message}`);
                continue;
            }

            let added = 0, skipped = 0;

            for (const [userId, member] of members) {
                // Skip bots
                if (member.user.bot) { skipped++; continue; }

                // Skip already DM'd (globally across all servers)
                if (this.sent.users[userId]) { skipped++; continue; }

                const { score } = scoreMember(member);

                this.queue.push({
                    userId,
                    guildId,
                    guildName: guild.name,
                    username:  member.user.username,
                    score
                });
                added++;
            }

            console.log(`   ✅ ${guild.name}: ${added} queued, ${skipped} skipped`);
        }

        // Sort highest score first — most active members get DM'd first
        this.queue.sort((a, b) => b.score - a.score);

        console.log(`📨 Total queue: ${this.queue.length} members (sorted by activity score)`);
        if (this.queue.length > 0) {
            const top = this.queue[0];
            console.log(`   🏆 Highest priority: ${top.username} (score: ${top.score}) from ${top.guildName}`);
        }
    }

    // ── Scheduler ─────────────────────────────────────────────────────────────

    scheduleNext() {
        if (!this.isRunning || !this.queue.length) {
            if (!this.queue.length) {
                console.log('📨 DM Campaign: Queue empty — all members DM\'d!');
                this.isRunning = false;
            }
            return;
        }

        // Respect rate limit pause
        if (this.rateLimited && this.pausedUntil) {
            const waitMs = this.pausedUntil - Date.now();
            if (waitMs > 0) {
                console.log(`📨 Rate limited — pausing ${Math.round(waitMs / 60000)} minutes`);
                this.currentTimer = setTimeout(() => {
                    this.rateLimited = false;
                    this.pausedUntil = null;
                    this.scheduleNext();
                }, waitMs);
                return;
            }
            this.rateLimited = false;
            this.pausedUntil = null;
        }

        const preset  = SPEED_PRESETS[this.cfg.speed] || SPEED_PRESETS.slow;
        const delayMs = Math.random() * (preset.max - preset.min) + preset.min;

        this.currentTimer = setTimeout(async () => {
            await this.sendNext();
            this.scheduleNext();
        }, delayMs);
    }

    // ── Send one DM ───────────────────────────────────────────────────────────

    async sendNext() {
        if (!this.queue.length) return;

        // Pop highest-priority member
        const target = this.queue.shift();
        const { userId, guildId, username, score } = target;

        // Double-check not already sent (could have been sent from another guild's queue)
        if (this.sent.users[userId]) {
            this.dmStats.skipped++;
            console.log(`📨 Skipped ${username} (already DM'd)`);
            return;
        }

        // Fetch user object
        let user;
        try {
            user = await this.client.users.fetch(userId);
        } catch {
            this.dmStats.failed++;
            console.log(`📨 Skip ${username} — can't fetch user`);
            return;
        }

        // Try sending the DM
        try {
            await user.send(this.cfg.message);

            // Mark as sent globally
            this.sent.users[userId] = {
                sentAt:    Date.now(),
                fromGuild: guildId,
                score
            };
            this.sent.totalSent++;
            saveFile(DM_SENT_FILE, this.sent);

            // Update stats per guild
            if (!this.dmStats.byGuild[guildId]) {
                this.dmStats.byGuild[guildId] = { sent: 0, failed: 0 };
            }
            this.dmStats.byGuild[guildId].sent++;
            this.dmStats.total++;
            saveFile(DM_STATS_FILE, this.dmStats);

            const guild = this.client.guilds.cache.get(guildId);
            console.log(`📨 DM sent → ${username} (score: ${score}) from ${guild?.name || guildId} | Total: ${this.sent.totalSent} | Queue: ${this.queue.length} left`);

        } catch (err) {
            // Handle specific error codes
            if (err.code === 50007) {
                // User has DMs closed — mark as sent so we don't retry forever
                this.sent.users[userId] = { sentAt: Date.now(), fromGuild: guildId, failed: true, reason: 'DMs closed' };
                this.sent.totalSent++;
                saveFile(DM_SENT_FILE, this.sent);
                this.dmStats.failed++;
                saveFile(DM_STATS_FILE, this.dmStats);
                console.log(`📨 Skip ${username} — DMs closed`);

            } else if (err.status === 429 || err.code === 20016) {
                // Rate limited by Discord
                const retryAfter = (err.retry_after || 60) * 1000 + 5000; // add 5s buffer
                this.rateLimited = true;
                this.pausedUntil = Date.now() + retryAfter;

                // Put member back at front of queue
                this.queue.unshift(target);

                console.warn(`📨 RATE LIMITED — pausing ${Math.round(retryAfter / 60000)} minutes`);
                this.dmStats.failed++;
                saveFile(DM_STATS_FILE, this.dmStats);

            } else {
                this.dmStats.failed++;
                saveFile(DM_STATS_FILE, this.dmStats);
                console.error(`📨 Failed to DM ${username}: ${err.message} (code ${err.code})`);
            }
        }
    }

    // ── Utility: rebuild queue without resetting sent list ────────────────────
    async refreshQueue() {
        await this.buildQueue();
        return this.queue.length;
    }

    // ── Utility: preview top N members without sending ────────────────────────
    async previewQueue(guildId, limit = 10) {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return [];

        const members = await guild.members.fetch({ withPresences: true }).catch(() => null);
        if (!members) return [];

        const scored = [];
        for (const [userId, member] of members) {
            if (member.user.bot) continue;
            if (this.sent.users[userId]) continue;

            const { score, reasons } = scoreMember(member);
            scored.push({
                username: member.user.username,
                score,
                status:   member.presence?.status || 'offline',
                joinedDaysAgo: Math.floor((Date.now() - (member.joinedAt?.getTime() || 0)) / 86400000),
                roleCount: member.roles.cache.size - 1,
                reasons
            });
        }

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, limit);
    }
}

module.exports = SmartDMCampaign;
