const { MessageFlags } = require('discord.js');
const config = require('../config.json');

module.exports = {
    async execute(interaction, client) {
        const threadId = interaction.channel.id;
        const claims = client.utils.loadJSON('claims.json');
        const claim = claims[threadId];
        
        if (claim) {
            claim.verified = true;
            claims[threadId] = claim;
            client.utils.saveJSON('claims.json', claims);
        }
        
        await interaction.reply({
            content: '✅ Verification successful! Click "Next Step" to continue.',
            flags: MessageFlags.Ephemeral
        });
    }
};