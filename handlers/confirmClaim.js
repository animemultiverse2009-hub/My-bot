const { EmbedBuilder, ChannelType, PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');
const BotUtils = require('../utils');

module.exports = {
    async execute(interaction, client) {
        const parts = interaction.customId.split('_');
        const rewardId = parts.slice(2).join('_');
        const reward = config.rewards.find(r => r.id === rewardId);

        if (!reward) {
            return interaction.reply({ content: '❌ Invalid reward selected. Please try again.', flags: MessageFlags.Ephemeral });
        }

        const userId = interaction.user.id;
        const guild = interaction.guild;

        try {
            const inviteData = client.utils.getUserInvites(userId);
            const verifiedCount = await client.utils.calculateVerifiedInvites(userId, guild);
            const validInvites = verifiedCount + inviteData.bonus;

            if (validInvites < reward.invitesRequired) {
                return interaction.reply({
                    content: `❌ You don't have enough valid invites!\n\nYou have: **${validInvites}** (${verifiedCount} verified + ${inviteData.bonus} bonus)\nYou need: **${reward.invitesRequired}**`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const categoryId = config.channels.claimCategory;
            const category = await guild.channels.fetch(categoryId).catch(() => null);

            if (!category || category.type !== ChannelType.GuildCategory) {
                return interaction.reply({
                    content: '❌ **Config Error:** The claim category channel is not set up correctly. Contact an admin.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const botPerms = category.permissionsFor(guild.members.me);
            if (!botPerms.has(PermissionFlagsBits.ManageChannels)) {
                return interaction.reply({
                    content: '❌ **Permission Error:** Bot needs "Manage Channels" permission in the claims category.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const adminRole = await guild.roles.fetch(config.roles.adminPing).catch(() => null);
            if (!adminRole) {
                return interaction.reply({
                    content: '❌ **Config Error:** Admin role not found. Check `roles.adminPing` in config.json',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Deduct invites before creating channel
            const originalInvites = { total: inviteData.total, bonus: inviteData.bonus, verified: verifiedCount };
            let remaining = reward.invitesRequired;
            if (inviteData.total >= remaining) {
                inviteData.total -= remaining;
            } else {
                remaining -= inviteData.total;
                inviteData.total = 0;
                inviteData.bonus = Math.max(0, inviteData.bonus - remaining);
            }
            client.utils.setUserInvites(userId, inviteData);

            // Create private ticket channel
            const ticketId = Math.random().toString(36).substring(2, 8).toUpperCase();

            const claimChannel = await guild.channels.create({
                name: `claim-${ticketId}`,
                type: ChannelType.GuildText,
                parent: categoryId,
                reason: 'Reward claim ticket',
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
                    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] }
                ]
            });

            // Save claim data
            const claims = client.utils.loadJSON('claims.json');
            claims[claimChannel.id] = {
                userId,
                rewardId,
                reward: {
                    id: reward.id, name: reward.name, emoji: reward.emoji,
                    invitesRequired: reward.invitesRequired, type: reward.type,
                    roleId: reward.roleId, displayName: reward.displayName,
                    duration: reward.duration, amount: reward.amount,
                    payoutImage: reward.payoutImage, payoutIcon: reward.payoutIcon,
                    embedColor: reward.embedColor
                },
                originalInvites,
                ticketId,
                channelId: claimChannel.id,
                status: 'profile_confirmation',
                startedAt: Date.now(),
                verified: false,
                codeGenerated: false,
                queueSkipped: false
            };
            client.utils.saveJSON('claims.json', claims);

            // Reply to user with link to new channel
            try { await interaction.message.delete().catch(() => {}); } catch (_) {}

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.grey)
                    .setTitle(`Continue In Your Private Channel! ${config.emojis.wtickk}`)
                    .setDescription(
                        `> ${config.emojis.wnext} Continue claiming your reward in your private channel\n\n` +
                        `🔒 **Ticket ID:** \`${ticketId}\`\n📍 Channel: ${claimChannel}\n\n` +
                        `✅ This channel is **private** — only you and admins can see it!`
                    )
                ],
                flags: MessageFlags.Ephemeral
            });

            // Send profile confirmation in the new private channel
            const user = interaction.user;
            const m = await guild.members.fetch(user.id);
            const statusMap = { online: 'Online', idle: 'Idle', dnd: 'Do Not Disturb', offline: 'Offline' };
            const presence = statusMap[m.presence?.status || 'offline'];

            const profileEmbed = new EmbedBuilder()
                .setColor('#6666FF')
                .setTitle(`Confirm Your Discord Profile ${config.emojis.discordlogo}`)
                .setDescription(`>>> **Is this you?**\n* Username: \`${user.username}\`\n* User ID: \`${user.id}\`\n* Status: \`${presence}\``)
                .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
                .setFooter({ text: `Ticket ID: ${ticketId}` });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`profile_yes_${rewardId}`)
                        .setLabel("Yes, that's me")
                        .setStyle(ButtonStyle.Success)
                        .setEmoji(BotUtils.parseEmoji(config.emojis.wtick)),
                    new ButtonBuilder()
                        .setCustomId(`profile_no_${rewardId}`)
                        .setLabel("No, that's not me")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(BotUtils.parseEmoji(config.emojis.wcross))
                );

            await claimChannel.send({ content: `<@${user.id}>`, embeds: [profileEmbed], components: [row] });

            console.log(`🎫 Claim channel created: claim-${ticketId} | User: ${user.username} | Reward: ${reward.name}`);

        } catch (error) {
            console.error('❌ Error creating claim channel:', error.message);

            // Attempt invite refund
            try {
                const inviteData = client.utils.getUserInvites(userId);
                const claims = client.utils.loadJSON('claims.json');
                const recent = Object.values(claims).find(c => c.userId === userId && c.startedAt > Date.now() - 60000);
                if (recent?.originalInvites) {
                    inviteData.total = recent.originalInvites.total;
                    inviteData.bonus = recent.originalInvites.bonus;
                    client.utils.setUserInvites(userId, inviteData);
                }
            } catch (_) {}

            interaction.reply({
                content: `❌ **Error creating claim channel:** \`${error.message}\`\n\nContact an admin — your invites have been refunded.`,
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
    }
};
