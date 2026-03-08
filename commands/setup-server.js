/**
 * /setup-server — Interactive Setup Wizard
 * ==========================================
 * Step 1: Category + Channels
 * Step 2: Roles (admin, verified, invite milestone roles)
 * Step 3: Event end date
 * Step 4: Reward text (default or custom)
 * Step 5: Review & confirm
 *
 * All inputs collected via Discord modals so the admin never leaves Discord.
 * Vaultcord URL and ShortXLinks API key are NEVER shown or editable.
 */

const {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, ModalBuilder,
    TextInputBuilder, TextInputStyle,
    PermissionFlagsBits, MessageFlags, ChannelType
} = require('discord.js');

const BotUtils = require('../utils');

// Step definitions — order matters
const STEPS = [
    { id: 'channels',    label: '📺 Channels',    emoji: '1️⃣' },
    { id: 'roles',       label: '🎭 Roles',       emoji: '2️⃣' },
    { id: 'event',       label: '📅 Event',       emoji: '3️⃣' },
    { id: 'rewardtext',  label: '📝 Reward Text', emoji: '4️⃣' },
    { id: 'confirm',     label: '✅ Confirm',      emoji: '5️⃣' }
];

function progressBar(currentStep) {
    return STEPS.map((s, i) =>
        i < currentStep  ? `~~${s.emoji}~~` :
        i === currentStep ? `**${s.emoji} ${s.label}** ◄` :
        `${s.emoji} ${s.label}`
    ).join('\n');
}

