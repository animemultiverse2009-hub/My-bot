const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const BotUtils = require('../utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Admin commands for invite management')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(s => s.setName('add-bonus').setDescription('Add bonus invites to a user')
            .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
            .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('remove-invites').setDescription('Remove invites from a user')
            .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
            .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('reset-invites').setDescription('Reset all invites for a user')
            .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
        .addSubcommand(s => s.setName('view-stats').setDescription('View invite stats for a user')
            .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
        .addSubcommand(s => s.setName('mark-fake').setDescription('Mark/unmark an invite as fake')
            .addUserOption(o => o.setName('inviter').setDescription('Inviter').setRequired(true))
            .addUserOption(o => o.setName('invited').setDescription('Invited user').setRequired(true))
            .addBooleanOption(o => o.setName('fake').setDescription('Is fake?').setRequired(true)))
        .addSubcommand(s => s.setName('random-payouts-start').setDescription('Start random payout system'))
        .addSubcommand(s => s.setName('random-payouts-stop').setDescription('Stop random payout system'))
        .addSubcommand(s => s.setName('random-payouts-status').setDescription('Check random payout system status'))
        .addSubcommand(s => s.setName('send-random-payout').setDescription('Manually trigger a random payout')),

    async execute(interaction, client) {
        const guildId = interaction.guild.id;
        const cfg     = BotUtils.loadGuildConfig(guildId);
        const sub     = interaction.options.getSubcommand();

        if (sub === 'add-bonus') {
            const user   = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            const data   = BotUtils.getUserInvites(user.id, guildId);
            const before = data.bonus;
            data.bonus  += amount;
            BotUtils.setUserInvites(user.id, data, guildId);
            console.log(`➕ Admin added ${amount} bonus invites to ${user.username} | ${before} → ${data.bonus} | guild: ${guildId}`);
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(cfg.colors?.success || '#00FF00').setTitle('✅ Bonus Added')
                    .setDescription(`Added **${amount}** bonus invites to ${user}`)
                    .addFields({ name: 'Before', value: `${before}`, inline: true }, { name: 'Added', value: `+${amount}`, inline: true }, { name: 'After', value: `${data.bonus}`, inline: true })],
                flags: MessageFlags.Ephemeral
            });
        }

        if (sub === 'remove-invites') {
            const user   = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            const data   = BotUtils.getUserInvites(user.id, guildId);
            const before = data.total;
            data.total   = Math.max(0, data.total - amount);
            BotUtils.setUserInvites(user.id, data, guildId);
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(cfg.colors?.success || '#00FF00').setTitle('✅ Invites Removed')
                    .setDescription(`Removed **${amount}** invites from ${user}`)
                    .addFields({ name: 'Before', value: `${before}`, inline: true }, { name: 'Removed', value: `-${amount}`, inline: true }, { name: 'After', value: `${data.total}`, inline: true })],
                flags: MessageFlags.Ephemeral
            });
        }

        if (sub === 'reset-invites') {
            const user = interaction.options.getUser('user');
            BotUtils.setUserInvites(user.id, { total: 0, bonus: 0, left: 0, fake: 0, verified: 0, invitedUsers: [] }, guildId);
            return interaction.reply({ content: `✅ Reset all invite data for ${user}`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'view-stats') {
            const user       = interaction.options.getUser('user');
            const data       = BotUtils.getUserInvites(user.id, guildId);
            const valid      = (data.verified || 0) + (data.bonus || 0);
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(cfg.colors?.info || '#0080FF').setTitle(`📊 ${user.username}`)
                    .addFields(
                        { name: 'Total',    value: `${data.total}`,          inline: true },
                        { name: 'Verified', value: `${data.verified || 0}`,  inline: true },
                        { name: 'Bonus',    value: `${data.bonus}`,          inline: true },
                        { name: 'Left',     value: `${data.left}`,           inline: true },
                        { name: 'Fake',     value: `${data.fake}`,           inline: true },
                        { name: 'Valid',    value: `${valid}`,               inline: true },
                        { name: 'Invited',  value: `${data.invitedUsers?.length || 0}`, inline: true }
                    ).setThumbnail(user.displayAvatarURL())],
                flags: MessageFlags.Ephemeral
            });
        }

        if (sub === 'mark-fake') {
            const inviterUser = interaction.options.getUser('inviter');
            const invitedUser = interaction.options.getUser('invited');
            const isFake      = interaction.options.getBoolean('fake');
            const data        = BotUtils.getUserInvites(inviterUser.id, guildId);
            const entry       = data.invitedUsers?.find(u => u.userId === invitedUser.id);
            if (!entry) return interaction.reply({ content: `❌ No invite relationship found.`, flags: MessageFlags.Ephemeral });
            const wasFake = entry.isFake;
            entry.isFake  = isFake;
            if (isFake && !wasFake)       data.fake = (data.fake || 0) + 1;
            else if (!isFake && wasFake)  data.fake = Math.max(0, (data.fake || 0) - 1);
            BotUtils.setUserInvites(inviterUser.id, data, guildId);
            return interaction.reply({ content: `✅ Marked as ${isFake ? '🚫 FAKE' : '✅ VALID'}`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'random-payouts-start')  { client.randomPayouts.start();  return interaction.reply({ content: '✅ Random payouts started.',  flags: MessageFlags.Ephemeral }); }
        if (sub === 'random-payouts-stop')   { client.randomPayouts.stop();   return interaction.reply({ content: '✅ Random payouts stopped.',  flags: MessageFlags.Ephemeral }); }
        if (sub === 'random-payouts-status') {
            const s = client.randomPayouts.getStats();
            return interaction.reply({ content: `**Status:** ${s.isRunning ? '✅ Running' : '❌ Stopped'}`, flags: MessageFlags.Ephemeral });
        }
        if (sub === 'send-random-payout') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await client.randomPayouts.sendRandomPayout();
            return interaction.editReply({ content: '✅ Random payout triggered.' });
        }
    }
};
