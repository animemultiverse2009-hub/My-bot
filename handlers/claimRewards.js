const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const config = require('../config.json');
const BotUtils = require('../utils');

module.exports = {
    async execute(interaction, client) {
        // Already deferred in interactionCreate.js
        const userId = interaction.user.id;
        const guild = interaction.guild;

        try {
            await client.utils.updateVerifiedCount(userId, guild);

            const embed = new EmbedBuilder()
                .setColor(config.colors.primary)
                .setImage(config.images.selectRewardsBanner);

            const options = config.rewards.map(reward => ({
                label: reward.name,
                description: `Requires ${reward.invitesRequired} invites`,
                value: reward.id,
                emoji: BotUtils.parseEmoji(reward.emoji) // FIX: parse emoji
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_reward')
                .setPlaceholder('Select your reward')
                .addOptions(options);

            await interaction.editReply({
                embeds: [embed],
                components: [new ActionRowBuilder().addComponents(selectMenu)]
            });
        } catch (error) {
            console.error('Error in claimRewards:', error.message);
            interaction.editReply({ content: '❌ An error occurred. Please try again.' }).catch(() => {});
        }
    }
};
