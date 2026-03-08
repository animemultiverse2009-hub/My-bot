// ─────────────────────────────────────────────────────────────────────────────
// handlers/checkInvites.js
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const BotUtils = require('../utils');

module.exports = {
    async execute(interaction, client) {
        const guildId = interaction.guild.id;
        const cfg     = BotUtils.loadGuildConfig(guildId);
        const userId  = interaction.user.id;

        try {
            // calculateVerifiedInvites does guild.members.fetch — necessary but async
            const verifiedCount = await BotUtils.calculateVerifiedInvites(userId, interaction.guild);
            const inviteData    = BotUtils.getUserInvites(userId, guildId);
            const unverified    = Math.max(0, inviteData.total - inviteData.left - inviteData.fake - verifiedCount);

            inviteData.verified = verifiedCount;
            BotUtils.setUserInvites(userId, inviteData, guildId);

            const embed = new EmbedBuilder()
                .setColor(cfg.colors?.info || '#0080FF')
                .setTitle(`${cfg.emojis?.link || '🔗'} Your Invite Stats`)
                .setDescription(
                    `**Total**\n${inviteData.total}\n\n` +
                    `**Verified**\n${verifiedCount}\n\n` +
                    `**Unverified**\n${unverified}\n\n` +
                    `**Bonus**\n${inviteData.bonus}\n\n` +
                    `**Left**\n${inviteData.left}\n\n` +
                    `**Fake**\n${inviteData.fake}`
                )
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('Verification').setStyle(ButtonStyle.Link).setURL(cfg.messages?.verificationURL).setEmoji(BotUtils.parseEmoji(cfg.emojis?.verification)),
                new ButtonBuilder().setLabel('Pro Tip').setStyle(ButtonStyle.Secondary).setCustomId('pro_tip').setEmoji(BotUtils.parseEmoji(cfg.emojis?.bluepin))
            );

            await interaction.editReply({ embeds: [embed], components: [row] });

        } catch (e) {
            console.error('❌ checkInvites:', e.message);
            interaction.editReply({ content: '❌ Failed to fetch invite stats. Try again.' }).catch(() => {});
        }
    }
};
