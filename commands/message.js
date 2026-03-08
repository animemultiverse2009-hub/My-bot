const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const config = require('../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('message')
        .setDescription('Customize bot messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('edit-check-invites')
                .setDescription('Edit check invites message')
                .addStringOption(opt => opt.setName('title').setDescription('Message title').setRequired(false))
                .addStringOption(opt => opt.setName('description').setDescription('Message description').setRequired(false))
                .addStringOption(opt => opt.setName('button-label').setDescription('Button label').setRequired(false)))
        .addSubcommand(sub =>
            sub.setName('edit-not-enough')
                .setDescription('Edit not enough invites message')
                .addStringOption(opt => opt.setName('title').setDescription('Message title').setRequired(false))
                .addStringOption(opt => opt.setName('description').setDescription('Message description (use {required} for invite count)').setRequired(false)))
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View all customizable messages')
                .addStringOption(opt => opt.setName('section')
                    .setDescription('Which section to view')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Check Invites', value: 'checkInvites' },
                        { name: 'How to Invite', value: 'howToInvite' },
                        { name: 'Invite Reward', value: 'inviteReward' },
                        { name: 'Not Enough Invites', value: 'notEnoughInvites' }
                    ))),
    
    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'edit-check-invites') {
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description');
            const buttonLabel = interaction.options.getString('button-label');
            
            if (title) config.messages.checkInvites.title = title;
            if (description) config.messages.checkInvites.description = description;
            if (buttonLabel) config.messages.checkInvites.buttonLabel = buttonLabel;
            
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Check Invites Message Updated')
                .addFields(
                    { name: 'Title', value: config.messages.checkInvites.title, inline: false },
                    { name: 'Description', value: config.messages.checkInvites.description, inline: false },
                    { name: 'Button Label', value: config.messages.checkInvites.buttonLabel, inline: false }
                );
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (subcommand === 'edit-not-enough') {
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description');
            
            if (title) config.messages.notEnoughInvites.title = title;
            if (description) config.messages.notEnoughInvites.description = description;
            
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Not Enough Invites Message Updated')
                .addFields(
                    { name: 'Title', value: config.messages.notEnoughInvites.title, inline: false },
                    { name: 'Description', value: config.messages.notEnoughInvites.description, inline: false }
                )
                .setFooter({ text: 'Use {required} as placeholder for invite count' });
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (subcommand === 'view') {
            const section = interaction.options.getString('section');
            const messages = config.messages[section];
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.info)
                .setTitle(`📝 ${section} Messages`)
                .setDescription('```json\n' + JSON.stringify(messages, null, 2) + '\n```')
                .setFooter({ text: 'Use emoji placeholders like {guide}, {clock}, etc.' });
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};