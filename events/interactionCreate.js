const { MessageFlags } = require('discord.js');
const BotUtils = require('../utils');
const lock     = require('../interactionLock');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        const guildId = interaction.guild?.id;

        // ── 1. Interaction dedup lock ─────────────────────────────────────────
        // Prevents double-click / Discord retry from running a handler twice
        if (interaction.isButton() || interaction.isStringSelectMenu()) {
            if (!lock.acquire(interaction)) {
                // Already processing this exact interaction — silently drop it
                return;
            }
        }

        // ── 2. Guild health check ─────────────────────────────────────────────
        if (guildId) {
            const cfg = BotUtils.loadGuildConfig(guildId);

            if (cfg.guildId && cfg.active === false) {
                if (interaction.isRepliable()) {
                    interaction.reply({ content: '⛔ Wumplus is disabled in this server.', flags: MessageFlags.Ephemeral }).catch(() => {});
                }
                lock.release(interaction);
                return;
            }

            if (cfg.guildId && !cfg.setupComplete) {
                const isAllowed =
                    (interaction.isChatInputCommand() && ['setup-server', 'owner'].includes(interaction.commandName)) ||
                    (interaction.isButton()      && interaction.customId.startsWith('wizard_')) ||
                    (interaction.isModalSubmit() && interaction.customId.startsWith('wizard_modal_'));

                if (!isAllowed) {
                    if (interaction.isRepliable()) {
                        interaction.reply({ content: '⚙️ Bot not set up yet. Ask an admin to run `/setup-server`!', flags: MessageFlags.Ephemeral }).catch(() => {});
                    }
                    lock.release(interaction);
                    return;
                }
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // SLASH COMMANDS
        // ══════════════════════════════════════════════════════════════════════
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction, client);
            } catch (error) {
                console.error(`❌ /${interaction.commandName}:`, error.message);
                interaction.reply({ content: `❌ \`${error.message}\``, flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            return;
        }

        // ══════════════════════════════════════════════════════════════════════
        // BUTTONS
        // ══════════════════════════════════════════════════════════════════════
        if (interaction.isButton()) {
            // Wizard buttons — handled by setup-server module (shows modal, no defer)
            if (interaction.customId.startsWith('wizard_')) {
                try {
                    await require('../commands/setup-server').handleWizardButton(interaction, client);
                } catch (e) { console.error('Wizard button:', e.message); }
                lock.release(interaction);
                return;
            }

            const id = interaction.customId;

            // Buttons that handle their own reply (no pre-defer)
            const selfHandled = [
                'profile_yes_', 'profile_no_',
                'confirm_claim_', 'cancel_claim_',
                'submit_key_', 'next_step_', 'claim_reward_'
            ];
            const needsDefer = !selfHandled.some(p => id.startsWith(p));

            if (needsDefer) {
                try {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                } catch {
                    // Interaction expired between click and defer — drop silently
                    lock.release(interaction);
                    return;
                }
            }

            try {
                if      (id.startsWith('confirm_claim_'))   await require('../handlers/confirmClaim').execute(interaction, client);
                else if (id.startsWith('cancel_claim_'))    await require('../handlers/cancelClaim').execute(interaction, client);
                else if (id.startsWith('profile_yes_'))     await require('../handlers/profileConfirm').execute(interaction, client);
                else if (id.startsWith('profile_no_'))      await require('../handlers/profileDecline').execute(interaction, client);
                else if (id.startsWith('submit_key_'))      await require('../handlers/submitKey').execute(interaction, client);
                else if (id.startsWith('next_step_'))       await require('../handlers/nextStep').execute(interaction, client);
                else if (id.startsWith('claim_reward_'))    await require('../handlers/claimRewardFinal').execute(interaction, client);
                else if (id.startsWith('skip_queue_') || id.startsWith('unlock_prize_'))
                                                            await require('../handlers/skipQueue').execute(interaction, client);
                else {
                    const map = {
                        check_invites:        './handlers/checkInvites',
                        claim_rewards:        './handlers/claimRewards',
                        claim_boost_rewards:  './handlers/claimBoostRewards',
                        view_invited_members: './handlers/viewInvitedMembers',
                        pro_tip:              './handlers/proTip'
                    };
                    if (map[id]) await require(map[id]).execute(interaction, client);
                }
            } catch (error) {
                console.error(`❌ Button ${id}:`, error.message);
                if (error.code === 50035) console.error('   Hint: emoji error — run migrate-emojis.js');
            }

            lock.release(interaction);
            return;
        }

        // ══════════════════════════════════════════════════════════════════════
        // SELECT MENUS
        // ══════════════════════════════════════════════════════════════════════
        if (interaction.isStringSelectMenu()) {
            // SPEED: Defer immediately — this is the very first thing we do
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            } catch {
                lock.release(interaction);
                return;
            }

            try {
                if      (interaction.customId === 'select_reward')  await require('../handlers/selectReward').execute(interaction, client);
                else if (interaction.customId === 'platform_select') await require('../handlers/platformSelect').execute(interaction, client);
            } catch (e) {
                console.error(`❌ Select ${interaction.customId}:`, e.message);
            }

            lock.release(interaction);
            return;
        }

        // ══════════════════════════════════════════════════════════════════════
        // MODALS
        // ══════════════════════════════════════════════════════════════════════
        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('wizard_modal_')) {
                try {
                    await require('../commands/setup-server').handleWizardModal(interaction, client);
                } catch (e) { console.error('Wizard modal:', e.message); }
                return;
            }
            if (interaction.customId.startsWith('verify_key_')) {
                try {
                    await require('../handlers/submitKey').handleModalSubmit(interaction, client);
                } catch (e) { console.error('Modal submitKey:', e.message); }
            }
        }
    }
};
