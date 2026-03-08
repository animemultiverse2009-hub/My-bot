const BotUtils = require('../utils');
const cache    = require('../dataCache');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member, client) {
        if (member.user.bot) return;
        const guild   = member.guild;
        const guildId = guild.id;
        const cfg     = BotUtils.loadGuildConfig(guildId);

        try {
            console.log(`\n🔍 JOIN: ${member.user.username} → ${guild.name}`);
            BotUtils.incrementStat(guildId, 'membersJoined');

            // Check rejoin (cache read — instant)
            const rejoinData = this.checkRejoin(member.id, guildId);
            if (rejoinData) {
                this.handleRejoin(member, guild, guildId, client, rejoinData);
                return;
            }

            // Track inviter
            let inviter = null, method = null;
            const snap = await this.trackBySnapshot(member, guild, client);
            if (snap) { inviter = snap.inviter; method = snap.method; }
            if (!inviter) { inviter = await this.trackByAPI(member, guild); if (inviter) method = 'api'; }
            if (!inviter) { inviter = await this.trackByAuditLog(member, guild); if (inviter) method = 'audit'; }

            if (inviter) {
                this.recordInvite(member, inviter, guild, guildId, cfg, method);
                // Update roles async — don't await, fire and forget
                setImmediate(() => this.updateInviterStats(inviter.id, guild, guildId).catch(() => {}));
            } else {
                console.log(`   ⚠️ Untracked join (discovery/widget/deleted invite)`);
                cache.patch(guildId, 'untracked', u => { u[member.id] = { userId: member.id, username: member.user.username, guildId, joinedAt: Date.now() }; return u; });
            }

        } catch (e) {
            console.error(`❌ inviteTracker (${member.user.username}):`, e.message);
        }
    },

    checkRejoin(userId, guildId) {
        const invites = cache.getInvites(guildId);
        for (const [inviterId, data] of Object.entries(invites)) {
            const entry = (data.invitedUsers || []).find(u => u.userId === userId && u.hasLeft === true);
            if (entry) return { inviterId, entry };
        }
        return null;
    },

    handleRejoin(member, guild, guildId, client, rejoinData) {
        cache.patch(guildId, 'invites', invites => {
            const data  = invites[rejoinData.inviterId];
            if (!data) return invites;
            const entry = data.invitedUsers.find(u => u.userId === member.id);
            if (entry) {
                entry.hasLeft    = false;
                entry.rejoinedAt = Date.now();
                entry.rejoinCount = (entry.rejoinCount || 0) + 1;
                data.left = Math.max(0, (data.left || 0) - 1);
            }
            return invites;
        });
        console.log(`   🔄 REJOIN: original inviter ${rejoinData.inviterId}`);
        setImmediate(() => this.updateInviterStats(rejoinData.inviterId, guild, guildId).catch(() => {}));
    },

    recordInvite(member, inviter, guild, guildId, cfg, method) {
        const inviterId    = inviter.id;
        const dayInMs      = 86400000;
        const accountAge   = Date.now() - member.user.createdTimestamp;
        const ageDays      = Math.floor(accountAge / dayInMs);
        const isFake       = accountAge < ((cfg.settings?.fakeAccountDays || 7) * dayInMs);
        const hasVerified  = member.roles.cache.has(cfg.roles?.verifiedMember);

        cache.patch(guildId, 'invites', invites => {
            if (!invites[inviterId]) invites[inviterId] = { total: 0, bonus: 0, left: 0, fake: 0, verified: 0, invitedUsers: [] };
            const d = invites[inviterId];
            d.total += 1;
            if (isFake)      d.fake     = (d.fake     || 0) + 1;
            if (hasVerified) d.verified = (d.verified || 0) + 1;
            d.invitedUsers.push({ userId: member.id, username: member.user.username, joinedAt: Date.now(), isFake, hasLeft: false, isVerified: hasVerified, trackingMethod: method, accountAge: ageDays });
            return invites;
        });

        console.log(`   ✅ Tracked → inviter: ${inviter.username || inviterId} | fake: ${isFake} | method: ${method}`);
    },

    async updateInviterStats(inviterId, guild, guildId) {
        const member = await guild.members.fetch(inviterId).catch(() => null);
        if (!member) return;
        const cfg          = BotUtils.loadGuildConfig(guildId);
        const verified     = await BotUtils.calculateVerifiedInvites(inviterId, guild);
        const data         = BotUtils.getUserInvites(inviterId, guildId);
        data.verified      = verified;
        BotUtils.setUserInvites(inviterId, data, guildId);
        const valid        = verified + data.bonus;
        for (const r of (cfg.rewards || [])) {
            const role = guild.roles.cache.get(r.roleId);
            if (!role) continue;
            const has = member.roles.cache.has(r.roleId);
            const qualifies = valid >= r.invitesRequired;
            if (!has && qualifies)  await member.roles.add(role).catch(() => {});
            if (has && !qualifies)  await member.roles.remove(role).catch(() => {});
        }
    },

    async trackBySnapshot(member, guild, client) {
        try {
            const prev = client.invites.get(guild.id);
            if (!prev) { await BotUtils.rebuildInviteCache(guild); return null; }
            const cur = await guild.invites.fetch({ cache: false });
            for (const [code, inv] of cur) {
                const p = prev.get(code);
                if (p && inv.uses > p.uses) { await BotUtils.updateInviteCache(guild, cur); return { inviter: inv.inviter, method: 'snapshot', code }; }
            }
            for (const [code, inv] of cur) {
                if (!prev.has(code) && inv.uses > 0) { await BotUtils.updateInviteCache(guild, cur); return { inviter: inv.inviter, method: 'new_invite', code }; }
            }
            if (guild.vanityURLCode) {
                const pv = prev.get(guild.vanityURLCode);
                if (pv && pv.uses < (guild.vanityURLUses || 0)) { await BotUtils.updateInviteCache(guild, cur); return { inviter: { id: guild.id, username: guild.name }, method: 'vanity' }; }
            }
            await BotUtils.updateInviteCache(guild, cur);
            return null;
        } catch { return null; }
    },

    async trackByAPI(member, guild) {
        try {
            if (member.inviter) return member.inviter;
            const fresh = await guild.members.fetch({ user: member.id, force: true });
            return fresh.inviter || null;
        } catch { return null; }
    },

    async trackByAuditLog(member, guild) {
        try {
            if (!guild.members.me.permissions.has('ViewAuditLog')) return null;
            const logs  = await guild.fetchAuditLogs({ type: 20, limit: 10 });
            const entry = logs.entries.find(e => e.target.id === member.id && Date.now() - e.createdTimestamp < 5000);
            return entry?.executor || null;
        } catch { return null; }
    }
};
