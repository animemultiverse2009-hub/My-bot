const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const BotUtils = require('./utils');
const RandomPayoutSystem = require('./handlers/randomPayouts');

// ─── Suppress ephemeral deprecation warning ────────────────────────────────
// Some command files still use { ephemeral: true } instead of MessageFlags.Ephemeral.
// This silences the noise until each file is updated. Does not affect functionality.
const originalEmit = process.emit;
process.emit = function(event, ...args) {
    if (event === 'warning' && args[0]?.message?.includes('ephemeral')) return false;
    return originalEmit.apply(process, [event, ...args]);
};
// ──────────────────────────────────────────────────────────────────────────

const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

client.commands = new Collection();
client.invites = new Map();
client.utils = BotUtils;
global.client = client;

client.randomPayouts = new RandomPayoutSystem(client);

// Load commands
const commandFiles = fs.readdirSync('./commands').filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
    try {
        const command = require(`./commands/${file}`);
        client.commands.set(command.data.name, command);
        console.log(`✅ Loaded command: ${command.data.name}`);
    } catch (error) {
        console.error(`❌ Failed to load command ${file}:`, error.message);
    }
}

// Load events
const eventFiles = fs.readdirSync('./events').filter(f => f.endsWith('.js'));
for (const file of eventFiles) {
    try {
        const event = require(`./events/${file}`);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
        console.log(`✅ Loaded event: ${event.name}`);
    } catch (error) {
        console.error(`❌ Failed to load event ${file}:`, error.message);
    }
}

process.on('unhandledRejection', error => {
    console.error('❌ Unhandled rejection:', error?.message || error);
});
process.on('uncaughtException', error => {
    console.error('❌ Uncaught exception:', error?.message || error);
});
client.on('error', error => {
    console.error('❌ Client error:', error?.message || error);
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    if (client.randomPayouts) client.randomPayouts.stop();
    try {
        BotUtils.saveJSON('invites.json', BotUtils.loadJSON('invites.json'));
        BotUtils.saveJSON('claims.json', BotUtils.loadJSON('claims.json'));
        console.log('✅ Data saved');
    } catch (e) {
        console.error('❌ Save failed:', e.message);
    }
    client.destroy();
    process.exit(0);
});

console.log('🚀 Starting bot...\n');
client.login(config.token).catch(error => {
    console.error('❌ Login failed:', error.message);
    process.exit(1);
});
