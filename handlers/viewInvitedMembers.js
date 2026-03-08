const { EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('../config.json');

module.exports = {
    async execute(interaction, client) {
        const userId = interaction.user.id;
        const guild = interaction.guild;
        const inviteData = client.utils.getUserInvites(userId);
        
        if (inviteData.invitedUsers.length === 0) {
            return interaction.reply({
                content: '❌ You haven\'t invited anyone yet!',
                flags: MessageFlags.Ephemeral
            });
        }
        
        const verifiedRoleId = config.roles.verifiedMember;
        const memberList = [];
        
        for (const invitedUser of inviteData.invitedUsers) {
            let status = '';
            let username = invitedUser.username || 'Unknown';
            
            try {
                const member = await guild.members.fetch(invitedUser.userId);
                username = member.user.username;
                
                if (invitedUser.hasLeft) {
                    status = '❌ Left';
                } else if (invitedUser.isFake) {
                    status = '⚠️ Fake';
                } else if (member.roles.cache.has(verifiedRoleId)) {
                    status = '✅ Verified';
                } else {
                    status = '⏳ Unverified';
                }
            } catch (error) {
                // Member not found
                status = '❌ Left';
                invitedUser.hasLeft = true;
            }
            
            memberList.push(`**${username}** - ${status}`);
        }
        
        // Split into chunks if too many members
        const chunks = [];
        for (let i = 0; i < memberList.length; i += 20) {
            chunks.push(memberList.slice(i, i + 20));
        }
        
        const embed = new EmbedBuilder()
            .setColor(config.colors.info)
            .setTitle(`${config.emojis.members} Your Invited Members`)
            .setDescription(chunks[0].join('\n'))
            .setFooter({ 
                text: `Total: ${inviteData.invitedUsers.length} members | Page 1/${chunks.length}` 
            })
            .setTimestamp();
        
        await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
        
        // Update invite data with any changes (like members who left)
        client.utils.setUserInvites(userId, inviteData);
    }
};