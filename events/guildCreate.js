const { EmbedBuilder } = require('discord.js');
const BotUtils = require('../utils');

module.exports = {
    name: 'guildCreate',
    async execute(guild, client) {
        console.log(`\n🏠 BOT ADDED TO: ${guild.name} (${guild.id})`);
        console.log(`   Owner: ${guild.ownerId} | Members: ${guild.memberCount}`);

        // 1. Initialize guild data folder
        BotUtils.initGuild(guild.id, guild.name, guild.ownerId);

        // 2. Rebuild invite cache for this guild
        try {
            await BotUtils.rebuildInviteCache(guild);
        } catch (_) {}

        // 3. DM the guild owner with setup instructions
        try {
            const owner = await client.users.fetch(guild.ownerId);
            await owner.send({
                embeds: [new EmbedBuilder()
                    .setColor('#6868FF')
                    .setTitle('👋 Thanks for adding Wumplus!')
                    .setDescription(
                        `Your server **${guild.name}** has been registered.\n\n` +
                        `To get started, go to your server and run:\n` +
                        `> \`/setup-server\`\n\n` +
                        `This wizard will walk you through setting up channels, roles, and your event settings.\n\n` +
                        `Need help? Contact the bot owner.`
                    )
                    .setFooter({ text: 'Wumplus Invite Rewards' })
                ]
            });
            console.log(`   ✅ DM sent to guild owner ${owner.username}`);
        } catch (e) {
            console.log(`   ⚠️ Could not DM guild owner: ${e.message}`);
        }

        // 4. Notify YOU (the bot owner) in your private channel or DM
        const config = require('../config.json');
        try {
            const you = await client.users.fetch(config.ownerId);

            // Try to get an invite to the guild
            let inviteLink = 'No invite available';
            try {
                const invites = await guild.invites.fetch();
                const inv = invites.first();
                if (inv) inviteLink = `https://discord.gg/${inv.code}`;
            } catch (_) {}

            await you.send({
                embeds: [new EmbedBuilder()
                    .setColor('#00ff88')
                    .setTitle('🎉 Bot Added to New Server!')
                    .addFields(
                        { name: '🏠 Server',   value: `${guild.name} (${guild.id})`,              inline: false },
                        { name: '👑 Owner',    value: `<@${guild.ownerId}> (${guild.ownerId})`,   inline: true  },
                        { name: '👥 Members',  value: `${guild.memberCount}`,                     inline: true  },
                        { name: '📅 Created',  value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                        { name: '🔗 Invite',   value: inviteLink,                                 inline: false }
                    )
                    .setThumbnail(guild.iconURL({ dynamic: true }))
                    .setFooter({ text: `Total servers: ${client.guilds.cache.size}` })
                    .setTimestamp()
                ]
            });
        } catch (e) {
            console.log(`   ⚠️ Could not DM bot owner: ${e.message}`);
        }
    }
};
