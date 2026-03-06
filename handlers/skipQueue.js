const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const config = require('../config.json');
const BotUtils = require('../utils');

module.exports = {
    async execute(interaction, client) {
        // Already deferred in interactionCreate.js
        const channelId = interaction.channel.id;
        const claims = client.utils.loadJSON('claims.json');
        const claim = claims[channelId];

        if (!claim || claim.userId !== interaction.user.id) {
            return interaction.editReply({ content: '❌ Invalid claim session.' }).catch(() => {});
        }

        if (claim.queueSkipped === true || claim.status === 'completed') {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.warning)
                    .setTitle('⚠️ Already Completed')
                    .setDescription('You\'ve already skipped the queue! An admin will deliver your reward shortly. Please be patient.')
                ]
            }).catch(() => {});
        }

        const userId = interaction.user.id;
        const guild = interaction.guild;

        const verifiedCount = await client.utils.updateVerifiedCount(userId, guild);
        const inviteData = client.utils.getUserInvites(userId);

        // Save baseline if not already set
        if (!claim.baselineInvites) {
            claim.baselineInvites = {
                verified: verifiedCount,
                bonus: inviteData.bonus,
                total: inviteData.total,
                fake: inviteData.fake,
                left: inviteData.left
            };
            claims[channelId] = claim;
            client.utils.saveJSON('claims.json', claims);
        }

        const baseline = claim.baselineInvites;
        const newVerified = verifiedCount - baseline.verified;
        const newBonus = inviteData.bonus - baseline.bonus;
        const totalNew = newVerified + newBonus;
        const required = config.messages.skipQueueInvites;

        console.log(`\n🎫 SKIP QUEUE CHECK — ${interaction.user.username}`);
        console.log(`   New verified: +${newVerified} | New bonus: +${newBonus} | Total new: ${totalNew} | Required: ${required}`);

        if (totalNew < required) {
            const remaining = required - totalNew;

            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.error)
                    .setTitle(`${config.emojis.alert} Not Enough New Invites`)
                    .setDescription(
                        `${config.emojis.rcross} You need **${remaining} more new valid invite${remaining !== 1 ? 's' : ''}** since joining the queue.\n\n` +
                        `${config.emojis.gtick} **Progress:** ${totalNew}/${required} new valid invites\n\n` +
                        `${config.emojis.shield} Both **verified** and **bonus** invites count!\n\n` +
                        `-# ${config.emojis.rarrow} This is the last step to claim your reward!`
                    )
                    .setThumbnail(config.images.errorIcon)
                    .addFields(
                        { name: '📊 Current Stats', value: `Verified: ${verifiedCount}\nBonus: ${inviteData.bonus}`, inline: true },
                        { name: '📈 New Since Queue', value: `+${newVerified} verified\n+${newBonus} bonus\n= ${totalNew} total`, inline: true }
                    )
                ]
            }).catch(() => {});
        }

        await this.completeQueue(interaction, client, claim, totalNew, channelId);
    },

    async completeQueue(interaction, client, claim, newInvites, channelId) {
        const claims = client.utils.loadJSON('claims.json');
        claims[channelId].status = 'completed';
        claims[channelId].queueSkipped = true;
        claims[channelId].completedAt = Date.now();
        claims[channelId].skipInvitesCount = newInvites;
        client.utils.saveJSON('claims.json', claims);

        const rewardName = claim.reward?.name || 'your reward';

        // Confirm to user
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Queue Skipped Successfully!')
                .setDescription(
                    `You skipped the queue with **${newInvites} new valid invites**!\n\n` +
                    `Your **${rewardName}** will be delivered by an admin shortly.\n\n` +
                    `⏳ Please be patient and don't spam buttons or ping admins.`
                )
                .setTimestamp()
            ]
        }).catch(() => {});

        // Ping admin in claim channel
        await interaction.channel.send(
            `<@&${config.roles.adminPing}> **Queue Skipped!**\n\n` +
            `👤 User: ${interaction.user}\n` +
            `📈 New valid invites: **${newInvites}**\n` +
            `🎁 Reward: **${rewardName}**\n` +
            `🔒 Ticket: \`${claim.ticketId}\`\n` +
            `✅ Ready for delivery!`
        ).catch(() => {});

        // Post to vouch channel
        await this.postToVouch(interaction, client, claim);

        console.log(`✅ QUEUE SKIPPED — ${interaction.user.username} — ${rewardName} — ${newInvites} new invites`);
    },

    async postToVouch(interaction, client, claim) {
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
        } catch (error) {
            console.error('Error posting to vouch channel:', error.message);
        }
    }
};