const fs = require('fs');
const path = require('path');

class BotUtils {

    /**
     * Parse a custom emoji string into APIMessageComponentEmoji format.
     *
     * Per official Discord.js v14 docs, .setEmoji() requires APIMessageComponentEmoji:
     *   { name: 'CheckInvite', id: '1448599617359839373' }          ← static custom emoji
     *   { name: 'boost', id: '1454746868721520725', animated: true } ← animated custom emoji
     *   { name: '🎁' }                                               ← unicode emoji
     *
     * ROOT CAUSE OF COMPONENT_INVALID_EMOJI:
     *   Setting `animated: false` explicitly on a static emoji causes Discord API to
     *   reject it. The `animated` field must be OMITTED for static emojis — not false.
     *
     * Usage: .setEmoji(BotUtils.parseEmoji(config.emojis.tada))
     */
    static parseEmoji(emojiString) {
        if (!emojiString || typeof emojiString !== 'string') return undefined;

        // Unicode emoji (no angle brackets) → { name: '🎁' }
        if (!emojiString.includes('<')) return { name: emojiString };

        // Custom emoji: <:name:id> or animated <a:name:id>
        const match = emojiString.match(/<(a?):([^:]+):(\d+)>/);
        if (!match) return undefined;

        const isAnimated = match[1] === 'a';
        const result = { name: match[2], id: match[3] };

        // CRITICAL: Only set animated when it's actually true.
        // Never set animated: false — Discord API rejects it for static emojis.
        if (isAnimated) result.animated = true;

        return result;
        // Examples:
        // "<:CheckInvite:1448599617359839373>" → { name: 'CheckInvite', id: '1448599617359839373' }
        // "<a:boost:1454746868721520725>"       → { name: 'boost', id: '1454746868721520725', animated: true }
        // "🎁"                                  → { name: '🎁' }
    }

    static loadJSON(filename) {
        try {
            const filepath = path.join(__dirname, 'data', filename);
            const dir = path.dirname(filepath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            if (!fs.existsSync(filepath)) { fs.writeFileSync(filepath, '{}'); return {}; }
            return JSON.parse(fs.readFileSync(filepath, 'utf8'));
        } catch (error) {
            console.error(`❌ Error loading ${filename}:`, error.message);
            return {};
        }
    }

    static saveJSON(filename, data) {
        try {
            const filepath = path.join(__dirname, 'data', filename);
            const dir = path.dirname(filepath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            if (fs.existsSync(filepath)) fs.copyFileSync(filepath, `${filepath}.backup`);
            fs.writeFileSync(filepath, JSON.stringify(data, null, 4));
            return true;
        } catch (error) {
            console.error(`❌ Error saving ${filename}:`, error.message);
            return false;
        }
    }

    static async rebuildInviteCache(guild) {
        try {
            const invites = await guild.invites.fetch({ cache: false });
            const cacheMap = new Map();
            for (const [code, invite] of invites) {
                cacheMap.set(code, { inviterId: invite.inviter?.id, uses: invite.uses || 0 });
            }
            if (guild.vanityURLCode) {
                cacheMap.set(guild.vanityURLCode, { inviterId: guild.id, uses: guild.vanityURLUses || 0 });
            }
            if (global.client) global.client.invites.set(guild.id, cacheMap);
            return cacheMap;
        } catch (error) {
            console.error(`Error rebuilding cache for ${guild.name}:`, error.message);
            return new Map();
        }
    }

    static async updateInviteCache(guild, currentInvites) {
        try {
            const cacheMap = new Map();
            for (const [code, invite] of currentInvites) {
                cacheMap.set(code, { inviterId: invite.inviter?.id, uses: invite.uses || 0 });
            }
            if (guild.vanityURLCode) {
                cacheMap.set(guild.vanityURLCode, { inviterId: guild.id, uses: guild.vanityURLUses || 0 });
            }
            if (global.client) global.client.invites.set(guild.id, cacheMap);
        } catch (error) {
            console.error('Error updating invite cache:', error.message);
        }
    }

    static getUserInvites(userId) {
        const invites = this.loadJSON('invites.json');
        return invites[userId] || { total: 0, bonus: 0, left: 0, fake: 0, verified: 0, invitedUsers: [] };
    }

    static setUserInvites(userId, data) {
        const invites = this.loadJSON('invites.json');
        invites[userId] = {
            total:    Math.max(0, data.total    || 0),
            bonus:    Math.max(0, data.bonus    || 0),
            left:     Math.max(0, data.left     || 0),
            fake:     Math.max(0, data.fake     || 0),
            verified: Math.max(0, data.verified || 0),
            invitedUsers: data.invitedUsers || []
        };
        return this.saveJSON('invites.json', invites);
    }

    static updateUserInvites(userId, updates) {
        const current = this.getUserInvites(userId);
        const updated = { ...current, ...updates };
        this.setUserInvites(userId, updated);
        return updated;
    }

    static async calculateVerifiedInvites(userId, guild) {
        const inviteData = this.getUserInvites(userId);
        const config = require('./config.json');
        const verifiedRoleId = config.roles.verifiedMember;
        const activeUsers = inviteData.invitedUsers.filter(u => !u.isFake && !u.hasLeft);
        if (activeUsers.length === 0) return 0;

        const memberIds = activeUsers.map(u => u.userId);
        for (let i = 0; i < memberIds.length; i += 100) {
            await guild.members.fetch({ user: memberIds.slice(i, i + 100) }).catch(() => {});
        }

        let count = 0;
        for (const u of activeUsers) {
            const member = guild.members.cache.get(u.userId);
            if (member?.roles.cache.has(verifiedRoleId)) count++;
        }
        return count;
    }

    static async updateVerifiedCount(userId, guild) {
        const count = await this.calculateVerifiedInvites(userId, guild);
        const data = this.getUserInvites(userId);
        data.verified = count;
        this.setUserInvites(userId, data);
        return count;
    }

    static calculateValidInvites(inviteData) {
        return (inviteData.verified || 0) + (inviteData.bonus || 0);
    }

    static cleanupExpiredClaims() {
        try {
            const claims = this.loadJSON('claims.json');
            const now = Date.now();
            let cleaned = 0;
            for (const [id, claim] of Object.entries(claims)) {
                if (now - claim.startedAt > 3600000 && claim.status !== 'completed') {
                    delete claims[id]; cleaned++;
                }
            }
            if (cleaned > 0) this.saveJSON('claims.json', claims);
            return cleaned;
        } catch (e) {
            console.error('Error in cleanupExpiredClaims:', e.message);
            return 0;
        }
    }

    static formatTimestamp(ts) { return new Date(ts).toLocaleString(); }
    static safeUserMention(userId) { return `<@${userId}>`; }
}

module.exports = BotUtils;
