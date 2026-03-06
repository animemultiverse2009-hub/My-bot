const { REST, Routes, ActivityType } = require('discord.js');
const fs = require('fs');
const config = require('../config.json');
const BotUtils = require('../utils');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);

        client.user.setActivity('Invite Rewards', { type: ActivityType.Watching });

        // Build invite cache snapshot
        console.log('\n📊 Building invite cache snapshots...');
        for (const guild of client.guilds.cache.values()) {
            try {
                await client.utils.rebuildInviteCache(guild);
                console.log(`   ✅ Cached invites for ${guild.name}`);
            } catch (error) {
                console.error(`   ❌ Failed for ${guild.name}:`, error.message);
            }
        }
        console.log('✅ Invite cache initialization complete!\n');

        // Clean up expired claims on startup
        console.log('🧹 Cleaning up expired claims...');
        const cleaned = BotUtils.cleanupExpiredClaims();
        console.log(cleaned > 0 ? `✅ Cleaned up ${cleaned} expired claims\n` : '✅ No expired claims to clean\n');

        // Register slash commands
        const commands = [];
        const commandFiles = fs.readdirSync('./commands').filter(f => f.endsWith('.js'));
        for (const file of commandFiles) {
            try {
                const command = require(`../commands/${file}`);
                commands.push(command.data.toJSON());
            } catch (err) {
                console.error(`❌ Failed to load command for registration: ${file}`, err.message);
            }
        }

        const rest = new REST({ version: '10' }).setToken(config.token);

        try {
            console.log('🔄 Refreshing application (/) commands...');

            // Guild commands = instant update (best for single-server / development)
            // To go multi-server, change to Routes.applicationCommands(config.clientId)
            // NOTE: global commands take up to 1 hour to appear across all servers
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: commands }
            );

            console.log('✅ Slash commands registered for guild.\n');
        } catch (error) {
            console.error('❌ Error registering guild commands:', error.message);
            console.log('💡 Re-invite the bot with this URL:');
            console.log(`   https://discord.com/api/oauth2/authorize?client_id=${config.clientId}&permissions=8&scope=bot%20applications.commands\n`);
        }

        // Ensure data directory and files exist
        if (!fs.existsSync('./data')) fs.mkdirSync('./data');
        for (const file of ['invites.json', 'claims.json', 'events.json', 'untracked.json']) {
            const fp = `./data/${file}`;
            if (!fs.existsSync(fp)) fs.writeFileSync(fp, '{}');
        }

        // Start random payout system (30s delay after startup)
        if (config.randomPayouts?.enabled) {
            setTimeout(() => {
                client.randomPayouts.start();
            }, 30000);
        } else {
            console.log('⚠️ Random Payout System is DISABLED in config.json');
        }

        // Auto-cleanup every 30 minutes
        setInterval(() => {
            const c = BotUtils.cleanupExpiredClaims();
            if (c > 0) console.log(`🧹 Periodic cleanup: removed ${c} expired claims`);
        }, 30 * 60 * 1000);

        // Auto-backup every 60 minutes
        setInterval(() => {
            try {
                BotUtils.saveJSON('invites.json', BotUtils.loadJSON('invites.json'));
                BotUtils.saveJSON('claims.json', BotUtils.loadJSON('claims.json'));
                console.log('💾 Auto-backup complete');
            } catch (error) {
                console.error('❌ Backup failed:', error.message);
            }
        }, 60 * 60 * 1000);

        console.log('┌────────────────────────────────────────────┐');
        console.log('🎉 ALL SYSTEMS OPERATIONAL');
        console.log('├────────────────────────────────────────────┤');
        console.log(`📊 Guilds: ${client.guilds.cache.size}`);
        console.log(`👥 Users: ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}`);
        console.log(`🎫 Invites Cached: ${Array.from(client.invites.values()).reduce((a, m) => a + m.size, 0)}`);
        console.log(`🧹 Auto-cleanup: Every 30 minutes`);
        console.log(`💾 Auto-backup: Every 60 minutes`);
        console.log('└────────────────────────────────────────────┘\n');
    }
};
