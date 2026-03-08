const fs    = require('fs');
const path  = require('path');
const cache = require('./dataCache');

// ── Plan definitions ──────────────────────────────────────────────────────────
const PLANS = {
    free:    { label: 'Free',    maxActiveClaims: 10,  randomPayouts: false, boostPrizes: false, customText: false, dmCampaign: false },
    basic:   { label: 'Basic',   maxActiveClaims: 50,  randomPayouts: true,  boostPrizes: true,  customText: true,  dmCampaign: false },
    premium: { label: 'Premium', maxActiveClaims: -1,  randomPayouts: true,  boostPrizes: true,  customText: true,  dmCampaign: true  }
};

// ── Guild config cache (separate from data cache — configs are tiny) ──────────
const _cfgCache = new Map();

class BotUtils {

    // ── Guild data via cache ──────────────────────────────────────────────────

    static guildDir(guildId) {
        const dir = path.join(__dirname, 'guilds', guildId);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        return dir;
    }

    /** @deprecated Use cache.get / cache.set directly for hot paths */
    static loadGuildJSON(guildId, filename) {
        if (!guildId) { console.error(`❌ loadGuildJSON called with undefined guildId for ${filename}`); return {}; }
        const key = filename.replace('.json', '');
        return cache.get(guildId, key);
    }

    /** @deprecated Use cache.set / cache.patch directly for hot paths */
    static saveGuildJSON(guildId, filename, data) {
        if (!guildId) { console.error(`❌ saveGuildJSON called with undefined guildId for ${filename}`); return false; }
        const key = filename.replace('.json', '');
        cache.set(guildId, key, data);
        return true;
    }

    // ── Guild config ──────────────────────────────────────────────────────────

    static loadGuildConfig(guildId) {
        if (_cfgCache.has(guildId)) return _cfgCache.get(guildId);

        const globalCfg = require('./config.json');
        const guildCfg  = cache.get(guildId, 'config');

        const merged = {
            ...globalCfg,
            ...guildCfg,
            // These always come from global — owner keeps revenue + auth
            token:      globalCfg.token,
            clientId:   globalCfg.clientId,
            ownerId:    globalCfg.ownerId,
            shortxlinks: globalCfg.shortxlinks,
            messages: {
                ...globalCfg.messages,
                ...(guildCfg.messages || {}),
                verificationURL: globalCfg.messages.verificationURL
            }
        };

        _cfgCache.set(guildId, merged);
        return merged;
    }

    static saveGuildConfig(guildId, cfg) {
        const { token, clientId, ownerId, shortxlinks, ...guildOnly } = cfg;
        cache.set(guildId, 'config', guildOnly);
        _cfgCache.delete(guildId);
    }

    static invalidateConfigCache(guildId) {
        _cfgCache.delete(guildId);
    }

    static initGuild(guildId, guildName, ownerId) {
        const guildDir = this.guildDir(guildId);
        const cfgFile  = path.join(guildDir, 'config.json');
        if (fs.existsSync(cfgFile)) return false;

        const template = require('./guilds/template.json');
        const cfg = { ...template, guildId, guildName, addedBy: ownerId, addedAt: Date.now() };

        // Write directly to disk for init (cache will load on next access)
        const write = (name, data) => fs.writeFileSync(path.join(guildDir, name + '.json'), JSON.stringify(data, null, 2));
        write('config',  cfg);
        write('invites', {});
        write('claims',  {});
        write('stats',   { totalClaims: 0, completedClaims: 0, shortxlinksCompletions: 0, vaultcordAuths: 0, membersJoined: 0, membersLeft: 0, lastActivity: Date.now(), createdAt: Date.now() });

        console.log(`✅ Initialized guild: ${guildName} (${guildId})`);
        return true;
    }

    // ── Plans ─────────────────────────────────────────────────────────────────

    static getPlan(guildId) {
        const cfg  = this.loadGuildConfig(guildId);
        const id   = cfg.plan || 'free';
        return { ...PLANS[id] || PLANS.free, id };
    }

    static setPlan(guildId, planId) {
        if (!PLANS[planId]) return false;
        const cfg = this.loadGuildConfig(guildId);
        cfg.plan  = planId;
        this.saveGuildConfig(guildId, cfg);
        return true;
    }

    static checkClaimLimit(guildId) {
        const plan = this.getPlan(guildId);
        if (plan.maxActiveClaims === -1) return { allowed: true };
        const claims  = cache.getClaims(guildId);
        const active  = Object.values(claims).filter(c => c.status !== 'completed').length;
        if (active >= plan.maxActiveClaims) return { allowed: false, reason: `Claim limit reached (${plan.maxActiveClaims}). Plan: **${plan.label}**.` };
        return { allowed: true };
    }

    // ── Invite helpers — ALL routed through cache ─────────────────────────────

    static getUserInvites(userId, guildId) {
        if (!guildId) { console.error(`❌ getUserInvites missing guildId for user ${userId}`); return { total: 0, bonus: 0, left: 0, fake: 0, verified: 0, invitedUsers: [] }; }
        return cache.getUserInvites(userId, guildId);
    }

    static setUserInvites(userId, data, guildId) {
        if (!guildId) { console.error(`❌ setUserInvites missing guildId for user ${userId}`); return false; }
        cache.setUserInvites(userId, data, guildId);
        return true;
    }

    static updateUserInvites(userId, updates, guildId) {
        const current = this.getUserInvites(userId, guildId);
        const updated = { ...current, ...updates };
        this.setUserInvites(userId, updated, guildId);
        return updated;
    }

