const { REST, Routes, ActivityType } = require('discord.js');
const fs       = require('fs');
const path     = require('path');
const config   = require('../config.json');
const BotUtils = require('../utils');
const cache    = require('../dataCache');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        console.log(`✅ Bot ready! Logged in as ${client.user.tag}`);
        console.log(`📊 Connected to ${client.guilds.cache.size} guilds`);

        // ── Ensure guilds folder ──────────────────────────────────────────────
        const guildsDir = path.join(__dirname, '../guilds');
        if (!fs.existsSync(guildsDir)) fs.mkdirSync(guildsDir, { recursive: true });

        // ── Init any guild without a folder ───────────────────────────────────
        for (const guild of client.guilds.cache.values()) {
            BotUtils.initGuild(guild.id, guild.name, guild.ownerId);
        }

        // ── 🔥 WARM THE CACHE — load all guild data into RAM NOW ─────────────
        // After this point every data read is pure RAM, ~0.01ms
        const guildIds = [...client.guilds.cache.keys()];
        cache.warmup(guildIds);

        // ── Build Discord invite snapshot cache ───────────────────────────────
        console.log('\n📊 Building invite cache...');
        for (const guild of client.guilds.cache.values()) {
            try { await BotUtils.rebuildInviteCache(guild); }
            catch (e) { console.error(`   ❌ ${guild.name}: ${e.message}`); }
        }
        console.log('✅ Invite cache ready\n');

        // ── Cleanup expired claims ────────────────────────────────────────────
        let cleaned = 0;
        for (const guild of client.guilds.cache.values()) cleaned += BotUtils.cleanupExpiredClaims(guild.id);
        if (cleaned > 0) console.log(`🧹 Cleaned ${cleaned} expired claims`);

        // ── Register global slash commands ────────────────────────────────────
        const commands = [];
        const cmdFiles = fs.readdirSync(path.join(__dirname, '../commands')).filter(f => f.endsWith('.js'));
        for (const file of cmdFiles) {
            try { commands.push(require(`../commands/${file}`).data.toJSON()); } catch (_) {}
        }

        const rest = new REST({ version: '10' }).setToken(config.token);
        try {
            console.log('🔄 Registering global commands...');
            await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
            console.log('✅ Global commands registered\n');
        } catch (e) {
            console.error('❌ Global commands failed:', e.message);
            try {
                await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
                console.log('✅ Fallback: guild commands registered\n');
            } catch (_) {}
        }

        // ── Periodic tasks ────────────────────────────────────────────────────
        // Cleanup every 30 min
        setInterval(() => {
            for (const guild of client.guilds.cache.values()) BotUtils.cleanupExpiredClaims(guild.id);
        }, 30 * 60 * 1000);

        // Status every 10 min
        const tick = () => client.user.setActivity(`${client.guilds.cache.size} servers | /setup-server`, { type: ActivityType.Watching });
        tick();
        setInterval(tick, 10 * 60 * 1000);

        // ── Shutdown: flush all dirty cache to disk ───────────────────────────
        const shutdown = (sig) => {
            console.log(`\n${sig} — flushing cache to disk...`);
            cache.flushAll();
            process.exit(0);
        };
        process.once('SIGINT',  () => shutdown('SIGINT'));
        process.once('SIGTERM', () => shutdown('SIGTERM'));

        // ── Summary ───────────────────────────────────────────────────────────
        const totalMembers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
        const setupDone    = guildIds.filter(id => cache.get(id, 'config').setupComplete).length;

        console.log('\n┌────────────────────────────────────────────┐');
        console.log('🎉 WUMPLUS FULLY OPERATIONAL');
        console.log('├────────────────────────────────────────────┤');
        console.log(`🏠 Guilds:         ${client.guilds.cache.size} (${setupDone} fully set up)`);
        console.log(`👥 Total Members:  ${totalMembers.toLocaleString()}`);
        console.log(`🌐 Commands:       Global`);
        console.log(`🔥 Data Cache:     ${guildIds.length * 4} files in RAM`);
        console.log(`🧹 Auto-cleanup:   Every 30 min`);
        console.log('└────────────────────────────────────────────┘\n');
    }
};
