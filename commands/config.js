const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const config = require('../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Configure bot settings')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('set-channel')
                .setDescription('Set a channel for a specific function')
                .addStringOption(opt => opt.setName('type')
                    .setDescription('Channel type')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Check Invites', value: 'checkInvites' },
                        { name: 'How to Invite', value: 'howToInvite' },
                        { name: 'Invite Reward', value: 'inviteReward' },
                        { name: 'Claim Reward', value: 'claimReward' },
                        { name: 'Vouch/Payments', value: 'vouchPayments' }
                    ))
                .addChannelOption(opt => opt.setName('channel').setDescription('The channel').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('set-role')
                .setDescription('Set a role for bot functions')
                .addStringOption(opt => opt.setName('type')
                    .setDescription('Role type')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Admin Ping', value: 'adminPing' },
                        { name: '3 Invites Role', value: '3invites' },
                        { name: '6 Invites Role', value: '6invites' },
                        { name: '12 Invites Role', value: '12invites' }
                    ))
                .addRoleOption(opt => opt.setName('role').setDescription('The role').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('set-event-date')
                .setDescription('Set the event end date')
                .addStringOption(opt => opt.setName('date').setDescription('Event end date (e.g., December 4, 2026)').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('set-fake-days')
                .setDescription('Set how many days old an account must be to not be fake')
                .addIntegerOption(opt => opt.setName('days').setDescription('Number of days').setRequired(true).setMinValue(1).setMaxValue(30)))
        .addSubcommand(sub =>
            sub.setName('set-skip-invites')
                .setDescription('Set how many invites needed to skip queue')
                .addIntegerOption(opt => opt.setName('amount').setDescription('Number of invites').setRequired(true).setMinValue(1).setMaxValue(10)))
        .addSubcommand(sub =>
            sub.setName('set-verification-url')
                .setDescription('Set the verification OAuth URL')
                .addStringOption(opt => opt.setName('url').setDescription('OAuth URL').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View current configuration'))
        .addSubcommand(sub =>
            sub.setName('set-reward')
                .setDescription('Configure a reward tier')
                .addStringOption(opt => opt.setName('id')
                    .setDescription('Reward ID')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Nitro Basic 1M', value: 'nitro_basic_1m' },
                        { name: 'Nitro Boost 1M', value: 'nitro_boost_1m' },
                        { name: 'Nitro Boost 3M', value: 'nitro_boost_3m' },
                        { name: 'Robux 450', value: 'robux_450' },
                        { name: 'Robux 1500', value: 'robux_1500' },
                        { name: 'Robux 4500', value: 'robux_4500' }
                    ))
                .addIntegerOption(opt => opt.setName('invites').setDescription('Required invites').setRequired(false))
                .addStringOption(opt => opt.setName('name').setDescription('Reward name').setRequired(false))
                .addRoleOption(opt => opt.setName('role').setDescription('Role to ping/assign').setRequired(false))),
    
    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'set-channel') {
            const type = interaction.options.getString('type');
            const channel = interaction.options.getChannel('channel');
            
            config.channels[type] = channel.id;
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Channel Updated')
                .setDescription(`Set **${type}** to ${channel}`);
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (subcommand === 'set-role') {
            const type = interaction.options.getString('type');
            const role = interaction.options.getRole('role');
            
            config.roles[type] = role.id;
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Role Updated')
                .setDescription(`Set **${type}** to ${role}`);
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (subcommand === 'set-event-date') {
            const date = interaction.options.getString('date');
            
            config.event.endDate = date;
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Event Date Updated')
                .setDescription(`Event end date set to: **${date}**`);
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (subcommand === 'set-fake-days') {
            const days = interaction.options.getInteger('days');
            
            config.settings.fakeAccountDays = days;
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Fake Account Days Updated')
                .setDescription(`Accounts younger than **${days} days** will be marked as fake`);
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (subcommand === 'set-skip-invites') {
            const amount = interaction.options.getInteger('amount');
            
            config.messages.skipQueueInvites = amount;
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Skip Queue Invites Updated')
                .setDescription(`Users need **${amount} invites** to skip the queue`);
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (subcommand === 'set-verification-url') {
            const url = interaction.options.getString('url');
            
            config.messages.verificationURL = url;
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Verification URL Updated')
                .setDescription(`Verification URL set to: ${url}`);
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (subcommand === 'set-reward') {
            const id = interaction.options.getString('id');
            const invites = interaction.options.getInteger('invites');
            const name = interaction.options.getString('name');
            const role = interaction.options.getRole('role');
            
            const reward = config.rewards.find(r => r.id === id);
            if (!reward) {
                return interaction.reply({ content: '❌ Reward not found!', ephemeral: true });
            }
            
            if (invites) reward.invitesRequired = invites;
            if (name) reward.name = name;
            if (role) reward.roleId = role.id;
            
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
            
            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Reward Updated')
                .setDescription(`Updated reward: **${reward.name}**`)
                .addFields(
                    { name: 'Invites Required', value: `${reward.invitesRequired}`, inline: true },
                    { name: 'Role', value: role ? `<@&${role.id}>` : 'Not changed', inline: true }
                );
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (subcommand === 'view') {
            const embed = new EmbedBuilder()
                .setColor(config.colors.info)
                .setTitle('⚙️ Current Configuration')
                .addFields(
                    { 
                        name: '📺 Channels', 
                        value: `Check Invites: <#${config.channels.checkInvites}>\nHow to Invite: <#${config.channels.howToInvite}>\nInvite Reward: <#${config.channels.inviteReward}>\nClaim Reward: <#${config.channels.claimReward}>\nVouch/Payments: <#${config.channels.vouchPayments}>`,
                        inline: false 
                    },
                    { 
                        name: '👥 Roles', 
                        value: `Admin Ping: <@&${config.roles.adminPing}>\n3 Invites: <@&${config.roles['3invites']}>\n6 Invites: <@&${config.roles['6invites']}>\n12 Invites: <@&${config.roles['12invites']}>`,
                        inline: false 
                    },
                    { 
                        name: '📅 Event', 
                        value: `End Date: ${config.event.endDate}\nActive: ${config.event.active ? '✅' : '❌'}`,
                        inline: false 
                    },
                    { 
                        name: '⚙️ Settings', 
                        value: `Fake Account Days: ${config.settings.fakeAccountDays}\nSkip Queue Invites: ${config.messages.skipQueueInvites}`,
                        inline: false 
                    }
                );
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};