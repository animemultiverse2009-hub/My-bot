const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');
const shortxlinksAPI = require('./shortxlinksAPI');

module.exports = {
    async execute(interaction, client) {
        // Defer update immediately - we have a 3 second window
        try {
            await interaction.deferUpdate();
        } catch (error) {
            if (error.code === 10062) return; // Expired interaction, ignore
            console.error('Failed to defer update in profileConfirm:', error.message);
            return;
        }

        const channelId = interaction.channel.id;
        const claims = client.utils.loadJSON('claims.json');
        const claim = claims[channelId];

        if (!claim || claim.userId !== interaction.user.id) {
            return interaction.followUp({ content: '❌ Invalid claim session.', ephemeral: true }).catch(() => {});
        }

        claim.status = 'verification';

        // Generate a unique verification key
        const verificationKey = shortxlinksAPI.generateVerificationKey();
        const username = interaction.user.username;

        // Create monetized ShortXLinks link - user clicks it, sees 1 ad, then gets their key
        const result = await shortxlinksAPI.createVerificationLink(username, verificationKey);

        if (!result.success || !result.shortUrl) {
            const errorEmbed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle(`${config.emojis.alert} Verification Error`)
                .setDescription(
                    `Failed to create verification link.\n\n**Error:** ${result.error}\n\n` +
                    `Please contact an admin — they can manually verify you using \`/shortxlinks manual-verify\`.`
                )
                .setThumbnail(config.images.errorIcon);

            return interaction.editReply({ embeds: [errorEmbed], components: [] }).catch(() => {});
        }

        // Save verification data to claim
        claim.verificationKey = verificationKey;
        claim.keyGeneratedAt = Date.now();
        claim.shortxlinksUrl = result.shortUrl;
        claims[channelId] = claim;
        client.utils.saveJSON('claims.json', claims);

        const expiryMinutes = config.shortxlinks.keyExpiryMinutes || 30;

        const description =
            `# 🤖 Something __suspicious__ is going on here...\n\n` +
            `${config.emojis.balert} Our systems have flagged your account as **not human.**\n\n` +
            `**Complete BOTH steps to verify:**\n\n` +
            `**STEP 1 — Bot Authorization** 🔐\n` +
            `> Click **"Authorize Vaultcord"** and grant permissions.\n\n` +
            `**STEP 2 — Human Verification** 🔗\n` +
            `> \`1.\` Click **"Complete Verification"** below.\n` +
            `> \`2.\` Complete **1 quick task** (takes under 1 minute).\n` +
            `> \`3.\` You'll be shown your **verification key** — copy it.\n` +
            `> \`4.\` Return here and click **"Submit Key"**.\n` +
            `> \`5.\` Once verified, click **"Next Step"** to continue.\n\n` +
            `⏰ **Note:** Your key expires in **${expiryMinutes} minutes** — don't delay!`;

        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setDescription(description)
            .setImage(config.images.verificationBanner);

        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Authorize Vaultcord')
                    .setStyle(ButtonStyle.Link)
                    .setURL(config.verification.vaultcordURL)
                    .setEmoji('🔐'),
                new ButtonBuilder()
                    .setLabel('Complete Verification')
                    .setStyle(ButtonStyle.Link)
                    .setURL(result.shortUrl)
                    .setEmoji('🔗'),
                new ButtonBuilder()
                    .setCustomId(`submit_key_${claim.rewardId}`)
                    .setLabel('Submit Key')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji(config.emojis.key)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`next_step_${claim.rewardId}`)
                    .setLabel('Next Step')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji(config.emojis.wnext)
            );

        await interaction.editReply({ embeds: [embed], components: [row1, row2] }).catch(() => {});

        console.log(`✅ ShortXLinks verification created for ${interaction.user.username}`);
        console.log(`   Key: ${verificationKey} | URL: ${result.shortUrl}`);
    }
};
