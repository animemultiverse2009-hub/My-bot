const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const BotUtils            = require('./utils');
const RandomPayoutSystem  = require('./handlers/randomPayouts');
const SmartDMCampaign     = require('./handlers/smartDMCampaign');

// ── Create client with all required intents ───────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences   // needed for smart DM scoring
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

const config = require('./config.json');

// ── Collections ───────────────────────────────────────────────────────────────
client.commands  = new Collection();
client.invites   = new Map();         // invite snapshot cache per guild
client.utils     = BotUtils;
global.client    = client;            // utils needs global access

// ── Systems ───────────────────────────────────────────────────────────────────
client.randomPayouts = new RandomPayoutSystem(client);
client.dmCampaign    = new SmartDMCampaign(client);

// ── Load commands ─────────────────────────────────────────────────────────────
const cmdFiles = fs.readdirSync('./commands').filter(f => f.endsWith('.js'));
for (const file of cmdFiles) {
    try {
        const cmd = require(`./commands/${file}`);
        client.commands.set(cmd.data.name, cmd);
        console.log(`✅ Command: ${cmd.data.name}`);
    } catch (e) {
        console.error(`❌ Failed to load command ${file}:`, e.message);
    }
}

// ── Load events ───────────────────────────────────────────────────────────────
const evtFiles = fs.readdirSync('./events').filter(f => f.endsWith('.js'));
for (const file of evtFiles) {
    try {
        const event = require(`./events/${file}`);
        const handler = (...args) => event.execute(...args, client);
        event.once ? client.once(event.name, handler) : client.on(event.name, handler);
        console.log(`✅ Event: ${event.name}`);
    } catch (e) {
        console.error(`❌ Failed to load event ${file}:`, e.message);
    }
}

// ── Process error handlers ────────────────────────────────────────────────────
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection:', error.message);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error.message);
});

// Suppress ephemeral deprecation warning (cosmetic only)
const _emit = process.emit.bind(process);
process.emit = function(event, ...args) {
    if (event === 'warning' && args[0]?.message?.includes('ephemeral')) return false;
    return _emit(event, ...args);
};

// ── Login ─────────────────────────────────────────────────────────────────────
client.login(config.token).catch(e => {
    console.error('❌ Login failed:', e.message);
    process.exit(1);
});