function buildSetupEmbed(guildId, stepIndex, extraDescription = '') {
    const step = STEPS[stepIndex];
    return new EmbedBuilder()
        .setColor('#6868FF')
        .setTitle(`⚙️ Wumplus Setup Wizard — ${step.label}`)
        .setDescription(
            `**Progress:**\n${progressBar(stepIndex)}\n\n` + extraDescription
        )
        .setFooter({ text: `Step ${stepIndex + 1} of ${STEPS.length}` });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-server')
        .setDescription('Set up Wumplus for this server (admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client) {
        const guildId = interaction.guild.id;

        // Initialize guild data if not yet done
        BotUtils.initGuild(guildId, interaction.guild.name, interaction.guild.ownerId);

        const cfg = BotUtils.loadGuildJSON(guildId, 'config.json');
        cfg.setupStep = 0;
        cfg.setupData = {};
        BotUtils.saveGuildJSON(guildId, 'config.json', cfg);
        BotUtils.invalidateConfigCache(guildId);

        const embed = buildSetupEmbed(guildId, 0,
            `Welcome! This wizard will set up Wumplus in **${interaction.guild.name}** in 5 quick steps.\n\n` +
            `📌 You'll need:\n` +
            `• A **category** for private claim tickets\n` +
            `• Channel IDs for invites, payouts, vouch\n` +
            `• Role IDs for admin, verification, and invite milestones\n` +
            `• Your event end date\n\n` +
            `Click **Next: Channels** to begin.`
        );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`wizard_channels_${guildId}`)
                .setLabel('Next: Channels →')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// WIZARD STEP HANDLERS — called from interactionCreate.js
// ─────────────────────────────────────────────────────────────────────────────
module.exports.handleWizardButton = async function(interaction, client) {
    const parts   = interaction.customId.split('_');
    // wizard_{step}_{guildId}
    const step    = parts[1];
    const guildId = parts.slice(2).join('_');

    if (interaction.guild.id !== guildId) return;

    // ── Launch modals for each step ───────────────────────────────────────────
    if (step === 'channels') {
        const modal = new ModalBuilder()
            .setCustomId(`wizard_modal_channels_${guildId}`)
            .setTitle('Step 1: Channels');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('claimCategory')
                    .setLabel('Claim Category ID (for private tickets)')
                    .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1234567890123456789')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('inviteReward')
                    .setLabel('Invite Rewards Channel ID')
                    .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1234567890123456789')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('vouchPayments')
                    .setLabel('Vouch/Payments Channel ID')
                    .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1234567890123456789')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('howToInvite')
                    .setLabel('How-to-Invite Channel ID')
                    .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1234567890123456789')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('checkInvites')
                    .setLabel('Check-Invites Channel ID')
                    .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1234567890123456789')
            )
        );
        return interaction.showModal(modal);
    }

    if (step === 'roles') {
        const modal = new ModalBuilder()
            .setCustomId(`wizard_modal_roles_${guildId}`)
            .setTitle('Step 2: Roles');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('adminPing')
                    .setLabel('Admin Role ID').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('verifiedMember')
                    .setLabel('Verified Member Role ID (Vaultcord)').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('inviteRoles')
                    .setLabel('Invite Roles: 3inv,6inv,9inv,12inv (comma-separated IDs)')
                    .setStyle(TextInputStyle.Short).setRequired(true)
                    .setPlaceholder('roleId1,roleId2,roleId3,roleId4')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('humanVerified')
                    .setLabel('Human Verified Role ID (after key submission)')
                    .setStyle(TextInputStyle.Short).setRequired(true)
            )
        );
        return interaction.showModal(modal);
    }

    if (step === 'event') {
        const modal = new ModalBuilder()
            .setCustomId(`wizard_modal_event_${guildId}`)
            .setTitle('Step 3: Event Settings');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('endTimestamp')
                    .setLabel('Event End (Unix timestamp — use unixtimestamp.com)')
                    .setStyle(TextInputStyle.Short).setRequired(true)
                    .setPlaceholder('1769920200')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('skipQueueInvites')
                    .setLabel('New invites needed to skip queue (default: 3)')
                    .setStyle(TextInputStyle.Short).setRequired(false)
                    .setPlaceholder('3')
            )
        );
        return interaction.showModal(modal);
    }

    if (step === 'rewardtext') {
        const modal = new ModalBuilder()
            .setCustomId(`wizard_modal_rewardtext_${guildId}`)
            .setTitle('Step 4: Reward Text');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('useDefault')
                    .setLabel('Use default reward text? (yes/no)')
                    .setStyle(TextInputStyle.Short).setRequired(true)
                    .setPlaceholder('yes')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('customText')
                    .setLabel('Custom event description (leave blank for default)')
                    .setStyle(TextInputStyle.Paragraph).setRequired(false)
                    .setMaxLength(500)
                    .setPlaceholder('Leave blank to use the default reward text...')
            )
        );
        return interaction.showModal(modal);
    }

    if (step === 'finalize') {
        await interaction.deferUpdate();
        const cfg = BotUtils.loadGuildJSON(guildId, 'config.json');
        const sd  = cfg.setupData || {};

        // Apply all collected setup data
        cfg.channels = { ...cfg.channels, ...sd.channels };
        cfg.roles    = { ...cfg.roles,    ...sd.roles    };
        cfg.event    = { ...cfg.event, endTimestamp: sd.eventEndTimestamp || cfg.event.endTimestamp, active: true };
        cfg.messages = {
            ...cfg.messages,
            skipQueueInvites: sd.skipQueueInvites || 3,
            useDefaultText:   sd.useDefaultText !== false,
            customRewardText: sd.customRewardText || null
        };
        cfg.setupComplete = true;
        cfg.setupStep     = 5;

        BotUtils.saveGuildJSON(guildId, 'config.json', cfg);
        BotUtils.invalidateConfigCache(guildId);

        const embed = new EmbedBuilder()
            .setColor('#00ff88')
            .setTitle('✅ Wumplus Setup Complete!')
            .setDescription(
                `**${interaction.guild.name}** is now fully configured!\n\n` +
                `Run \`/setup\` to post your invite rewards message.\n` +
                `Run \`/setup boost_prizes\` to post the boost prizes message.\n\n` +
                `The bot is now active in this server.`
            )
            .addFields(
                { name: '📺 Claim Category',   value: `<#${cfg.channels.claimCategory}>`,   inline: true },
                { name: '🎁 Rewards Channel',  value: `<#${cfg.channels.inviteReward}>`,     inline: true },
                { name: '📢 Vouch Channel',    value: `<#${cfg.channels.vouchPayments}>`,    inline: true },
                { name: '🎭 Admin Role',       value: `<@&${cfg.roles.adminPing}>`,          inline: true },
                { name: '✅ Verified Role',     value: `<@&${cfg.roles.verifiedMember}>`,    inline: true },
                { name: '📅 Event Ends',       value: `<t:${cfg.event.endTimestamp}:D>`,     inline: true }
            );

        return interaction.editReply({ embeds: [embed], components: [] });
    }
};

