const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');

module.exports = {
    async start(interaction, client, claim) {
        const steps = config.settings.codeGenerationSteps;
        const delay = config.settings.codeGenerationDelay;
        
        // Get reward name safely
        const rewardName = claim.reward?.name || 'your reward';
        const rewardEmoji = claim.reward?.emoji || '🎁';
        
        // Initial message
        let description = `# ⌛ Generating Code...\n\n` +
            `> Your **${rewardName}** code is being generated! 0% ${rewardEmoji}`;
        
        let embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setDescription(description);
        
        const message = await interaction.update({ embeds: [embed], components: [] });
        
        // Simulate progress
        for (const percent of steps) {
            await new Promise(resolve => setTimeout(resolve, delay));
            
            if (percent === 100) {
                description = `# GENERATED!\n\n` +
                    `> Your **${rewardName}** code is ready! 100% ${rewardEmoji}`;
                
                embed = new EmbedBuilder()
                    .setColor(config.colors.success)
                    .setDescription(description);
                
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`claim_reward_${claim.rewardId}`)
                            .setLabel('Claim Reward')
                            .setStyle(ButtonStyle.Success)
                    );
                
                await message.edit({ embeds: [embed], components: [row] });
                
                // Update claim status
                const threadId = interaction.channel.id;
                const claims = client.utils.loadJSON('claims.json');
                claims[threadId].codeGenerated = true;
                claims[threadId].status = 'ready_to_claim';
                client.utils.saveJSON('claims.json', claims);
            } else {
                description = `# ⌛ Generating Code...\n\n` +
                    `> Your **${rewardName}** code is being generated! ${percent}% ${rewardEmoji}`;
                
                embed.setDescription(description);
                await message.edit({ embeds: [embed] });
            }
        }
    }
};