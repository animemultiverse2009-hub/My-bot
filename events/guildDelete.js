const { EmbedBuilder } = require('discord.js');
const BotUtils = require('../utils');
const path = require('path');
const fs   = require('fs');

module.exports = {
    name: 'guildDelete',
    async execute(guild, client) {
        console.log(`\n👋 BOT REMOVED FROM: ${guild.name} (${guild.id})`);

        // Mark guild as inactive (keep data for 30 days — don't delete)
        try {
            const cfg = BotUtils.loadGuildJSON(guild.id, 'config.json');
            cfg.active      = false;
            cfg.removedAt   = Date.now();
            BotUtils.saveGuildJSON(guild.id, 'config.json', cfg);
            BotUtils.invalidateConfigCache(guild.id);

            console.log(`   💾 Guild data preserved (marked inactive)`);
        } catch (e) {
            console.error(`   ❌ Failed to update guild config: ${e.message}`);
        }

        // Notify you
        const config = require('../config.json');
        try {
            const you   = await client.users.fetch(config.ownerId);
            const stats = BotUtils.getStats(guild.id);

            await you.send({
                embeds: [new EmbedBuilder()
                    .setColor('#ff4444')
                    .setTitle('😢 Bot Removed from Server')
                    .addFields(
                        { name: '🏠 Server',    value: `${guild.name} (${guild.id})`,  inline: false },
                        { name: '👥 Members',   value: `${guild.memberCount}`,         inline: true  },
                        { name: '🎫 Claims',    value: `${stats.totalClaims || 0}`,    inline: true  },
                        { name: '🔗 ShortXLinks', value: `${stats.shortxlinksCompletions || 0}`, inline: true },
                        { name: '📋 Data',      value: 'Preserved for 30 days',        inline: false }
                    )
                    .setFooter({ text: `Total servers: ${client.guilds.cache.size}` })
                    .setTimestamp()
                ]
            });
        } catch (e) {
            console.log(`   ⚠️ Could not DM bot owner: ${e.message}`);
        }
    }
};
