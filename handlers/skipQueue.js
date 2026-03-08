const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const BotUtils = require('../utils');
const cache    = require('../dataCache');

module.exports = {
    async execute(interaction, client) {
        const guildId   = interaction.guild.id;
        const channelId = interaction.channel.id;
        const userId    = interaction.user.id;

        // ── 1. ACK immediately ────────────────────────────────────────────────
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        } catch {
            return; // interaction already expired
        }

        // ── 2. Load claim from cache (instant) ────────────────────────────────
        const claim = cache.getClaim(channelId, guildId);

        if (!claim || claim.userId !== userId) {
            return interaction.editReply({ content: '❌ Invalid claim session.' });
        }

        // ── 3. Already done? ──────────────────────────────────────────────────
        if (claim.queueSkipped === true || claim.status === 'completed') {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FEE75C')
                    .setTitle('⚠️ Already Completed')
                    .setDescription('You\'ve already skipped the queue! An admin will deliver your reward shortly.')
                ]
            });
        }

        const cfg  = BotUtils.loadGuildConfig(guildId);
        const guild = interaction.guild;

        // ── 4. Get current invite counts (cache read — instant) ───────────────
        const verifiedCount = await BotUtils.calculateVerifiedInvites(userId, guild);
        const inviteData    = BotUtils.getUserInvites(userId, guildId);

        // ── 5. Set baseline if not already set ───────────────────────────────
        // Baseline is set in claimRewardFinal, but handle missing case here too
        let baseline = claim.baselineInvites;
        if (!baseline) {
            baseline = { verified: verifiedCount, bonus: inviteData.bonus, total: inviteData.total, fake: inviteData.fake, left: inviteData.left };
            cache.patch(guildId, 'claims', c => { c[channelId].baselineInvites = baseline; return c; });
        }

        const newVerified     = Math.max(0, verifiedCount - baseline.verified);
        const newBonus        = Math.max(0, inviteData.bonus - baseline.bonus);
        const totalNewInvites = newVerified + newBonus;

        console.log(`\n🎫 SKIP QUEUE CHECK — ${interaction.user.username}`);
        console.log(`   Baseline: verified=${baseline.verified} bonus=${baseline.bonus}`);
        console.log(`   Current:  verified=${verifiedCount} bonus=${inviteData.bonus}`);
        console.log(`   New:      +${newVerified} verified +${newBonus} bonus = ${totalNewInvites} total`);
        console.log(`   Needs:    ${cfg.messages?.skipQueueInvites || 3}`);

        const needed = cfg.messages?.skipQueueInvites || 3;

        // ── 6. Not enough ─────────────────────────────────────────────────────
        if (totalNewInvites < needed) {
            const remaining = needed - totalNewInvites;

            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(cfg.colors?.error || '#E4000F')
                    .setTitle('⚠️ Not Enough New Invites')
                    .setDescription(
                        `❌ You need **${remaining} more new valid invite${remaining !== 1 ? 's' : ''}** since joining the queue.\n\n` +
                        `✅ **Progress:** ${totalNewInvites}/${needed} new valid invites\n\n` +
                        `🛡️ **Note:** Both **verified** and **bonus** invites count!\n\n` +
                        `-# ➡️ This is the last step to complete your claim!`
                    )
                    .setThumbnail(cfg.images?.errorIcon)
                    .addFields(
                        { name: '📊 Current Stats',   value: `Verified: ${verifiedCount}\nBonus: ${inviteData.bonus}`, inline: true },
                        { name: '📈 New Since Queue', value: `+${newVerified} verified\n+${newBonus} bonus\n= ${totalNewInvites} total`, inline: true }
                    )
                ]
            });
        }

        // ── 7. Complete! Lock it first in cache ───────────────────────────────
        cache.patch(guildId, 'claims', c => {
            if (c[channelId]) {
                c[channelId].status          = 'completed';
                c[channelId].queueSkipped    = true;
                c[channelId].completedAt     = Date.now();
                c[channelId].skipInvitesCount = totalNewInvites;
            }
            return c;
        });
        BotUtils.incrementStat(guildId, 'completedClaims');

        const rewardName = claim.reward?.name || 'your reward';

        // ── 8. Reply instantly ────────────────────────────────────────────────
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(cfg.colors?.success || '#00FF00')
                .setTitle('✅ Queue Skipped!')
                .setDescription(
                    `You got **${totalNewInvites} new valid invites** and skipped the queue!\n\n` +
                    `Your **${rewardName}** is being processed. An admin will deliver it shortly!\n\n` +
                    `⏳ Please be patient — do not ping admins.`
                )
                .setTimestamp()
            ]
        });

        // ── 9. Fire-and-forget: admin ping + vouch post ───────────────────────
        setImmediate(async () => {
            // Admin ping
            try {
                await interaction.channel.send(
                    `<@&${cfg.roles?.adminPing}> **Queue Skipped!**\n\n` +
                    `👤 ${interaction.user}\n` +
                    `📈 New valid invites: **${totalNewInvites}**\n` +
                    `🎁 Reward: **${rewardName}**\n` +
                    `🔒 Ticket: \`${claim.ticketId}\``
                );
            } catch (e) { console.error(`❌ Admin ping: ${e.message}`); }

            // Vouch post
            try {
                const vouchCh = await client.channels.fetch(cfg.channels?.vouchPayments).catch(() => null);
                if (!vouchCh) return;

                const r = claim.reward;
                let desc = '';
                if (r?.type === 'nitro')  desc = `A member claimed **${r.displayName}** for \`${r.duration}\` by inviting \`${r.invitesRequired}\` **verified friends** 🎁\nYou can too — just invite your friends!\n\n> Click **"Verification"** for exclusive prizes!`;
                if (r?.type === 'robux')  desc = `A member earned **${r.amount} Robux** by inviting \`${r.invitesRequired}\` **verified friends** 🎁\nYou can too!\n\n> Click **"Verification"** for exclusive prizes!`;

                const embed = new EmbedBuilder().setColor(r?.embedColor || '#00FF00').setTitle('__Congratulations!__').setDescription(desc);
                if (r?.payoutImage) embed.setImage(r.payoutImage);
                if (r?.payoutIcon)  embed.setThumbnail(r.payoutIcon);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setLabel('Claim Rewards!').setStyle(ButtonStyle.Link)
                        .setURL(`https://discord.com/channels/${cfg.guildId}/${cfg.channels?.inviteReward}`)
                        .setEmoji(BotUtils.parseEmoji(cfg.emojis?.tada)),
                    new ButtonBuilder().setLabel('Verification!').setStyle(ButtonStyle.Link)
                        .setURL(cfg.messages?.verificationURL)
                        .setEmoji(BotUtils.parseEmoji(cfg.emojis?.verification))
                );

                await vouchCh.send({ embeds: [embed], components: [row] });
            } catch (e) {
                console.error(`❌ Vouch post: ${e.message}`);
                if (e.code === 50035) console.error('   Hint: emoji error — run migrate-emojis.js');
            }
        });

        console.log(`✅ QUEUE SKIPPED — ${interaction.user.username} | ${rewardName} | ${totalNewInvites} new invites`);
    }
};
