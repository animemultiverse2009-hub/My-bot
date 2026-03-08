const { EmbedBuilder, ChannelType, PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const BotUtils = require('../utils');
const cache    = require('../dataCache');
const lock     = require('../interactionLock');

module.exports = {
    async execute(interaction, client) {
        const guildId  = interaction.guild.id;
        const cfg      = BotUtils.loadGuildConfig(guildId);
        const rewardId = interaction.customId.split('_').slice(2).join('_');
        const reward   = cfg.rewards?.find(r => r.id === rewardId);
        const userId   = interaction.user.id;

        if (!reward) {
            return interaction.reply({ content: '❌ Invalid reward. Please try again.', flags: MessageFlags.Ephemeral });
        }

        // ── 1. ACK immediately — this is what gives sub-100ms feel ──────────
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // ── 2. Check claim limit (from cache — instant) ───────────────────────
        const limitCheck = BotUtils.checkClaimLimit(guildId);
        if (!limitCheck.allowed) {
            return interaction.editReply({ content: `❌ ${limitCheck.reason}` });
        }

        // ── 3. Check invites (from cache — instant) ───────────────────────────
        const guild      = interaction.guild;
        const inviteData = BotUtils.getUserInvites(userId, guildId);

        // calculateVerifiedInvites needs guild.members.fetch — runs async but is fast
        const verifiedCount = await BotUtils.calculateVerifiedInvites(userId, guild);
        const validInvites  = verifiedCount + inviteData.bonus;

        console.log(`\n🔍 confirmClaim — ${interaction.user.username} | reward: ${rewardId}`);
        console.log(`   Verified: ${verifiedCount} | Bonus: ${inviteData.bonus} | Valid: ${validInvites} | Needs: ${reward.invitesRequired}`);

        if (validInvites < reward.invitesRequired) {
            return interaction.editReply({
                content: `❌ Not enough valid invites!\nYou have: **${validInvites}** | You need: **${reward.invitesRequired}**`
            });
        }

        // ── 4. Verify category channel ────────────────────────────────────────
        const categoryId = cfg.channels?.claimCategory;
        const category   = await guild.channels.fetch(categoryId).catch(() => null);
        if (!category || category.type !== ChannelType.GuildCategory) {
            return interaction.editReply({ content: `❌ Claim category not configured. Ask an admin to run \`/setup-server\`.` });
        }

        const botPerms = category.permissionsFor(guild.members.me);
        if (!botPerms.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.editReply({ content: `❌ Bot needs \`Manage Channels\` permission in the claim category.` });
        }

        const adminRole = await guild.roles.fetch(cfg.roles?.adminPing).catch(() => null);
        if (!adminRole) {
            return interaction.editReply({ content: `❌ Admin role not found. Check setup config.` });
        }

        // ── 5. Deduct invites (in cache — instant write, disk later) ──────────
        const originalInvites = { total: inviteData.total, bonus: inviteData.bonus, verified: verifiedCount };
        let remaining = reward.invitesRequired;
        if (inviteData.total >= remaining) {
            inviteData.total -= remaining;
        } else {
            remaining -= inviteData.total;
            inviteData.total = 0;
            inviteData.bonus = Math.max(0, inviteData.bonus - remaining);
        }
        BotUtils.setUserInvites(userId, inviteData, guildId);

        // ── 6. Create ticket channel ──────────────────────────────────────────
        const ticketId = Math.random().toString(36).substring(2, 8).toUpperCase();
        let claimChannel;
        try {
            claimChannel = await guild.channels.create({
                name:   `claim-${ticketId}`,
                type:   ChannelType.GuildText,
                parent: categoryId,
                reason: 'Reward claim ticket',
                permissionOverwrites: [
                    { id: guild.id,        deny:  [PermissionFlagsBits.ViewChannel] },
                    { id: userId,          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
                    { id: client.user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
                    { id: adminRole.id,    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] }
                ]
            });
        } catch (e) {
            // Refund invites if channel creation fails
            inviteData.total = originalInvites.total;
            inviteData.bonus = originalInvites.bonus;
            BotUtils.setUserInvites(userId, inviteData, guildId);
            console.error(`❌ Channel create failed: ${e.message}`);
            return interaction.editReply({ content: `❌ Could not create claim channel. Error: \`${e.message}\`` });
        }

        // ── 7. Save claim to cache (instant) ──────────────────────────────────
        const claimData = {
            userId, rewardId, guildId,
            reward: {
                id: reward.id, name: reward.name, emoji: reward.emoji,
                invitesRequired: reward.invitesRequired, type: reward.type,
                roleId: reward.roleId, displayName: reward.displayName,
                duration: reward.duration, amount: reward.amount,
                payoutImage: reward.payoutImage, payoutIcon: reward.payoutIcon,
                embedColor: reward.embedColor
            },
            originalInvites, ticketId,
            channelId: claimChannel.id,
            status: 'profile_confirmation',
            startedAt: Date.now(),
            verified: false, codeGenerated: false, queueSkipped: false,
            baselineInvites: null
        };
        cache.setClaim(claimChannel.id, claimData, guildId);
        BotUtils.incrementStat(guildId, 'totalClaims');

        // ── 8. Reply to user instantly ────────────────────────────────────────
        try { await interaction.message?.delete(); } catch (_) {}

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(cfg.colors?.grey || '#E0E0E0')
                .setTitle(`Continue In Your Private Channel!`)
                .setDescription(`> ➡️ Continue in your private channel\n\n🔒 **Ticket:** \`${ticketId}\`\n📍 ${claimChannel}\n\n✅ Only you and admins can see it.`)
            ]
        });

        // ── 9. Post profile confirmation in ticket (fire-and-forget) ─────────
        // This does NOT block the reply above — runs in background
        setImmediate(async () => {
            try {
                const user      = interaction.user;
                const member    = await guild.members.fetch(user.id).catch(() => null);
                const presence  = member?.presence?.status || 'offline';
                const statusMap = { online: 'Online', idle: 'Idle', dnd: 'Do Not Disturb', offline: 'Offline' };

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`profile_yes_${rewardId}`).setLabel("Yes, that's me").setStyle(ButtonStyle.Success).setEmoji(BotUtils.parseEmoji(cfg.emojis?.wtick)),
                    new ButtonBuilder().setCustomId(`profile_no_${rewardId}`).setLabel("No, that's not me").setStyle(ButtonStyle.Danger).setEmoji(BotUtils.parseEmoji(cfg.emojis?.wcross))
                );

                await claimChannel.send({
                    content: `<@${user.id}>`,
                    embeds: [new EmbedBuilder()
                        .setColor('#6666FF')
                        .setTitle(`Confirm Your Discord Profile`)
                        .setDescription(`>>> **Is this you?**\n* Username: \`${user.username}\`\n* User ID: \`${user.id}\`\n* Status: \`${statusMap[presence]}\``)
                        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
                        .setFooter({ text: `Ticket ID: ${ticketId}` })
                    ],
                    components: [row]
                });

                console.log(`✅ Claim ticket: claim-${ticketId} | ${reward.name} | ${user.username}`);
            } catch (e) {
                console.error(`❌ Profile message failed: ${e.message}`);
                if (e.code === 50035) console.error('   Hint: emoji error — run migrate-emojis.js');
            }
        });
    }
};
