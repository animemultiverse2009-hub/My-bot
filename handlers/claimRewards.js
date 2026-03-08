// ─────────────────────────────────────────────────────────────────────────────
// handlers/claimRewards.js
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const BotUtils = require('../utils');

module.exports = {
    async execute(interaction, client) {
        const guildId = interaction.guild.id;
        const cfg     = BotUtils.loadGuildConfig(guildId);

        try {
            await BotUtils.updateVerifiedCount(interaction.user.id, interaction.guild);

            const options = cfg.rewards.map(r => ({
                label:       r.name,
                description: `Requires ${r.invitesRequired} invites`,
                value:       r.id,
                emoji:       BotUtils.parseEmoji(r.emoji)
            }));

            const embed = new EmbedBuilder()
                .setColor(cfg.colors.primary)
                .setImage(cfg.images.selectRewardsBanner);

            await interaction.editReply({
                embeds: [embed],
                components: [new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_reward')
                        .setPlaceholder('Select your reward')
                        .addOptions(options)
                )]
            });
        } catch (e) {
            console.error(`❌ claimRewards: ${e.message}`);
            interaction.editReply({ content: '❌ An error occurred. Please try again.' }).catch(() => {});
        }
    }
};
