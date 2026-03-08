const {
    SlashCommandBuilder, EmbedBuilder,
    PermissionFlagsBits, MessageFlags
} = require('discord.js');
const BotUtils = require('../utils');
const { PLANS } = require('../utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('owner')
        .setDescription('Bot owner only — management dashboard')

        // ── stats ──────────────────────────────────────────────────────────────
        .addSubcommandGroup(g => g.setName('stats').setDescription('View bot statistics')
            .addSubcommand(s => s.setName('network').setDescription('Stats across all servers'))
            .addSubcommand(s => s
                .setName('guild')
                .setDescription('Stats for a specific server')
                .addStringOption(o => o.setName('guild_id').setDescription('Guild ID').setRequired(true))
            )
        )

        // ── guild ──────────────────────────────────────────────────────────────
        .addSubcommandGroup(g => g.setName('guild').setDescription('Manage guilds')
            .addSubcommand(s => s.setName('list').setDescription('List all servers'))
            .addSubcommand(s => s
                .setName('info')
                .setDescription('Detailed info for a server')
                .addStringOption(o => o.setName('guild_id').setDescription('Guild ID').setRequired(true))
            )
            .addSubcommand(s => s
                .setName('disable')
                .setDescription('Disable bot in a server')
                .addStringOption(o => o.setName('guild_id').setDescription('Guild ID').setRequired(true))
                .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
            )
            .addSubcommand(s => s
                .setName('enable')
                .setDescription('Re-enable bot in a server')
                .addStringOption(o => o.setName('guild_id').setDescription('Guild ID').setRequired(true))
            )
            .addSubcommand(s => s
                .setName('reset')
                .setDescription('Wipe guild config and force re-setup')
                .addStringOption(o => o.setName('guild_id').setDescription('Guild ID').setRequired(true))
            )
            .addSubcommand(s => s
                .setName('set-plan')
                .setDescription('Change a server\'s plan')
                .addStringOption(o => o.setName('guild_id').setDescription('Guild ID').setRequired(true))
                .addStringOption(o => o.setName('plan').setDescription('Plan').setRequired(true)
                    .addChoices(
                        { name: '🆓 Free  — 10 claims, basics only',      value: 'free'    },
                        { name: '⭐ Basic — 50 claims, random payouts',    value: 'basic'   },
                        { name: '💎 Premium — unlimited, all features',   value: 'premium' }
                    )
                )
            )
            .addSubcommand(s => s
                .setName('leave')
                .setDescription('Force bot to leave a server')
                .addStringOption(o => o.setName('guild_id').setDescription('Guild ID').setRequired(true))
            )
        )

        // ── broadcast ──────────────────────────────────────────────────────────
        .addSubcommandGroup(g => g.setName('broadcast').setDescription('Send messages to servers')
            .addSubcommand(s => s
                .setName('vouch')
                .setDescription('Send a message to all vouch channels')
                .addStringOption(o => o.setName('message').setDescription('Message to send').setRequired(true))
            )
        )

        // ── plans ──────────────────────────────────────────────────────────────
        .addSubcommandGroup(g => g.setName('plans').setDescription('Plan management')
            .addSubcommand(s => s.setName('list').setDescription('Show all plans and their features'))
        )

        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client) {
        const config = require('../config.json');

        // Hard owner-only check
        if (interaction.user.id !== config.ownerId) {
            return interaction.reply({ content: '❌ This command is restricted to the bot owner.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const group = interaction.options.getSubcommandGroup();
        const sub   = interaction.options.getSubcommand();

        // ══════════════════════════════════════════════════════════════════════
        // STATS
        // ══════════════════════════════════════════════════════════════════════

        if (group === 'stats' && sub === 'network') {
            const net = BotUtils.getNetworkStats(client);

            const topGuild = Object.values(net.byGuild).sort((a, b) => b.claims - a.claims)[0];
            const topLine  = topGuild ? `${topGuild.name} (${topGuild.claims} claims)` : 'N/A';

            const guildBreakdown = Object.values(net.byGuild)
                .sort((a, b) => b.claims - a.claims)
                .slice(0, 8)
                .map(g => `**${g.name}** — ${g.claims} claims | ${g.shortxlinks} links | ${g.members} members | ${g.plan}`)
                .join('\n') || 'No active guilds yet.';

            const embed = new EmbedBuilder()
                .setColor('#6868FF')
                .setTitle('📊 Wumplus Network Stats')
                .addFields(
                    { name: '🏠 Servers',       value: `Total: **${net.totalGuilds}**\nActive: **${net.activeGuilds}**`,                                     inline: true  },
                    { name: '👥 Members',        value: `Across all servers: **${net.totalMembers.toLocaleString()}**`,                                      inline: true  },
                    { name: '🎫 Claims',         value: `Total: **${net.totalClaims}**\nCompleted: **${net.completedClaims}**`,                              inline: true  },
                    { name: '🔗 ShortXLinks',    value: `Completions: **${net.shortxlinksCompletions}**\nEst. Revenue: **$${net.estimatedRevenue}**`,        inline: true  },
                    { name: '🔐 Vaultcord',      value: `Total auths: **${net.vaultcordAuths}**`,                                                            inline: true  },
                    { name: '📈 Top Server',     value: topLine,                                                                                             inline: true  },
                    { name: '🏠 Server Breakdown (top 8)', value: guildBreakdown,                                                                            inline: false }
                )
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        if (group === 'stats' && sub === 'guild') {
            const guildId = interaction.options.getString('guild_id');
            const guild   = client.guilds.cache.get(guildId);
            const stats   = BotUtils.getStats(guildId);
            const cfg     = BotUtils.loadGuildJSON(guildId, 'config.json');
            const claims  = BotUtils.loadGuildJSON(guildId, 'claims.json');
            const active  = Object.values(claims).filter(c => c.status !== 'completed').length;
            const plan    = BotUtils.getPlan(guildId);

            const verifiedPct = guild
                ? ((Object.keys(BotUtils.loadGuildJSON(guildId, 'invites.json')).length / guild.memberCount) * 100).toFixed(1)
                : '?';

            const embed = new EmbedBuilder()
                .setColor('#6868FF')
                .setTitle(`📊 ${guild?.name || guildId}`)
                .addFields(
                    { name: '👥 Members',        value: `${guild?.memberCount || '?'}`,                                                    inline: true },
                    { name: '📋 Plan',           value: `**${plan.label}**`,                                                               inline: true },
                    { name: '✅ Setup',           value: cfg.setupComplete ? '✅ Complete' : '❌ Incomplete',                               inline: true },
                    { name: '🎫 Claims',          value: `Total: ${stats.totalClaims || 0}\nCompleted: ${stats.completedClaims || 0}\nActive: ${active}`, inline: true },
                    { name: '🔗 ShortXLinks',    value: `${stats.shortxlinksCompletions || 0} completions\n~$${((stats.shortxlinksCompletions || 0) * 0.0014).toFixed(3)}`, inline: true },
                    { name: '🔐 Vaultcord',      value: `${stats.vaultcordAuths || 0} auths`,                                             inline: true },
                    { name: '📅 Added',          value: cfg.addedAt ? `<t:${Math.floor(cfg.addedAt / 1000)}:R>` : 'Unknown',              inline: true },
                    { name: '⏱️ Last Activity',  value: stats.lastActivity ? `<t:${Math.floor(stats.lastActivity / 1000)}:R>` : 'Never',  inline: true },
                    { name: '🏠 Status',         value: cfg.active ? '🟢 Active' : '🔴 Disabled',                                        inline: true }
                )
                .setThumbnail(guild?.iconURL({ dynamic: true }));

            return interaction.editReply({ embeds: [embed] });
        }

        // ══════════════════════════════════════════════════════════════════════
        // GUILD MANAGEMENT
        // ══════════════════════════════════════════════════════════════════════

        if (group === 'guild' && sub === 'list') {
            const rows = [];
            for (const [gId, guild] of client.guilds.cache) {
                const cfg   = BotUtils.loadGuildJSON(gId, 'config.json');
                const stats = BotUtils.getStats(gId);
                const plan  = cfg.plan || 'free';
                const setup = cfg.setupComplete ? '✅' : '❌';
                const active = cfg.active !== false ? '🟢' : '🔴';
                rows.push(`${active} ${setup} **${guild.name}** | ${guild.memberCount} members | ${plan} | ${stats.totalClaims || 0} claims`);
            }

            const embed = new EmbedBuilder()
                .setColor('#6868FF')
                .setTitle(`🏠 All Servers (${client.guilds.cache.size})`)
                .setDescription(rows.join('\n') || 'No servers.')
                .setFooter({ text: '🟢 Active  🔴 Disabled  ✅ Setup done  ❌ Setup incomplete' });

            return interaction.editReply({ embeds: [embed] });
        }

        if (group === 'guild' && sub === 'info') {
            // Reuse the stats/guild logic above for detailed info
            const guildId = interaction.options.getString('guild_id');
            const guild   = client.guilds.cache.get(guildId);
            const cfg     = BotUtils.loadGuildJSON(guildId, 'config.json');

            if (!cfg.guildId) return interaction.editReply(`❌ No data found for guild \`${guildId}\`.`);

            const channelLines = Object.entries(cfg.channels || {})
                .filter(([, v]) => v)
                .map(([k, v]) => `\`${k}\`: <#${v}>`)
                .join('\n') || 'Not configured';

            const roleLines = Object.entries(cfg.roles || {})
                .filter(([, v]) => v)
                .map(([k, v]) => `\`${k}\`: <@&${v}>`)
                .join('\n') || 'Not configured';

            const embed = new EmbedBuilder()
                .setColor('#6868FF')
                .setTitle(`⚙️ ${guild?.name || guildId} — Config`)
                .addFields(
                    { name: '📺 Channels', value: channelLines, inline: true },
                    { name: '🎭 Roles',   value: roleLines,    inline: true },
                    { name: '📅 Event',   value: `Ends: <t:${cfg.event?.endTimestamp}:D>\nActive: ${cfg.event?.active ? 'Yes' : 'No'}`, inline: false },
                    { name: '📋 Plan',    value: `**${cfg.plan || 'free'}**`, inline: true },
                    { name: '✅ Setup',    value: cfg.setupComplete ? '✅ Complete' : '❌ Incomplete', inline: true }
                );

            return interaction.editReply({ embeds: [embed] });
        }

        if (group === 'guild' && sub === 'disable') {
            const guildId = interaction.options.getString('guild_id');
            const reason  = interaction.options.getString('reason') || 'Disabled by owner';
            const cfg     = BotUtils.loadGuildJSON(guildId, 'config.json');
            cfg.active    = false;
            cfg.disabledReason = reason;
            BotUtils.saveGuildJSON(guildId, 'config.json', cfg);
            BotUtils.invalidateConfigCache(guildId);
            const guild = client.guilds.cache.get(guildId);
            return interaction.editReply(`✅ Bot disabled for **${guild?.name || guildId}**.\nReason: ${reason}`);
        }

        if (group === 'guild' && sub === 'enable') {
            const guildId = interaction.options.getString('guild_id');
            const cfg     = BotUtils.loadGuildJSON(guildId, 'config.json');
            cfg.active    = true;
            delete cfg.disabledReason;
            BotUtils.saveGuildJSON(guildId, 'config.json', cfg);
            BotUtils.invalidateConfigCache(guildId);
            const guild = client.guilds.cache.get(guildId);
            return interaction.editReply(`✅ Bot re-enabled for **${guild?.name || guildId}**.`);
        }

        if (group === 'guild' && sub === 'reset') {
            const guildId = interaction.options.getString('guild_id');
            const guild   = client.guilds.cache.get(guildId);
            const template = require('../guilds/template.json');
            const fresh    = { ...template, guildId, guildName: guild?.name || guildId, addedAt: Date.now(), plan: BotUtils.loadGuildJSON(guildId, 'config.json').plan || 'free' };
            BotUtils.saveGuildJSON(guildId, 'config.json', fresh);
            BotUtils.invalidateConfigCache(guildId);
            return interaction.editReply(`✅ Config reset for **${guild?.name || guildId}**. They'll need to run \`/setup-server\` again.`);
        }

        if (group === 'guild' && sub === 'set-plan') {
            const guildId = interaction.options.getString('guild_id');
            const planId  = interaction.options.getString('plan');
            const ok      = BotUtils.setPlan(guildId, planId);
            const guild   = client.guilds.cache.get(guildId);
            if (!ok) return interaction.editReply('❌ Invalid plan.');
            return interaction.editReply(`✅ Plan for **${guild?.name || guildId}** set to **${PLANS[planId].label}**.`);
        }

        if (group === 'guild' && sub === 'leave') {
            const guildId = interaction.options.getString('guild_id');
            const guild   = client.guilds.cache.get(guildId);
            if (!guild) return interaction.editReply('❌ Guild not found.');
            await guild.leave();
            return interaction.editReply(`✅ Left **${guild.name}**.`);
        }

        // ══════════════════════════════════════════════════════════════════════
        // BROADCAST
        // ══════════════════════════════════════════════════════════════════════

        if (group === 'broadcast' && sub === 'vouch') {
            const message = interaction.options.getString('message');
            let sent = 0, failed = 0;

            for (const [gId, guild] of client.guilds.cache) {
                const cfg = BotUtils.loadGuildJSON(gId, 'config.json');
                if (!cfg.setupComplete || !cfg.channels?.vouchPayments) continue;
                try {
                    const ch = await client.channels.fetch(cfg.channels.vouchPayments);
                    await ch.send(message);
                    sent++;
                } catch { failed++; }
            }

            return interaction.editReply(`📢 Broadcast complete!\n✅ Sent to **${sent}** servers\n❌ Failed: **${failed}**`);
        }

        // ══════════════════════════════════════════════════════════════════════
        // PLANS
        // ══════════════════════════════════════════════════════════════════════

        if (group === 'plans' && sub === 'list') {
            const lines = Object.entries(PLANS).map(([id, plan]) =>
                `**${plan.label}** (\`${id}\`)\n` +
                `• Max active claims: ${plan.maxActiveClaims === -1 ? 'Unlimited' : plan.maxActiveClaims}\n` +
                `• Random payouts: ${plan.randomPayouts ? '✅' : '❌'}\n` +
                `• Boost prizes: ${plan.boostPrizes ? '✅' : '❌'}\n` +
                `• Custom text: ${plan.customText ? '✅' : '❌'}\n` +
                `• DM campaign: ${plan.dmCampaign ? '✅' : '❌'}`
            ).join('\n\n');

            const embed = new EmbedBuilder()
                .setColor('#6868FF')
                .setTitle('📋 Wumplus Plans')
                .setDescription(lines)
                .setFooter({ text: 'Change with /owner guild set-plan [guild_id] [plan]' });

            return interaction.editReply({ embeds: [embed] });
        }
    }
};
