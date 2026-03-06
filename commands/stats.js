const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View server invite statistics')
        .addSubcommand(sub => sub.setName('server').setDescription('View overall server statistics'))
        .addSubcommand(sub =>
            sub.setName('leaderboard')
                .setDescription('View invite leaderboard')
                .addIntegerOption(opt => opt.setName('limit').setDescription('Number of users to show (5-25)').setMinValue(5).setMaxValue(25)))
        .addSubcommand(sub =>
            sub.setName('user')
                .setDescription("View a user's invite statistics")
                .addUserOption(opt => opt.setName('user').setDescription('User to check'))),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'server') {
            const invites = client.utils.loadJSON('invites.json');
            let total = 0, fake = 0, left = 0, bonus = 0;

            for (const d of Object.values(invites)) {
                total += d.total;
                fake += d.fake;
                left += d.left;
                bonus += d.bonus;
            }

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.info)
                    .setTitle('📊 Server Invite Statistics')
                    .addFields(
                        { name: 'Total Invites', value: `${total}`, inline: true },
                        { name: 'Bonus Invites', value: `${bonus}`, inline: true },
                        { name: 'Fake Invites', value: `${fake}`, inline: true },
                        { name: 'Left Members', value: `${left}`, inline: true },
                        { name: 'Total Inviters', value: `${Object.keys(invites).length}`, inline: true }
                    )
                    .setTimestamp()
                ]
            });
        }

        else if (sub === 'leaderboard') {
            const limit = interaction.options.getInteger('limit') || 10;
            const invites = client.utils.loadJSON('invites.json');

            const board = Object.entries(invites)
                .map(([userId, d]) => ({ userId, valid: (d.verified || 0) + d.bonus }))
                .sort((a, b) => b.valid - a.valid)
                .slice(0, limit);

            const lines = await Promise.all(board.map(async (entry, i) => {
                const user = await client.users.fetch(entry.userId).catch(() => null);
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
                return `${medal} ${user?.username || 'Unknown'} — **${entry.valid}** valid invites`;
            }));

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.info)
                    .setTitle('🏆 Invite Leaderboard')
                    .setDescription(lines.join('\n') || 'No data yet.')
                    .setTimestamp()
                ]
            });
        }

        else if (sub === 'user') {
            const user = interaction.options.getUser('user') || interaction.user;
            const data = client.utils.getUserInvites(user.id);
            const valid = (data.verified || 0) + data.bonus;

            // Rank
            const invites = client.utils.loadJSON('invites.json');
            const sorted = Object.entries(invites)
                .map(([id, d]) => ({ id, valid: (d.verified || 0) + d.bonus }))
                .sort((a, b) => b.valid - a.valid);
            const rank = sorted.findIndex(e => e.id === user.id) + 1;

            const isOwnStats = !interaction.options.getUser('user');

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.info)
                    .setTitle(`📊 ${user.username}'s Invite Stats`)
                    .setThumbnail(user.displayAvatarURL())
                    .addFields(
                        { name: 'Valid Invites', value: `${valid}`, inline: true },
                        { name: 'Verified', value: `${data.verified || 0}`, inline: true },
                        { name: 'Bonus', value: `${data.bonus}`, inline: true },
                        { name: 'Total Invited', value: `${data.total}`, inline: true },
                        { name: 'Left', value: `${data.left}`, inline: true },
                        { name: 'Fake', value: `${data.fake}`, inline: true },
                        { name: 'Rank', value: `#${rank || '—'}`, inline: true }
                    )
                    .setFooter({ text: `Total users invited: ${data.invitedUsers.length}` })
                    .setTimestamp()
                ],
                // Own stats → ephemeral so it doesn't clutter the channel
                flags: isOwnStats ? MessageFlags.Ephemeral : undefined
            });
        }
    }
};
