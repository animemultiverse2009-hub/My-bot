const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');
const BotUtils = require('../utils');

module.exports = {
    async execute(interaction, client) {
        const channelId = interaction.channel.id;
        const claims = client.utils.loadJSON('claims.json');
        const claim = claims[channelId];

        if (!claim || claim.userId !== interaction.user.id) {
            return interaction.reply({ content: '❌ Invalid claim session.', ephemeral: true }).catch(() => {});
        }

        const userId = interaction.user.id;
        const guild = interaction.guild;
        const verifiedCount = await client.utils.updateVerifiedCount(userId, guild);
        const inviteData = client.utils.getUserInvites(userId);
        const validInvites = verifiedCount + inviteData.bonus;

        const description =
            `${config.emojis.giftbox} You are currently in the **queue** to claim your reward. ` +
            `You can skip ahead by inviting **${config.messages.skipQueueInvites} more new friends** to the server.\n\n` +
            `> The more **invites** you have, __the quicker you'll receive your reward.__\n` +
            `> * Learn how to invite faster by clicking **"Pro Tip"** ${config.emojis.tada}\n` +
            `> * Click **"🔓 Unlock Prize"** once you've invited enough new people!\n\n` +
            `**Current:** ${validInvites} valid invites · Need **${config.messages.skipQueueInvites} new** invites to skip`;

        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle(`${config.emojis.wtickk} You're in the Rewards Queue`)
            .setDescription(description)
            .setImage('https://images-ext-1.discordapp.net/external/VULbDbmS-k1uWssO9jW7K3SupaSmoJvE6rE6zxXikrc/https/wpamelia.com/wp-content/uploads/2018/11/ezgif-2-6d0b072c3d3f.gif');

        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Verification')
                    .setStyle(ButtonStyle.Link)
                    .setURL(config.messages.verificationURL)
                    .setEmoji(BotUtils.parseEmoji(config.emojis.verification)),
                new ButtonBuilder()
                    .setLabel('Pro Tip')
                    .setStyle(ButtonStyle.Secondary)
                    .setCustomId('pro_tip')
                    .setEmoji(BotUtils.parseEmoji(config.emojis.bluepin))
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`unlock_prize_${claim.rewardId}`)
                    .setLabel('🔓 Unlock Prize')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji(BotUtils.parseEmoji(config.emojis.key))
            );

        // Save baseline so skipQueue can measure new invites since queue start
        claim.status = 'in_queue';
        claim.queueStarted = Date.now();
        claim.baselineInvites = {
            verified: verifiedCount,
            bonus: inviteData.bonus,
            total: inviteData.total,
            fake: inviteData.fake,
            left: inviteData.left
        };
        claims[channelId] = claim;
        client.utils.saveJSON('claims.json', claims);

        console.log(`🎫 QUEUE STARTED — ${interaction.user.username} | Valid: ${validInvites} | Need: ${config.messages.skipQueueInvites} new`);

        try {
            await interaction.update({ embeds: [embed], components: [row1, row2] });
        } catch (error) {
            console.error('Failed to update in claimRewardFinal:', error.message);
            interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true }).catch(() => {});
        }
    }
};
