const { EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('../config.json');

module.exports = {
    async execute(interaction, client) {
        const platform = interaction.values[0];
        
        if (platform === 'mobile') {
            const description = `${config.emojis.step1} **Step One:**\n` +
                `To invite friends, click the ${config.emojis.invite} **Invite** button under the server banner or hold down on any channel.\n\n` +
                `${config.emojis.step2} **Step Two:**\n` +
                `A menu will appear prompting you to invite your friends. To invite friends, click the **"Invite"** button next to their profile.\n` +
                `You can also copy the invite to share to other servers.\n\n` +
                `💡 **Note:**\n` +
                `We suggest you invite everyone on your friend list. This way, you'll have extra invites incase someone leaves.`;
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.primary)
                .setTitle(`Creating An Invite: Mobile ${config.emojis.mobile}`)
                .setDescription(description)
                .setImage(config.images.mobileTutorial);
            
            await interaction.editReply({ 
                embeds: [embed], 
                flags: MessageFlags.Ephemeral 
            });
        } 
        else if (platform === 'desktop') {
            const description = `${config.emojis.step1} **Step One:**\n` +
                `To invite friends, click on the __Server Name__, then Select ${config.emojis.invite} **Invite** People.\n\n` +
                `${config.emojis.step2} **Step Two:**\n` +
                `A menu will appear prompting you to invite your friends. To invite friends, click the **"Invite"** button next to their profile.\n` +
                `You can also copy the invite to share to other servers.\n\n` +
                `💡 **Note:**\n` +
                `We suggest you invite everyone on your friend list. This way, you'll have extra invites incase someone leaves.`;
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.primary)
                .setTitle(`Creating An Invite: Desktop ${config.emojis.desktop}`)
                .setDescription(description)
                .setImage(config.images.desktopTutorial);
            
            await interaction.editReply({ 
                embeds: [embed], 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
};