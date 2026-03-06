const { MessageFlags } = require('discord.js');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {

        // ─── Slash Commands ───────────────────────────────────────────────────
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction, client);
            } catch (error) {
                // 10062 = interaction token expired (e.g. bot restarted mid-session) - silent ignore
                if (error.code === 10062) return;

                console.error(`Error executing /${interaction.commandName}:`, error.message);

                const errMsg = { content: '❌ An error occurred while running this command.', flags: MessageFlags.Ephemeral };
                try {
                    if (interaction.deferred || interaction.replied) {
                        await interaction.editReply(errMsg).catch(() => {});
                    } else {
                        await interaction.reply(errMsg).catch(() => {});
                    }
                } catch (_) {}
            }
            return;
        }

        // ─── Button Interactions ──────────────────────────────────────────────
        if (interaction.isButton()) {
            // These buttons handle their own response (update/reply directly)
            const noDeferButtons = [
                'profile_yes_', 'profile_no_',
                'confirm_claim_', 'cancel_claim_',
                'submit_key_', 'next_step_',
                'claim_reward_'
            ];

            const shouldDefer = !noDeferButtons.some(p => interaction.customId.startsWith(p));

            if (shouldDefer) {
                try {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                } catch (err) {
                    // 10062 = expired interaction, stop processing
                    if (err.code === 10062) return;
                    console.error('Failed to defer button:', err.message);
                    return;
                }
            }

            try {
                if (interaction.customId.startsWith('confirm_claim_')) {
                    await require('../handlers/confirmClaim').execute(interaction, client);
                } else if (interaction.customId.startsWith('cancel_claim_')) {
                    await require('../handlers/cancelClaim').execute(interaction, client);
                } else if (interaction.customId.startsWith('profile_yes_')) {
                    await require('../handlers/profileConfirm').execute(interaction, client);
                } else if (interaction.customId.startsWith('profile_no_')) {
                    await require('../handlers/profileDecline').execute(interaction, client);
                } else if (interaction.customId.startsWith('submit_key_')) {
                    await require('../handlers/submitKey').execute(interaction, client);
                } else if (interaction.customId.startsWith('next_step_')) {
                    await require('../handlers/nextStep').execute(interaction, client);
                } else if (interaction.customId.startsWith('claim_reward_')) {
                    await require('../handlers/claimRewardFinal').execute(interaction, client);
                } else if (interaction.customId.startsWith('skip_queue_') || interaction.customId.startsWith('unlock_prize_')) {
                    await require('../handlers/skipQueue').execute(interaction, client);
                } else {
                    const buttonHandlers = {
                        'check_invites': require('../handlers/checkInvites'),
                        'claim_rewards': require('../handlers/claimRewards'),
                        'claim_boost_rewards': require('../handlers/claimBoostRewards'),
                        'view_invited_members': require('../handlers/viewInvitedMembers'),
                        'pro_tip': require('../handlers/proTip')
                    };

                    const handler = buttonHandlers[interaction.customId];
                    if (handler) {
                        await handler.execute(interaction, client);
                    }
                }
            } catch (error) {
                if (error.code === 10062) return;
                console.error(`Error handling button ${interaction.customId}:`, error.message);
            }
            return;
        }

        // ─── Select Menus ─────────────────────────────────────────────────────
        if (interaction.isStringSelectMenu()) {
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            } catch (err) {
                if (err.code === 10062) return;
                console.error('Failed to defer select menu:', err.message);
                return;
            }

            try {
                if (interaction.customId === 'select_reward') {
                    await require('../handlers/selectReward').execute(interaction, client);
                } else if (interaction.customId === 'platform_select') {
                    await require('../handlers/platformSelect').execute(interaction, client);
                }
            } catch (error) {
                if (error.code === 10062) return;
                console.error(`Error handling select menu ${interaction.customId}:`, error.message);
            }
            return;
        }

        // ─── Modal Submits ────────────────────────────────────────────────────
        if (interaction.isModalSubmit()) {
            try {
                if (interaction.customId.startsWith('verify_key_')) {
                    await require('../handlers/submitKey').handleModalSubmit(interaction, client);
                }
            } catch (error) {
                if (error.code === 10062) return;
                console.error(`Error handling modal ${interaction.customId}:`, error.message);
            }
        }
    }
};
