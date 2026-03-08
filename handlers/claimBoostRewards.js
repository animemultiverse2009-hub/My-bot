const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');
const BotUtils = require('../utils');

module.exports = {
    async execute(interaction, client) {
        // Already deferred in interactionCreate.js
        const member = interaction.member;
        const isBooster = member.premiumSince !== null;

        if (!isBooster) {
            const description =
                `• You need to **boost the server** to claim boost rewards.\n` +
                `• You haven't boosted the server yet.\n\n` +
                `${config.emojis.rarrow} Can't boost? Earn rewards via **Invite Rewards** instead.\n` +
                `${config.emojis.rarrow} Click **"Verification"** to verify yourself for exclusive prizes!`;

            const embed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle('Not a Server Booster!')
                .setDescription(description)
                .setThumbnail(config.images.boostErrorIcon);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Invite Rewards!')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://discord.com/channels/${config.guildId}/${config.channels.inviteReward}`)
                        .setEmoji(BotUtils.parseEmoji(config.emojis.link)),
                    new ButtonBuilder()
                        .setLabel('Verification')
                        .setStyle(ButtonStyle.Link)
                        .setURL(config.messages.verificationURL)
                        .setEmoji(BotUtils.parseEmoji(config.emojis.verification))
                );

            return interaction.editReply({ embeds: [embed], components: [row] });
        }

        // User is a booster — show reward selection
        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setImage(config.images.selectRewardsBanner);

        const options = config.boostRewards.map(reward => ({
            label: reward.name,
            description: `Requires ${reward.boostsRequired} boost${reward.boostsRequired > 1 ? 's' : ''}`,
            value: reward.id,
            emoji: BotUtils.parseEmoji(reward.emoji)
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_boost_reward')
            .setPlaceholder('Select your reward')
            .addOptions(options);

        await interaction.editReply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
    }
};