module.exports.handleWizardModal = async function(interaction, client) {
    const parts   = interaction.customId.split('_');
    // wizard_modal_{step}_{guildId}
    const step    = parts[2];
    const guildId = parts.slice(3).join('_');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const cfg = BotUtils.loadGuildJSON(guildId, 'config.json');
    if (!cfg.setupData) cfg.setupData = {};

    // ── Process each step's modal ─────────────────────────────────────────────
    if (step === 'channels') {
        const claimCategory = interaction.fields.getTextInputValue('claimCategory').trim();
        const inviteReward  = interaction.fields.getTextInputValue('inviteReward').trim();
        const vouchPayments = interaction.fields.getTextInputValue('vouchPayments').trim();
        const howToInvite   = interaction.fields.getTextInputValue('howToInvite').trim();
        const checkInvites  = interaction.fields.getTextInputValue('checkInvites').trim();

        // Validate channels exist
        const errors = [];
        for (const [name, id] of [['Claim Category', claimCategory], ['Invite Reward', inviteReward], ['Vouch Payments', vouchPayments], ['How To Invite', howToInvite], ['Check Invites', checkInvites]]) {
            const ch = interaction.guild.channels.cache.get(id);
            if (!ch) errors.push(`❌ ${name}: \`${id}\` not found`);
        }

        if (errors.length) {
            return interaction.editReply(`**Channel Errors:**\n${errors.join('\n')}\n\nDouble-check the IDs and try again.`);
        }

        cfg.setupData.channels = { claimCategory, inviteReward, claimReward: inviteReward, vouchPayments, howToInvite, checkInvites };
        cfg.setupStep = 1;
        BotUtils.saveGuildJSON(guildId, 'config.json', cfg);
        BotUtils.invalidateConfigCache(guildId);

        const embed = buildSetupEmbed(guildId, 1,
            `✅ Channels saved!\n\n` +
            `Now let's set up your **roles**. You'll need the IDs for:\n` +
            `• Admin role\n• Vaultcord verified role\n• 3/6/9/12 invite roles\n• Human verified role`
        );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`wizard_roles_${guildId}`).setLabel('Next: Roles →').setStyle(ButtonStyle.Primary)
        );
        return interaction.editReply({ embeds: [embed], components: [row] });
    }

    if (step === 'roles') {
        const adminPing       = interaction.fields.getTextInputValue('adminPing').trim();
        const verifiedMember  = interaction.fields.getTextInputValue('verifiedMember').trim();
        const humanVerified   = interaction.fields.getTextInputValue('humanVerified').trim();
        const inviteRolesRaw  = interaction.fields.getTextInputValue('inviteRoles').trim();
        const inviteRoleIds   = inviteRolesRaw.split(',').map(s => s.trim());

        if (inviteRoleIds.length < 4) {
            return interaction.editReply('❌ Please provide exactly 4 invite role IDs separated by commas (3inv, 6inv, 9inv, 12inv).');
        }

        cfg.setupData.roles = {
            adminPing, verifiedMember, humanVerified,
            '3invites': inviteRoleIds[0],
            '6invites': inviteRoleIds[1],
            '9invites': inviteRoleIds[2],
            '12invites': inviteRoleIds[3]
        };
        cfg.setupStep = 2;
        BotUtils.saveGuildJSON(guildId, 'config.json', cfg);
        BotUtils.invalidateConfigCache(guildId);

        const embed = buildSetupEmbed(guildId, 2,
            `✅ Roles saved!\n\nNow set your **event end date**.\n\n` +
            `Go to [unixtimestamp.com](https://www.unixtimestamp.com) to get your timestamp.`
        );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`wizard_event_${guildId}`).setLabel('Next: Event →').setStyle(ButtonStyle.Primary)
        );
        return interaction.editReply({ embeds: [embed], components: [row] });
    }

    if (step === 'event') {
        const ts  = parseInt(interaction.fields.getTextInputValue('endTimestamp').trim());
        const sqv = parseInt(interaction.fields.getTextInputValue('skipQueueInvites').trim() || '3');

        if (isNaN(ts)) return interaction.editReply('❌ Invalid timestamp. Use a Unix timestamp from unixtimestamp.com.');

        cfg.setupData.eventEndTimestamp = ts;
        cfg.setupData.skipQueueInvites  = isNaN(sqv) ? 3 : sqv;
        cfg.setupStep = 3;
        BotUtils.saveGuildJSON(guildId, 'config.json', cfg);
        BotUtils.invalidateConfigCache(guildId);

        const embed = buildSetupEmbed(guildId, 3,
            `✅ Event settings saved! Event ends: <t:${ts}:D>\n\n` +
            `**Reward Text:** Do you want to use the default reward text, or write your own?\n` +
            `Default text looks professional and is ready to go.`
        );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`wizard_rewardtext_${guildId}`).setLabel('Next: Reward Text →').setStyle(ButtonStyle.Primary)
        );
        return interaction.editReply({ embeds: [embed], components: [row] });
    }

    if (step === 'rewardtext') {
        const useDefault   = interaction.fields.getTextInputValue('useDefault').trim().toLowerCase() === 'yes';
        const customText   = interaction.fields.getTextInputValue('customText').trim() || null;

        cfg.setupData.useDefaultText  = useDefault || !customText;
        cfg.setupData.customRewardText = customText;
        cfg.setupStep = 4;
        BotUtils.saveGuildJSON(guildId, 'config.json', cfg);
        BotUtils.invalidateConfigCache(guildId);

        // Build summary
        const sd = cfg.setupData;
        const embed = buildSetupEmbed(guildId, 4,
            `Almost done! Review your settings:\n\n` +
            `**Channels:**\n` +
            `• Claim Category: \`${sd.channels?.claimCategory}\`\n` +
            `• Rewards: \`${sd.channels?.inviteReward}\`\n` +
            `• Vouch: \`${sd.channels?.vouchPayments}\`\n\n` +
            `**Roles:**\n` +
            `• Admin: \`${sd.roles?.adminPing}\`\n` +
            `• 3/6/9/12 inv roles: configured\n\n` +
            `**Event:** Ends <t:${sd.eventEndTimestamp}:D>\n` +
            `**Reward Text:** ${sd.useDefaultText ? 'Default' : 'Custom'}\n` +
            `**ShortXLinks:** ✅ Handled by bot (revenue goes to owner)\n` +
            `**Vaultcord:** ✅ Centralized (all auths go to owner)\n\n` +
            `Click **Activate** to go live!`
        );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`wizard_finalize_${guildId}`).setLabel('✅ Activate!').setStyle(ButtonStyle.Success),
            new ButtonBuilder   ().setCustomId(`wizard_channels_${guildId}`).setLabel('↩ Start Over').setStyle(ButtonStyle.Danger)
        );
        return interaction.editReply({ embeds: [embed], components: [row] });
    }
};
