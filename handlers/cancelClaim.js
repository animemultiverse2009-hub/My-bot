const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = {
    async execute(interaction, client) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            // FIX: was config.emojis.x (doesn't exist) - now uses config.emojis.cross
            .setTitle(`Cancelled ${config.emojis.cross}`)
            .setDescription(
                `${config.emojis.rarrow} Your reward claim has been **cancelled.**\n\n` +
                `You can try again anytime by clicking **Claim Rewards**.`
            )
            .setThumbnail(config.images.cancelledIcon);

        await interaction.update({ embeds: [embed], components: [] });
    }
};
