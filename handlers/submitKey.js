const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('../config.json');

module.exports = {

    // ── Show the key input modal ──────────────────────────────────────────────
    async execute(interaction, client) {
        const channelId = interaction.channel.id;
        const claims    = client.utils.loadJSON('claims.json');
        const claim     = claims[channelId];

        if (!claim || claim.userId !== interaction.user.id) {
            return interaction.reply({ content: '❌ Invalid claim session.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        const modal = new ModalBuilder()
            .setCustomId(`verify_key_${claim.rewardId}`)
            .setTitle('Enter Verification Key');

        const keyInput = new TextInputBuilder()
            .setCustomId('verification_key')
            .setLabel('Verification Key')
            .setPlaceholder('XXXX-XXXX-XXXX-XXXX')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(25);

        modal.addComponents(new ActionRowBuilder().addComponents(keyInput));

        try {
            await interaction.showModal(modal);
        } catch (error) {
            console.error('❌ Error showing key modal:', error.message);
        }
    },

    // ── Handle modal submission ───────────────────────────────────────────────
    async handleModalSubmit(interaction, client) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error('❌ Failed to defer modal submit:', error.message);
            return;
        }

        const channelId = interaction.channel.id;
        const claims    = client.utils.loadJSON('claims.json');
        const claim     = claims[channelId];

        if (!claim || claim.userId !== interaction.user.id) {
            return interaction.editReply({ content: '❌ Invalid claim session.' }).catch(() => {});
        }

        const submittedKey = interaction.fields.getTextInputValue('verification_key')
            .trim().toUpperCase().replace(/\s+/g, '');
        const correctKey = (claim.verificationKey || '').replace(/\s+/g, '');

        console.log(`\n🔑 Key submission — ${interaction.user.username}`);
        console.log(`   Submitted: ${submittedKey}`);
        console.log(`   Expected:  ${correctKey}`);

        // ── Check expiry via shortxlinksAPI (was lootlabsAPI — fixed) ─────────
        const shortxlinksAPI = require('./shortxlinksAPI');
        if (shortxlinksAPI.isKeyExpired && shortxlinksAPI.isKeyExpired(claim.keyGeneratedAt)) {
            console.log(`   ❌ Key expired`);

            claim.verified        = false;
            claim.verificationKey = null;
            claims[channelId]     = claim;
            client.utils.saveJSON('claims.json', claims);

            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.error)
                    .setTitle(`${config.emojis.alert} Key Expired`)
                    .setDescription(
                        `Your verification key has expired!\n\n` +
                        `Keys expire after **${config.shortxlinks?.keyExpiryMinutes || 30} minutes**.\n\n` +
                        `Go back to your verification link and generate a new key.`
                    )
                    .setThumbnail(config.images.errorIcon)
                ]
            }).catch(() => {});
        }

        // ── Correct key ───────────────────────────────────────────────────────
        if (submittedKey === correctKey) {
            claim.verified    = true;
            claim.verifiedAt  = Date.now();
            claims[channelId] = claim;
            client.utils.saveJSON('claims.json', claims);

            // Assign Human role
            try {
                const member    = await interaction.guild.members.fetch(interaction.user.id);
                const humanRole = interaction.guild.roles.cache.get(config.roles.humanVerified);
                if (humanRole && !member.roles.cache.has(config.roles.humanVerified)) {
                    await member.roles.add(humanRole);
                    console.log(`   ✅ Human role assigned`);
                }
            } catch (err) {
                console.error(`   ⚠️ Failed to assign Human role: ${err.message}`);
            }

            const completionTime = Math.round((claim.verifiedAt - claim.keyGeneratedAt) / 60000);

            // FIX: config.emojis.gtick is cross-guild — shows as ":gtick:" text in Server Testing.
            // Using ✅ unicode until "node migrate-emojis.js" is run to make it app-owned.
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.success)
                    .setTitle('✅ Verification Successful!')
                    .setDescription(
                        `✅ Your key is correct!\n\n` +
                        `${config.emojis.shield} You've been granted the <@&${config.roles.humanVerified}> role!\n\n` +
                        `Completed in: **${completionTime} minutes**\n\n` +
                        `Now click the **"Next Step"** button to continue.`
                    )
                ]
            }).catch(() => {});

            console.log(`   ✅ Verified successfully in ${completionTime} minutes`);

        // ── Wrong key ─────────────────────────────────────────────────────────
        } else {
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.error)
                    .setTitle(`${config.emojis.alert} Invalid Key`)
                    .setDescription(
                        `${config.emojis.rcross} The key you entered is **incorrect**.\n\n` +
                        `• Make sure you completed the verification link\n` +
                        `• Copy the key exactly as shown\n` +
                        `• Keys are case-insensitive\n\n` +
                        `Try again by clicking **Submit Key**.`
                    )
                    .setThumbnail(config.images.errorIcon)
                ]
            }).catch(() => {});

            console.log(`   ❌ Wrong key submitted`);
        }
    }
};
