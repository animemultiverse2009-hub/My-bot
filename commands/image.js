const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const config = require('../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('image')
        .setDescription('Manage bot images')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('Set an image URL')
                .addStringOption(opt => opt.setName('name')
                    .setDescription('Image name')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Check Invites Banner', value: 'checkInvitesBanner' },
                        { name: 'Select Rewards Banner', value: 'selectRewardsBanner' },
                        { name: 'Mobile Tutorial', value: 'mobileTutorial' },
                        { name: 'Desktop Tutorial', value: 'desktopTutorial' }
                    ))
                .addStringOption(opt => opt.setName('url')
                    .setDescription('Image URL')
                    .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all configured images'))
        .addSubcommand(sub =>
            sub.setName('preview')
                .setDescription('Preview an image')
                .addStringOption(opt => opt.setName('name')
                    .setDescription('Image name')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Check Invites Banner', value: 'checkInvitesBanner' },
                        { name: 'Select Rewards Banner', value: 'selectRewardsBanner' },
                        { name: 'Mobile Tutorial', value: 'mobileTutorial' },
                        { name: 'Desktop Tutorial', value: 'desktopTutorial' }
                    ))),
    
    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'set') {
            const name = interaction.options.getString('name');
            const url = interaction.options.getString('url');
            
            // Basic URL validation
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                return interaction.reply({ content: '❌ Invalid URL! Must start with http:// or https://', ephemeral: true });
            }
            
            config.images[name] = url;
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Image Updated')
                .setDescription(`Set **${name}** to:\n${url}`)
                .setImage(url);
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (subcommand === 'list') {
            const imageList = Object.entries(config.images)
                .map(([key, value]) => `**${key}**\n${value}`)
                .join('\n\n');
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.info)
                .setTitle('🖼️ Configured Images')
                .setDescription(imageList || 'No images configured')
                .setFooter({ text: 'Use /image set to add or update images' });
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (subcommand === 'preview') {
            const name = interaction.options.getString('name');
            const url = config.images[name];
            
            if (!url) {
                return interaction.reply({ content: '❌ Image not found!', ephemeral: true });
            }
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.info)
                .setTitle(`🖼️ Preview: ${name}`)
                .setDescription(url)
                .setImage(url);
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};