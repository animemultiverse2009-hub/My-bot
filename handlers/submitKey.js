const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('../config.json');
const shortxlinksAPI = require('./shortxlinksAPI');

module.exports = {
    // Show the key submission modal - DO NOT defer here, showModal must be first response
    async execute(interaction, client) {
        const channelId = interaction.channel.id;
        const claims = client.utils.loadJSON('claims.json');
        const claim = claims[channelId];

        if (!claim || claim.userId !== interaction.user.id) {
            return interaction.reply({
                content: '❌ Invalid claim session.',
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        const modal = new ModalBuilder()
            .setCustomId(`verify_key_${claim.rewardId}`)
            .setTitle('Enter Your Verification Key');

        const keyInput = new TextInputBuilder()
            .setCustomId('verification_key')
            .setLabel('Verification Key (from the verification page)')
            .setPlaceholder('XXXX-XXXX-XXXX-XXXX')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(25)
            .setMinLength(10);

        modal.addComponents(new ActionRowBuilder().addComponents(keyInput));

        try {
            await interaction.showModal(modal);
        } catch (error) {
            console.error('Error showing modal:', error.message);
        }
    },

    // Handle key submission from modal
    async handleModalSubmit(interaction, client) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        } catch (error) {
            if (error.code === 10062) return;
            console.error('Failed to defer modal submit:', error.message);
            return;
        }

        const channelId = interaction.channel.id;
        const claims = client.utils.loadJSON('claims.json');
        const claim = claims[channelId];

        if (!claim || claim.userId !== interaction.user.id) {
            return interaction.editReply({ content: '❌ Invalid claim session.' }).catch(() => {});
        }

        // Normalise both keys for comparison
        const submitted = interaction.fields.getTextInputValue('verification_key')
            .trim().toUpperCase().replace(/[\s-]/g, '');
        const correct = (claim.verificationKey || '').toUpperCase().replace(/[\s-]/g, '');

        // Check expiry
        if (shortxlinksAPI.isKeyExpired(claim.keyGeneratedAt)) {
            claim.verified = false;
            claim.verificationKey = null;
            claims[channelId] = claim;
            client.utils.saveJSON('claims.json', claims);

            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.error)
                    .setTitle(`${config.emojis.alert} Key Expired`)
                    .setDescription(
                        `Your verification key expired after **${config.shortxlinks.keyExpiryMinutes} minutes**.\n\n` +
                        `Click the **profile confirmation** button to generate a new link.`
                    )
                    .setThumbnail(config.images.errorIcon)
                ]
            }).catch(() => {});
        }

        if (submitted === correct) {
            // Correct key — mark as verified and assign human role
            claim.verified = true;
            claim.verifiedAt = Date.now();
            claims[channelId] = claim;
            client.utils.saveJSON('claims.json', claims);

            try {
                const member = await interaction.guild.members.fetch(interaction.user.id);
                const humanRole = interaction.guild.roles.cache.get(config.roles.humanVerified);
                if (humanRole && !member.roles.cache.has(config.roles.humanVerified)) {
                    await member.roles.add(humanRole);
                }
            } catch (error) {
                console.error('Failed to assign Human role:', error.message);
            }

            const completionTime = Math.round((claim.verifiedAt - claim.keyGeneratedAt) / 60000);

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.success)
                    .setTitle('✅ Verification Successful!')
                    .setDescription(
                        `${config.emojis.gtick} Your key is correct!\n\n` +
                        `${config.emojis.shield} You've been granted the <@&${config.roles.humanVerified}> role!\n\n` +
                        `Completed in: **${completionTime} minutes**\n\n` +
                        `Now click the **"Next Step"** button to continue.`
                    )
                ]
            }).catch(() => {});

            console.log(`✅ ${interaction.user.username} verified successfully`);
        } else {
            // Wrong key
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(config.colors.error)
                    .setTitle(`${config.emojis.alert} Invalid Key`)
                    .setDescription(
                        `${config.emojis.rcross} The key you entered doesn't match.\n\n` +
                        `Make sure you completed the task and copied the **exact key shown** on the page.\n\n` +
                        `Try clicking **"Submit Key"** again.`
                    )
                    .setThumbnail(config.images.errorIcon)
                ]
            }).catch(() => {});

            console.log(`❌ Invalid key attempt by ${interaction.user.username}`);
        }
    }
};
