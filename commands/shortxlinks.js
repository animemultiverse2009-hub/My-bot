const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const config = require('../config.json');
const shortxlinksAPI = require('../handlers/shortxlinksAPI');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shortxlinks')
        .setDescription('Manage ShortXLinks verification system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('set-api-key')
                .setDescription('Update ShortXLinks API key')
                .addStringOption(opt => opt.setName('key').setDescription('Your API key').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('set-expiry')
                .setDescription('Set how long keys stay valid')
                .addIntegerOption(opt => opt.setName('minutes').setDescription('Minutes until key expires').setRequired(true).setMinValue(5).setMaxValue(120)))
        .addSubcommand(sub =>
            sub.setName('set-landing-page')
                .setDescription('Set landing page URL shown after ad completion')
                .addStringOption(opt => opt.setName('url').setDescription('Full URL of your landing page').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('settings')
                .setDescription('View current ShortXLinks settings'))
        .addSubcommand(sub =>
            sub.setName('test')
                .setDescription('Test ShortXLinks by creating a live verification link'))
        .addSubcommand(sub =>
            sub.setName('stats')
                .setDescription('View verification statistics and revenue estimates'))
        .addSubcommand(sub =>
            sub.setName('active-keys')
                .setDescription('List users with active (unexpired) verification keys'))
        .addSubcommand(sub =>
            sub.setName('manual-verify')
                .setDescription('Manually verify a user, bypassing ShortXLinks')
                .addUserOption(opt => opt.setName('user').setDescription('User to verify').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('cleanup')
                .setDescription('Delete expired verification keys and claims')),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();

        // Re-read config each time to get latest values
        const cfg = require('../config.json');

        if (sub === 'set-api-key') {
            const key = interaction.options.getString('key');
            cfg.shortxlinks.apiKey = key;
            fs.writeFileSync('./config.json', JSON.stringify(cfg, null, 4));

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(cfg.colors.success)
                    .setTitle('✅ API Key Updated')
                    .setDescription('ShortXLinks API key has been saved.')
                    .addFields({ name: 'Key Preview', value: `\`${key.substring(0, 20)}...\``, inline: true })
                ],
                ephemeral: true
            });
        }

        else if (sub === 'set-expiry') {
            const minutes = interaction.options.getInteger('minutes');
            cfg.shortxlinks.keyExpiryMinutes = minutes;
            cfg.verification.keyExpiryMinutes = minutes; // Keep in sync
            fs.writeFileSync('./config.json', JSON.stringify(cfg, null, 4));

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(cfg.colors.success)
                    .setTitle('✅ Key Expiry Updated')
                    .setDescription(`Verification keys will now expire after **${minutes} minutes**.`)
                ],
                ephemeral: true
            });
        }

        else if (sub === 'set-landing-page') {
            const url = interaction.options.getString('url');
            if (!url.startsWith('https://')) {
                return interaction.reply({ content: '❌ URL must start with https://', ephemeral: true });
            }

            cfg.shortxlinks.landingPage = url;
            fs.writeFileSync('./config.json', JSON.stringify(cfg, null, 4));

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(cfg.colors.success)
                    .setTitle('✅ Landing Page Updated')
                    .setDescription(`Users will be redirected to:\n${url}`)
                ],
                ephemeral: true
            });
        }

        else if (sub === 'settings') {
            const apiKeyPreview = cfg.shortxlinks.apiKey
                ? `\`${cfg.shortxlinks.apiKey.substring(0, 20)}...\``
                : '❌ Not set';

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(cfg.colors.info)
                    .setTitle('🔗 ShortXLinks Settings')
                    .addFields(
                        { name: 'API Key', value: apiKeyPreview, inline: false },
                        { name: 'Key Expiry', value: `${cfg.shortxlinks.keyExpiryMinutes} minutes`, inline: true },
                        { name: 'Key Length', value: `${cfg.shortxlinks.keyLength || 16} characters`, inline: true },
                        { name: 'Landing Page', value: cfg.shortxlinks.landingPage || 'Default', inline: false }
                    )
                    .setFooter({ text: 'Use /shortxlinks test to verify the API is working' })
                ],
                ephemeral: true
            });
        }

        else if (sub === 'test') {
            await interaction.deferReply({ ephemeral: true });

            const testKey = shortxlinksAPI.generateVerificationKey();
            const result = await shortxlinksAPI.createVerificationLink(interaction.user.username, testKey);

            if (!result.success) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor(cfg.colors.error)
                        .setTitle('❌ ShortXLinks Test Failed')
                        .setDescription(`**Error:** ${result.error}\n\nCheck that your API key is correct in \`/shortxlinks settings\`.`)
                    ]
                });
            }

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(cfg.colors.success)
                    .setTitle('✅ ShortXLinks Test Passed!')
                    .setDescription('A real verification link was created successfully.')
                    .addFields(
                        { name: '🔑 Test Key', value: `\`${testKey}\``, inline: false },
                        { name: '🔗 Short URL', value: `[Click to test](${result.shortUrl})`, inline: false },
                        { name: '📋 How It Works', value: '1. User clicks the short URL\n2. Completes 1 quick ad\n3. Redirected to landing page showing their key\n4. User copies & submits the key', inline: false }
                    )
                ]
            });
        }

        else if (sub === 'stats') {
            const claims = client.utils.loadJSON('claims.json');
            const stats = shortxlinksAPI.getStatistics(claims);
            const revenue = shortxlinksAPI.calculateRevenue(stats.successfulVerifications);

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(cfg.colors.info)
                    .setTitle('📊 ShortXLinks Statistics')
                    .addFields(
                        { name: 'Total Verifications', value: `${stats.totalVerifications}`, inline: true },
                        { name: 'Successful', value: `${stats.successfulVerifications} ✅`, inline: true },
                        { name: 'Failed/Expired', value: `${stats.failedVerifications} ❌`, inline: true },
                        { name: 'Completion Rate', value: `${stats.completionRate}%`, inline: true },
                        { name: 'Avg Time', value: `${stats.avgCompletionTime} min`, inline: true },
                        { name: 'Active Now', value: `${stats.activeVerifications}`, inline: true },
                        { name: '💰 Revenue Estimates', value: `Total: ~$${revenue.totalRevenue}\nPer completion: ~$${revenue.avgPerCompletion}\nMonthly projection: ~$${revenue.monthlyProjection}`, inline: false }
                    )
                    .setFooter({ text: `Key expiry: ${cfg.shortxlinks.keyExpiryMinutes} min` })
                    .setTimestamp()
                ],
                ephemeral: true
            });
        }

        else if (sub === 'active-keys') {
            const claims = client.utils.loadJSON('claims.json');
            const activeKeys = [];

            for (const [, claim] of Object.entries(claims)) {
                if (claim.verificationKey && !claim.verified && !shortxlinksAPI.isKeyExpired(claim.keyGeneratedAt)) {
                    const user = await client.users.fetch(claim.userId).catch(() => null);
                    const timeLeft = Math.floor((cfg.shortxlinks.keyExpiryMinutes * 60000 - (Date.now() - claim.keyGeneratedAt)) / 60000);
                    activeKeys.push(`**${user?.username || 'Unknown'}** — Key: \`${claim.verificationKey}\` — Expires in: ${timeLeft}m — Reward: ${claim.reward?.name}`);
                }
            }

            if (activeKeys.length === 0) {
                return interaction.reply({ content: '📝 No active verification keys right now.', ephemeral: true });
            }

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(cfg.colors.info)
                    .setTitle('🔑 Active Verification Keys')
                    .setDescription(activeKeys.slice(0, 15).join('\n'))
                    .setFooter({ text: `${activeKeys.length} active keys` })
                ],
                ephemeral: true
            });
        }

        else if (sub === 'manual-verify') {
            const user = interaction.options.getUser('user');
            const claims = client.utils.loadJSON('claims.json');
            let found = false;

            for (const [threadId, claim] of Object.entries(claims)) {
                if (claim.userId === user.id && !claim.verified) {
                    claim.verified = true;
                    claim.verifiedAt = Date.now();
                    claim.manuallyVerified = true;
                    claim.verifiedBy = interaction.user.id;
                    claims[threadId] = claim;
                    found = true;
                }
            }

            client.utils.saveJSON('claims.json', claims);
            console.log(`🔧 Manual verify: ${user.username} by ${interaction.user.username}`);

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(found ? cfg.colors.success : cfg.colors.warning)
                    .setTitle(found ? '✅ User Manually Verified' : '⚠️ No Active Claim Found')
                    .setDescription(found
                        ? `${user} has been verified (ShortXLinks bypassed).\nVerified by: ${interaction.user}`
                        : `No active unverified claim found for ${user}.`
                    )
                ],
                ephemeral: true
            });
        }

        else if (sub === 'cleanup') {
            const claims = client.utils.loadJSON('claims.json');
            const cleaned = shortxlinksAPI.cleanupExpiredClaims(claims);
            const removed = Object.keys(claims).length - Object.keys(cleaned).length;
            client.utils.saveJSON('claims.json', cleaned);

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(cfg.colors.success)
                    .setTitle('🗑️ Cleanup Complete')
                    .setDescription(`Removed **${removed}** expired verification claims.`)
                ],
                ephemeral: true
            });
        }
    }
};
