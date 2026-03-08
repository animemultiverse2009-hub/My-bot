const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const BotUtils = require('../utils');

module.exports = {
    async execute(interaction, client) {
        const guildId  = interaction.guild.id;
        const cfg      = BotUtils.loadGuildConfig(guildId);
        const rewardId = interaction.values[0];
        const reward   = cfg.rewards.find(r => r.id === rewardId);

        if (!reward) return interaction.editReply({ content: '❌ Invalid reward.' });

        const userId = interaction.user.id;
        const guild  = interaction.guild;

        try {
            const verifiedCount = await BotUtils.updateVerifiedCount(userId, guild);
            const inviteData    = BotUtils.getUserInvites(userId, guildId);
            const validInvites  = verifiedCount + inviteData.bonus;

            console.log(`📊 selectReward — ${interaction.user.username}: ${validInvites} valid | needs ${reward.invitesRequired} for ${reward.name}`);

            if (validInvites < reward.invitesRequired) {
                const embed = new EmbedBuilder()
                    .setColor(cfg.colors.error)
                    .setTitle('Not Enough Invites!')
                    .setDescription(
                        `<:rdot:1457606081621791025> You need \`${reward.invitesRequired}\` invites for **__${reward.name}__**\n` +
                        `<:rdot:1457606081621791025> You have \`${validInvites}\` invites.\n\n` +
                        `>>> <:Rarrow:1448657655068491897> Click __"Pro Tip"__ to get invites faster!\n` +
                        `<:Rarrow:1448657655068491897> Click __"Verification"__ for exclusive rewards!`
                    )
                    .setThumbnail(cfg.images.boostErrorIcon);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setLabel('Verification').setStyle(ButtonStyle.Link).setURL(cfg.messages.verificationURL).setEmoji(BotUtils.parseEmoji(cfg.emojis.verification)),
                    new ButtonBuilder().setLabel('Pro Tip').setStyle(ButtonStyle.Secondary).setCustomId('pro_tip').setEmoji(BotUtils.parseEmoji(cfg.emojis.bluepin))
                );
                return interaction.editReply({ embeds: [embed], components: [row] });
            }

            const embed = new EmbedBuilder()
                .setColor(cfg.colors.info)
                .setTitle(`${cfg.emojis.notification} Confirmation`)
                .setDescription(
                    `${cfg.emojis.barrow} Claim **${reward.name}** using **${reward.invitesRequired} invites**?\n\n` +
                    `${cfg.emojis.barrow} Consider saving up to 12 invites for the best reward!`
                )
                .setThumbnail(cfg.images.confirmationIcon);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`confirm_claim_${rewardId}`).setLabel('Yes, continue').setStyle(ButtonStyle.Success).setEmoji(BotUtils.parseEmoji(cfg.emojis.wtick)),
                new ButtonBuilder().setCustomId(`cancel_claim_${rewardId}`).setLabel('No, cancel').setStyle(ButtonStyle.Danger).setEmoji(BotUtils.parseEmoji(cfg.emojis.wcross))
            );

            await interaction.editReply({ embeds: [embed], components: [row] });

        } catch (error) {
            console.error(`❌ selectReward: ${error.message} (${error.code})`);
            if (error.code === 50035) console.error('   Hint: Emoji error — run: node migrate-emojis.js');
            interaction.editReply({ content: `❌ Error: \`${error.message}\``, embeds: [], components: [] }).catch(() => {});
        }
    }
};
