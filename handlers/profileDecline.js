const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = {
    async execute(interaction, client) {
        const channelId = interaction.channel.id;
        const claims = client.utils.loadJSON('claims.json');
        const claim = claims[channelId];

        // Refund invites
        if (claim?.originalInvites) {
            const inviteData = client.utils.getUserInvites(claim.userId);
            inviteData.total = claim.originalInvites.total;
            inviteData.bonus = claim.originalInvites.bonus;
            client.utils.setUserInvites(claim.userId, inviteData);
            console.log(`✅ Refunded invites to user ${claim.userId}`);
        }

        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle(`Cancelled ${config.emojis.cross}`)
            .setDescription(
                `${config.emojis.rarrow} Your reward claim has been **cancelled.**\n\n` +
                `✅ Your invites have been **refunded**.\n` +
                `🗑️ This channel will be deleted in **5 seconds**.`
            )
            .setThumbnail(config.images.cancelledIcon);

        await interaction.update({ embeds: [embed], components: [] });

        // Clean up claim data
        delete claims[channelId];
        client.utils.saveJSON('claims.json', claims);

        // Delete the claim channel
        setTimeout(async () => {
            await interaction.channel.delete('Claim cancelled by user').catch(err => {
                console.error('Error deleting claim channel:', err.message);
            });
        }, 5000);
    }
};
