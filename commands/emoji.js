const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const config = require('../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('emoji')
        .setDescription('Manage bot emojis')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('Set an emoji')
                .addStringOption(opt => opt.setName('name')
                    .setDescription('Emoji name (e.g., guide, clock)')
                    .setRequired(true))
                .addStringOption(opt => opt.setName('emoji')
                    .setDescription('Emoji (e.g., <:Guide:123456789>)')
                    .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all configured emojis'))
        .addSubcommand(sub =>
            sub.setName('reset')
                .setDescription('Reset emoji to default')
                .addStringOption(opt => opt.setName('name')
                    .setDescription('Emoji name to reset')
                    .setRequired(true))),
    
    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'set') {
            const name = interaction.options.getString('name');
            const emoji = interaction.options.getString('emoji');
            
            config.emojis[name] = emoji;
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Emoji Updated')
                .setDescription(`Set **${name}** to ${emoji}`)
                .addFields({ name: 'Usage', value: `Use {${name}} in messages` });
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (subcommand === 'list') {
            const emojiList = Object.entries(config.emojis)
                .map(([key, value]) => `**{${key}}** → ${value}`)
                .join('\n');
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.info)
                .setTitle('🎨 Configured Emojis')
                .setDescription(emojiList || 'No emojis configured')
                .setFooter({ text: 'Use /emoji set to add or update emojis' });
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (subcommand === 'reset') {
            const name = interaction.options.getString('name');
            
            if (!config.emojis[name]) {
                return interaction.reply({ content: '❌ Emoji not found!', ephemeral: true });
            }
            
            delete config.emojis[name];
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Emoji Reset')
                .setDescription(`Removed emoji: **${name}**`);
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};