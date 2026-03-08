const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const BotUtils = require('../utils');
const cache    = require('../dataCache');

module.exports = {
    async execute(interaction, client) {
        const guildId   = interaction.guild.id;
        const channelId = interaction.channel.id;
        const claim     = cache.getClaim(channelId, guildId);

        if (!claim || claim.userId !== interaction.user.id) {
            return interaction.reply({ content: '❌ Invalid claim session.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        const cfg = BotUtils.loadGuildConfig(guildId);

        try {
            // Get current invite state for baseline
            const verifiedCount = await BotUtils.updateVerifiedCount(interaction.user.id, interaction.guild);
            const inviteData    = BotUtils.getUserInvites(interaction.user.id, guildId);

            // Set baseline + update status atomically in cache
            cache.patch(guildId, 'claims', c => {
                if (c[channelId]) {
                    c[channelId].status          = 'in_queue';
                    c[channelId].queueStarted    = Date.now();
                    c[channelId].baselineInvites = {
                        verified: verifiedCount,
                        bonus:    inviteData.bonus,
                        total:    inviteData.total,
                        fake:     inviteData.fake,
                        left:     inviteData.left
                    };
                }
                return c;
            });

            const embed = new EmbedBuilder()
                .setColor(cfg.colors?.primary || '#6868FF')
                .setTitle('✅ You\'re in the Rewards Queue')
                .setDescription(
                    `🎁 You are in the **queue** to claim your reward.\n\n` +
                    `> The more **invites** you have, the quicker you'll claim.\n` +
                    `> * Keep inviting and click __"Skip Queue"__ when you have ${cfg.messages?.skipQueueInvites || 3} new invites! 🎉\n` +
                    `> * Click __"Verify"__ below to speed up the process!`
                )
                .setImage('https://images-ext-1.discordapp.net/external/VULbDbmS-k1uWssO9jW7K3SupaSmoJvE6rE6zxXikrc/https/wpamelia.com/wp-content/uploads/2018/11/ezgif-2-6d0b072c3d3f.gif');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('Verification').setStyle(ButtonStyle.Link).setURL(cfg.messages?.verificationURL).setEmoji(BotUtils.parseEmoji(cfg.emojis?.verification)),
                new ButtonBuilder().setLabel('Pro Tip').setStyle(ButtonStyle.Secondary).setCustomId('pro_tip').setEmoji(BotUtils.parseEmoji(cfg.emojis?.bluepin)),
                new ButtonBuilder().setCustomId(`unlock_prize_${claim.rewardId}`).setLabel('⏭️ Skip Queue').setStyle(ButtonStyle.Success)
            );

            try { await interaction.update({ embeds: [embed], components: [row] }); }
            catch (_) { await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral }).catch(() => {}); }

        } catch (e) {
            console.error(`❌ claimRewardFinal: ${e.message}`);
        }
    }
};
