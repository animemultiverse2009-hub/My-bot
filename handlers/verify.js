const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

// Verify button handler
module.exports = {
    async execute(interaction, client) {
        await interaction.reply({
            content: `🔗 Click here to verify: ${config.messages.verificationURL}`,
            ephemeral: true
        });
    }
};

// Create Invite handler
module.exports.createInvite = {
    async execute(interaction, client) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.info)
            .setTitle('📱 Pick Your Platform')
            .setDescription(
                '**I\'m on Mobile**\n' +
                '• To invite friends, click the 📱 button under the server banner or hold down on any channel.\n' +
                '• A menu will appear prompting you to invite your friends. To invite friends, click the "invite" button next to their profile.\n' +
                '• You can also copy the invite to share to other servers.\n\n' +
                '**I\'m on Desktop**\n' +
                '• To invite friends, right-click the server icon and select "Invite People".\n' +
                '• A menu will appear with your friend list. Click "invite" next to anyone you want to invite.\n' +
                '• You can also copy the link to share elsewhere.\n\n' +
                '💡 **Note:** If you invite everyone on your friend list, this way, you\'ll have extra invites incase someone leaves.'
            );
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};

// Free Rewards handler (redirects to invite rewards)
module.exports.freeRewards = {
    async execute(interaction, client) {
        await interaction.reply({
            content: `Check out the rewards here: <#${config.channels.inviteReward}>`,
            ephemeral: true
        });
    }
};

// Verification link handler
module.exports.verificationLink = {
    async execute(interaction, client) {
        await interaction.reply({
            content: `🔗 Verify here: ${config.messages.verificationURL}`,
            ephemeral: true
        });
    }
};

// Verify Human handler (marks as verified)
module.exports.verifyHuman = {
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
            ephemeral: true
        });
    }
};