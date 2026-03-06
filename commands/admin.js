const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Admin commands for invite management')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('add-bonus')
                .setDescription('Add bonus invites to a user')
                .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
                .addIntegerOption(opt => opt.setName('amount').setDescription('Amount').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('remove-invites')
                .setDescription('Remove invites from a user')
                .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
                .addIntegerOption(opt => opt.setName('amount').setDescription('Amount').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('reset-invites')
                .setDescription('Reset all invites for a user')
                .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('view-stats')
                .setDescription('View detailed stats for a user')
                .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('mark-fake')
                .setDescription('Manually mark/unmark an invite as fake')
                .addUserOption(opt => opt.setName('inviter').setDescription('Inviter').setRequired(true))
                .addUserOption(opt => opt.setName('invited').setDescription('Invited user').setRequired(true))
                .addBooleanOption(opt => opt.setName('fake').setDescription('Is fake?').setRequired(true)))
        .addSubcommand(sub => sub.setName('random-payouts-start').setDescription('Start the random payout system'))
        .addSubcommand(sub => sub.setName('random-payouts-stop').setDescription('Stop the random payout system'))
        .addSubcommand(sub => sub.setName('random-payouts-status').setDescription('Check random payout system status'))
        .addSubcommand(sub => sub.setName('send-random-payout').setDescription('Manually trigger a random payout now')),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();
        const E = MessageFlags.Ephemeral; // Shorthand

        if (sub === 'add-bonus') {
            const user = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            const data = client.utils.getUserInvites(user.id);
            data.bonus += amount;
            client.utils.setUserInvites(user.id, data);

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.success)
                    .setTitle('✅ Bonus Added')
                    .setDescription(`Added **${amount}** bonus invites to ${user}`)
                    .addFields({ name: 'New Bonus Total', value: `${data.bonus}` })
                ],
                flags: E
            });
        }

        else if (sub === 'remove-invites') {
            const user = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            const data = client.utils.getUserInvites(user.id);
            data.total = Math.max(0, data.total - amount);
            client.utils.setUserInvites(user.id, data);

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.success)
                    .setTitle('✅ Invites Removed')
                    .setDescription(`Removed **${amount}** invites from ${user}`)
                    .addFields({ name: 'New Total', value: `${data.total}` })
                ],
                flags: E
            });
        }

        else if (sub === 'reset-invites') {
            const user = interaction.options.getUser('user');
            client.utils.setUserInvites(user.id, { total: 0, bonus: 0, left: 0, fake: 0, verified: 0, invitedUsers: [] });

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.success)
                    .setTitle('✅ Invites Reset')
                    .setDescription(`Reset all invite data for ${user}`)
                ],
                flags: E
            });
        }

        else if (sub === 'view-stats') {
            const user = interaction.options.getUser('user');
            const data = client.utils.getUserInvites(user.id);
            const valid = data.total + data.bonus - data.fake - data.left;

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.info)
                    .setTitle(`📊 Stats — ${user.username}`)
                    .setThumbnail(user.displayAvatarURL())
                    .addFields(
                        { name: 'Total', value: `${data.total}`, inline: true },
                        { name: 'Bonus', value: `${data.bonus}`, inline: true },
                        { name: 'Verified', value: `${data.verified || 0}`, inline: true },
                        { name: 'Left', value: `${data.left}`, inline: true },
                        { name: 'Fake', value: `${data.fake}`, inline: true },
                        { name: 'Valid (total)', value: `${valid}`, inline: true },
                        { name: 'Invited Users', value: `${data.invitedUsers.length}`, inline: true }
                    )
                ],
                flags: E
            });
        }

        else if (sub === 'mark-fake') {
            const inviter = interaction.options.getUser('inviter');
            const invited = interaction.options.getUser('invited');
            const isFake = interaction.options.getBoolean('fake');

            const data = client.utils.getUserInvites(inviter.id);
            const entry = data.invitedUsers.find(u => u.userId === invited.id);

            if (!entry) {
                return interaction.reply({ content: '❌ Could not find this invite relationship.', flags: E });
            }

            const wasFake = entry.isFake;
            entry.isFake = isFake;
            if (isFake && !wasFake) data.fake += 1;
            else if (!isFake && wasFake) data.fake = Math.max(0, data.fake - 1);

            client.utils.setUserInvites(inviter.id, data);

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.success)
                    .setTitle('✅ Invite Updated')
                    .setDescription(`Marked ${invited}'s invite as **${isFake ? 'FAKE' : 'VALID'}** for ${inviter}`)
                ],
                flags: E
            });
        }

        else if (sub === 'random-payouts-start') {
            client.randomPayouts.start();
            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.success)
                    .setTitle('🎰 Random Payout System Started')
                    .setDescription(`Sending payouts every ${config.randomPayouts.minMinutes}–${config.randomPayouts.maxMinutes} minutes.`)
                ],
                flags: E
            });
        }

        else if (sub === 'random-payouts-stop') {
            client.randomPayouts.stop();
            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.error)
                    .setTitle('🛑 Random Payout System Stopped')
                ],
                flags: E
            });
        }

        else if (sub === 'random-payouts-status') {
            const stats = client.randomPayouts.getStats();
            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(stats.isRunning ? config.colors.success : config.colors.error)
                    .setTitle('🎰 Random Payout System Status')
                    .addFields(
                        { name: 'Status', value: stats.isRunning ? '✅ Running' : '❌ Stopped', inline: true },
                        { name: 'Next Payout', value: stats.nextPayoutScheduled ? '⏰ Scheduled' : '❌ None', inline: true },
                        { name: 'Interval', value: `${config.randomPayouts.minMinutes}–${config.randomPayouts.maxMinutes} min`, inline: true }
                    )
                ],
                flags: E
            });
        }

        else if (sub === 'send-random-payout') {
            await interaction.deferReply({ flags: E });
            await client.randomPayouts.sendRandomPayout();
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.success)
                    .setTitle('✅ Random Payout Sent')
                    .setDescription('Payout message posted to the vouch/payments channel.')
                ]
            });
        }
    }
};
