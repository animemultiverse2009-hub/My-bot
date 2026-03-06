const config = require('../config.json'); // FIX: was missing, causing silent crash on member leave

module.exports = {
    name: 'guildMemberRemove',
    async execute(member, client) {
        if (member.user.bot) return;

        const guild = member.guild;

        try {
            console.log(`\n👋 MEMBER LEFT: ${member.user.tag}`);
            console.log(`┌────────────────────────────────────────────┐`);

            const invites = client.utils.loadJSON('invites.json');
            let found = false;
            let inviterId = null;

            for (const [inviterIdKey, inviterData] of Object.entries(invites)) {
                const invitedUser = inviterData.invitedUsers.find(u =>
                    u.userId === member.id && u.hasLeft === false
                );

                if (invitedUser) {
                    invitedUser.hasLeft = true;
                    invitedUser.leftAt = Date.now();
                    inviterData.left = (inviterData.left || 0) + 1;
                    inviterId = inviterIdKey;
                    found = true;

                    console.log(`   ✅ Found invite record`);
                    console.log(`   👥 Inviter: ${inviterIdKey}`);
                    break;
                }
            }

            if (found) {
                client.utils.saveJSON('invites.json', invites);

                if (inviterId && inviterId !== guild.id) {
                    await this.updateInviterStats(inviterId, guild, client);
                }

                console.log(`✅ Leave tracked | Member: ${member.user.tag} | Inviter: ${inviterId}`);
            } else {
                console.log(`   ⚠️ No invite record found (joined before bot or unknown)`);
            }

            console.log(`└────────────────────────────────────────────┘\n`);
        } catch (error) {
            console.error(`❌ Error tracking leave for ${member.user.tag}:`, error.message);
        }
    },

    async updateInviterStats(inviterId, guild, client) {
        try {
            const member = await guild.members.fetch(inviterId);
            const inviteData = client.utils.getUserInvites(inviterId);

            const actualVerified = await client.utils.calculateVerifiedInvites(inviterId, guild);
            inviteData.verified = actualVerified;
            client.utils.setUserInvites(inviterId, inviteData);

            const validInvites = inviteData.verified + inviteData.bonus;

            for (const reward of config.rewards) {
                const hasRole = member.roles.cache.has(reward.roleId);
                const qualifies = validInvites >= reward.invitesRequired;

                if (hasRole && !qualifies) {
                    const role = guild.roles.cache.get(reward.roleId);
                    if (role) await member.roles.remove(role).catch(() => {});
                } else if (!hasRole && qualifies) {
                    const role = guild.roles.cache.get(reward.roleId);
                    if (role) await member.roles.add(role).catch(() => {});
                }
            }
        } catch (error) {
            console.error(`Failed to update inviter stats after leave:`, error.message);
        }
    }
};
