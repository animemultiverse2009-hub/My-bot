const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config.json');

// YOUR user ID — only you can use this command
const OWNER_ID = config.ownerId;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dm-campaign')
        .setDescription('Owner only: Smart DM campaign controls')
        .addSubcommand(s => s.setName('start').setDescription('Start the DM campaign'))
        .addSubcommand(s => s.setName('stop').setDescription('Stop the DM campaign'))
        .addSubcommand(s => s.setName('status').setDescription('Show campaign stats'))
        .addSubcommand(s => s
            .setName('set-message')
            .setDescription('Set the DM message text')
            .addStringOption(o => o.setName('message').setDescription('The DM to send').setRequired(true)))
        .addSubcommand(s => s
            .setName('set-speed')
            .setDescription('Set DM send speed')
            .addStringOption(o => o.setName('speed').setDescription('Speed preset').setRequired(true)
                .addChoices(
                    { name: 'Slow (8–14 min) — safest',   value: 'slow'   },
                    { name: 'Medium (3–7 min)',            value: 'medium' },
                    { name: 'Fast (1.5–3 min) — riskier', value: 'fast'   }
                )))
        .addSubcommand(s => s
            .setName('enable-guild')
            .setDescription('Enable DMs for a specific guild')
            .addStringOption(o => o.setName('guild_id').setDescription('Guild ID').setRequired(true)))
        .addSubcommand(s => s
            .setName('disable-guild')
            .setDescription('Disable DMs for a specific guild')
            .addStringOption(o => o.setName('guild_id').setDescription('Guild ID').setRequired(true)))
        .addSubcommand(s => s
            .setName('preview')
            .setDescription('Preview top 10 highest priority members in a guild (no DMs sent)')
            .addStringOption(o => o.setName('guild_id').setDescription('Guild ID').setRequired(true)))
        .addSubcommand(s => s.setName('refresh').setDescription('Rebuild the queue without resetting sent list'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client) {
        // Owner-only check
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: '❌ This command is owner-only.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const sub = interaction.options.getSubcommand();
        const dm  = client.dmCampaign;

        if (!dm) {
            return interaction.editReply('❌ DM Campaign system not initialized. Check index.js.');
        }

        // ── start ─────────────────────────────────────────────────────────────
        if (sub === 'start') {
            const result = await dm.start();
            const embed = new EmbedBuilder()
                .setColor(result.ok ? '#00ff88' : '#ff4444')
                .setTitle(result.ok ? '📨 DM Campaign Started' : '❌ Could Not Start')
                .setDescription(result.ok
                    ? `✅ Campaign is running!\n\n**Queue size:** ${result.queueSize} members\n**Speed:** ${dm.cfg.speed}\n\nMembers will be DM'd from highest activity score → lowest.`
                    : `**Reason:** ${result.reason}`
                );
            return interaction.editReply({ embeds: [embed] });
        }

        // ── stop ──────────────────────────────────────────────────────────────
        if (sub === 'stop') {
            const result = dm.stop();
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('⏹️ DM Campaign Stopped')
                    .setDescription(`Stopped. **${result.remaining}** members were still in queue.\n\nRun \`/dm-campaign start\` to resume (will continue from where it left off).`)
                ]
            });
        }

        // ── status ────────────────────────────────────────────────────────────
        if (sub === 'status') {
            const s = dm.getStats();

            // Build per-guild breakdown
            let guildLines = '';
            for (const [gId, gStats] of Object.entries(s.byGuild)) {
                const guild = client.guilds.cache.get(gId);
                guildLines += `**${guild?.name || gId}:** ${gStats.sent} sent, ${gStats.failed} failed\n`;
            }

            const pauseInfo = s.rateLimited && s.pausedUntil
                ? `\n⚠️ **Rate limited** — resumes <t:${Math.floor(s.pausedUntil / 1000)}:R>`
                : '';

            const embed = new EmbedBuilder()
                .setColor(s.isRunning ? '#00ff88' : '#888888')
                .setTitle(`📨 DM Campaign — ${s.isRunning ? '🟢 Running' : '🔴 Stopped'}`)
                .setDescription(
                    `**Speed:** ${s.speed}\n` +
                    `**Queue remaining:** ${s.queueSize}\n` +
                    `**Enabled guilds:** ${s.enabledGuilds}\n` +
                    `**Message set:** ${s.message ? '✅' : '❌ Not set'}\n` +
                    pauseInfo
                )
                .addFields(
                    {
                        name: '📊 Stats',
                        value: `Sent: **${s.totalSent}**\nFailed: **${s.totalFailed}**\nSkipped: **${s.totalSkipped}**`,
                        inline: true
                    },
                    {
                        name: '🏠 Per Guild',
                        value: guildLines || 'No data yet',
                        inline: true
                    }
                )
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        // ── set-message ───────────────────────────────────────────────────────
        if (sub === 'set-message') {
            const msg = interaction.options.getString('message');
            dm.setMessage(msg);
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#00ff88')
                    .setTitle('✅ DM Message Set')
                    .setDescription(`**Preview:**\n\n${msg}`)
                ]
            });
        }

        // ── set-speed ─────────────────────────────────────────────────────────
        if (sub === 'set-speed') {
            const speed = interaction.options.getString('speed');
            dm.setSpeed(speed);
            return interaction.editReply(`✅ Speed set to **${speed}**. Takes effect on next DM.`);
        }

        // ── enable-guild ──────────────────────────────────────────────────────
        if (sub === 'enable-guild') {
            const gId   = interaction.options.getString('guild_id');
            const guild = client.guilds.cache.get(gId);
            if (!guild) return interaction.editReply(`❌ Guild \`${gId}\` not found in bot's cache.`);
            dm.enableGuild(gId);
            return interaction.editReply(`✅ DM campaign enabled for **${guild.name}** (${guild.memberCount} members).`);
        }

        // ── disable-guild ─────────────────────────────────────────────────────
        if (sub === 'disable-guild') {
            const gId   = interaction.options.getString('guild_id');
            const guild = client.guilds.cache.get(gId);
            dm.disableGuild(gId);
            return interaction.editReply(`✅ DM campaign disabled for **${guild?.name || gId}**. Members already queued from this guild have been removed.`);
        }

        // ── preview ───────────────────────────────────────────────────────────
        if (sub === 'preview') {
            const gId    = interaction.options.getString('guild_id');
            const guild  = client.guilds.cache.get(gId);
            if (!guild) return interaction.editReply(`❌ Guild \`${gId}\` not found.`);

            await interaction.editReply(`🔍 Scoring members in **${guild.name}**... (this takes a few seconds)`);

            const top = await dm.previewQueue(gId, 10);
            if (!top.length) return interaction.editReply('No eligible members found (all already DM\'d or guild empty).');

            const lines = top.map((m, i) =>
                `**${i + 1}.** \`${m.username}\` — Score: **${m.score}** | ${m.status} | joined ${m.joinedDaysAgo}d ago | ${m.roleCount} roles`
            ).join('\n');

            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle(`🏆 Top 10 Priority — ${guild.name}`)
                    .setDescription(`These members would be DM'd first:\n\n${lines}\n\n*No DMs sent — this is preview only.*`)
                ]
            });
        }

        // ── refresh ───────────────────────────────────────────────────────────
        if (sub === 'refresh') {
            await interaction.editReply('🔄 Rebuilding queue...');
            const newSize = await dm.refreshQueue();
            return interaction.editReply(`✅ Queue rebuilt — **${newSize}** members ready (already-sent users excluded).`);
        }
    }
};
