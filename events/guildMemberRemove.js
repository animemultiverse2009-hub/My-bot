const BotUtils = require('../utils');
const cache    = require('../dataCache');

module.exports = {
    name: 'guildMemberRemove',
    async execute(member, client) {
        if (member.user.bot) return;
        const guild   = member.guild;
        const guildId = guild.id;

        BotUtils.incrementStat(guildId, 'membersLeft');

        let inviterId = null;
        cache.patch(guildId, 'invites', invites => {
            for (const [id, data] of Object.entries(invites)) {
                const entry = (data.invitedUsers || []).find(u => u.userId === member.id && !u.hasLeft);
                if (entry) {
                    entry.hasLeft = true;
                    entry.leftAt  = Date.now();
                    data.left     = (data.left || 0) + 1;
                    inviterId     = id;
                    break;
                }
            }
            return invites;
        });

        if (inviterId && inviterId !== guild.id) {
            // Fire and forget role update
            setImmediate(async () => {
                try {
                    const inviterMember = await guild.members.fetch(inviterId).catch(() => null);
                    if (!inviterMember) return;
                    const cfg     = BotUtils.loadGuildConfig(guildId);
                    const verified = await BotUtils.calculateVerifiedInvites(inviterId, guild);
                    const data     = BotUtils.getUserInvites(inviterId, guildId);
                    data.verified  = verified;
                    BotUtils.setUserInvites(inviterId, data, guildId);
                    const valid    = verified + data.bonus;
                    for (const r of (cfg.rewards || [])) {
                        const role = guild.roles.cache.get(r.roleId);
                        if (!role) continue;
                        const has       = inviterMember.roles.cache.has(r.roleId);
                        const qualifies = valid >= r.invitesRequired;
                        if (has && !qualifies) await inviterMember.roles.remove(role).catch(() => {});
                        if (!has && qualifies) await inviterMember.roles.add(role).catch(() => {});
                    }
                } catch (e) { console.error(`❌ memberRemove stats update: ${e.message}`); }
            });
        }

        console.log(`👋 LEFT: ${member.user.username} | inviter: ${inviterId || 'unknown'}`);
    }
};