    // ── Stats ─────────────────────────────────────────────────────────────────

    static incrementStat(guildId, stat, amount = 1) {
        cache.patch(guildId, 'stats', s => {
            s[stat]        = (s[stat] || 0) + amount;
            s.lastActivity = Date.now();
            return s;
        });
    }

    static getStats(guildId) {
        return cache.get(guildId, 'stats');
    }

    static getNetworkStats(client) {
        let totalClaims = 0, completed = 0, shortxlinks = 0, auths = 0, totalMembers = 0, activeGuilds = 0;
        const byGuild = {};

        for (const guild of client.guilds.cache.values()) {
            const stats = this.getStats(guild.id);
            const cfg   = cache.get(guild.id, 'config');
            if (!cfg.setupComplete) continue;
            activeGuilds++;
            totalClaims  += stats.totalClaims              || 0;
            completed    += stats.completedClaims           || 0;
            shortxlinks  += stats.shortxlinksCompletions   || 0;
            auths        += stats.vaultcordAuths            || 0;
            totalMembers += guild.memberCount;
            byGuild[guild.id] = { name: guild.name, members: guild.memberCount, plan: cfg.plan || 'free', claims: stats.totalClaims || 0, completed: stats.completedClaims || 0, shortxlinks: stats.shortxlinksCompletions || 0, lastActivity: stats.lastActivity || 0 };
        }

        return { totalGuilds: client.guilds.cache.size, activeGuilds, totalMembers, totalClaims, completedClaims: completed, shortxlinksCompletions: shortxlinks, estimatedRevenue: (shortxlinks * 0.0014).toFixed(2), vaultcordAuths: auths, byGuild };
    }

    // ── Invite cache (Discord invite snapshot) ────────────────────────────────

    static async rebuildInviteCache(guild) {
        try {
            const invites  = await guild.invites.fetch({ cache: false });
            const map      = new Map();
            for (const [code, inv] of invites) map.set(code, { inviterId: inv.inviter?.id, uses: inv.uses || 0 });
            if (guild.vanityURLCode) map.set(guild.vanityURLCode, { inviterId: guild.id, uses: guild.vanityURLUses || 0 });
            if (global.client) global.client.invites.set(guild.id, map);
            return map;
        } catch (e) {
            console.error(`Error rebuilding invite cache for ${guild.name}:`, e.message);
            return new Map();
        }
    }

    static async updateInviteCache(guild, currentInvites) {
        const map = new Map();
        for (const [code, inv] of currentInvites) map.set(code, { inviterId: inv.inviter?.id, uses: inv.uses || 0 });
        if (guild.vanityURLCode) map.set(guild.vanityURLCode, { inviterId: guild.id, uses: guild.vanityURLUses || 0 });
        if (global.client) global.client.invites.set(guild.id, map);
    }

    // ── Verified invite count ─────────────────────────────────────────────────

    static async calculateVerifiedInvites(userId, guild) {
        const guildId        = guild.id;
        const inviteData     = this.getUserInvites(userId, guildId);
        const cfg            = this.loadGuildConfig(guildId);
        const verifiedRoleId = cfg.roles?.verifiedMember;
        let count = 0;

        for (const inv of (inviteData.invitedUsers || [])) {
            if (inv.isFake || inv.hasLeft) continue;
            try {
                const member = await guild.members.fetch(inv.userId);
                if (member && verifiedRoleId && member.roles.cache.has(verifiedRoleId)) count++;
            } catch (_) {}
        }
        return count;
    }

    static async updateVerifiedCount(userId, guild) {
        const count    = await this.calculateVerifiedInvites(userId, guild);
        const data     = this.getUserInvites(userId, guild.id);
        data.verified  = count;
        this.setUserInvites(userId, data, guild.id);
        return count;
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    static cleanupExpiredClaims(guildId) {
        const expiry = 60 * 60 * 1000;
        let cleaned  = 0;
        cache.patch(guildId, 'claims', claims => {
            for (const [id, claim] of Object.entries(claims)) {
                if (claim.status !== 'completed' && (Date.now() - claim.startedAt) > expiry) {
                    delete claims[id];
                    cleaned++;
                }
            }
            return claims;
        });
        return cleaned;
    }

    // ── Legacy compat (old data/ path, routes to main guild) ─────────────────
    static loadJSON(filename) {
        const guildId = require('./config.json').guildId;
        return this.loadGuildJSON(guildId, filename.replace(/^data\//, ''));
    }
    static saveJSON(filename, data) {
        const guildId = require('./config.json').guildId;
        return this.saveGuildJSON(guildId, filename.replace(/^data\//, ''), data);
    }

    // ── Emoji ─────────────────────────────────────────────────────────────────
    static parseEmoji(str) {
        if (!str || typeof str !== 'string') return undefined;
        if (!str.includes('<')) return { name: str };
        const m = str.match(/<(a?):([^:]+):(\d+)>/);
        if (!m) return undefined;
        const r = { name: m[2], id: m[3] };
        if (m[1] === 'a') r.animated = true;
        return r;
    }

    static formatTimestamp(ts)  { return new Date(ts).toLocaleString(); }
    static safeUserMention(id)  { return `<@${id}>`; }
    static isValidReward(id, c) { return c.rewards?.some(r => r.id === id); }
    static calculateValidInvites(d) { return (d.verified || 0) + (d.bonus || 0); }
}

module.exports = BotUtils;
module.exports.PLANS = PLANS;
