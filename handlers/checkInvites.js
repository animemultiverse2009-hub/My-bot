const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');
const BotUtils = require('../utils');

module.exports = {
    async execute(interaction, client) {
        // Already deferred in interactionCreate.js
        const userId = interaction.user.id;
        const guild = interaction.guild;

        try {
            const inviteData = client.utils.getUserInvites(userId);
            const verifiedCount = await client.utils.calculateVerifiedInvites(userId, guild);

            inviteData.verified = verifiedCount;
            client.utils.setUserInvites(userId, inviteData);

            const validInvites = verifiedCount + inviteData.bonus;
            const unverified = Math.max(0, inviteData.total - inviteData.left - inviteData.fake - verifiedCount);

            const description =
                `**Valid Invites** *(counts toward rewards)*\n${validInvites}\n\n` +
                `**Verified**\n${verifiedCount}\n\n` +
                `**Bonus**\n${inviteData.bonus}\n\n` +
                `**Total Invited**\n${inviteData.total}\n\n` +
                `**Unverified**\n${unverified}\n\n` +
                `**Fake**\n${inviteData.fake}\n\n` +
                `**Left**\n${inviteData.left}`;

            const embed = new EmbedBuilder()
                .setColor(config.colors.info)
                .setTitle(`${config.emojis.link} Your Invite Stats`)
                .setDescription(description)
                .setFooter({ text: 'Valid Invites = Verified + Bonus' })
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Verification')
                        .setStyle(ButtonStyle.Link)
                        .setURL(config.messages.verificationURL)
                        .setEmoji(BotUtils.parseEmoji(config.emojis.verification)),
                    new ButtonBuilder()
                        .setLabel('View Invited Members')
                        .setStyle(ButtonStyle.Secondary)
                        .setCustomId('view_invited_members')
                        .setEmoji(BotUtils.parseEmoji(config.emojis.members)),
                    new ButtonBuilder()
                        .setLabel('Pro Tip')
                        .setStyle(ButtonStyle.Secondary)
                        .setCustomId('pro_tip')
                        .setEmoji(BotUtils.parseEmoji(config.emojis.bluepin))
                );

            await interaction.editReply({ embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error in checkInvites:', error.message);
            interaction.editReply({ content: '❌ Failed to fetch invite stats. Please try again.' }).catch(() => {});
        }
    }
};
