const {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
    PermissionFlagsBits, MessageFlags
} = require('discord.js');
const BotUtils = require('../utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Setup invite reward system messages')
        .addStringOption(o => o.setName('type').setDescription('Which message to setup').setRequired(true)
            .addChoices(
                { name: 'Check Invites',  value: 'check_invites'  },
                { name: 'How to Invite',  value: 'how_to_invite'  },
                { name: 'Invite Rewards', value: 'invite_rewards' },
                { name: 'Boost Prizes',   value: 'boost_prizes'   }
            ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const type = interaction.options.getString('type');

        // Always fresh-read config so /config changes take effect instantly
        const cfg = require('../config.json');
        const e = cfg.emojis, r = cfg.roles, ch = cfg.channels;

        try {
            // ── Check Invites ─────────────────────────────────────────────
            if (type === 'check_invites') {
                const embed = new EmbedBuilder()
                    .setColor(cfg.colors.primary)
                    .setTitle(`${e.guide} **Check your invites:**`)
                    .setDescription(
                        '> **Click** the button below to check your invites!\n' +
                        '> The people you invite **must** join the server for your invite to count.'
                    );
                if (cfg.images?.checkInvitesBanner) embed.setImage(cfg.images.checkInvitesBanner);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('check_invites')
                        .setLabel('Check Invites')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(BotUtils.parseEmoji(e.checkInvite))
                );
                await interaction.channel.send({ embeds: [embed], components: [row] });
                return interaction.editReply({ content: '✅ Check Invites message sent!' });
            }

            // ── How to Invite ─────────────────────────────────────────────
            if (type === 'how_to_invite') {
                const embed = new EmbedBuilder()
                    .setColor(cfg.colors.primary)
                    .setDescription(
                        `# ${e.link} __CREATE INVITE__ ${e.link}\n\n` +
                        `> * **Choose** the platform you're currently using.\n` +
                        `> * Discover the EASIEST and QUICKEST method by clicking **How To Invite More Quickly**`
                    );
                const select = new StringSelectMenuBuilder()
                    .setCustomId('platform_select')
                    .setPlaceholder('Pick Your Platform')
                    .addOptions([
                        { label: "I'm on Mobile",  value: 'mobile',  emoji: BotUtils.parseEmoji(e.mobile)  },
                        { label: "I'm on Desktop", value: 'desktop', emoji: BotUtils.parseEmoji(e.desktop) }
                    ]);
                await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
                return interaction.editReply({ content: '✅ How to Invite message sent!' });
            }

            // ── Invite Rewards ────────────────────────────────────────────
            if (type === 'invite_rewards') {
                const bluelines = e.blueline.repeat ? e.blueline.repeat(8) : e.blueline + e.blueline + e.blueline + e.blueline + e.blueline + e.blueline + e.blueline + e.blueline;
                const description =
                    `# ${e.giftbox}  __Limited-Time Event__ ${e.giftbox}\n\n` +
                    `${e.clock}  This is a **LIMITED-TIME** event until **<t:${cfg.event.endTimestamp}:D>**. Don't miss out and __start inviting now!__\n\n` +
                    `${e.ourRewards1}${e.ourRewards2}${e.ourRewards3}${e.ourRewards4}${e.ourRewards5}${e.ourRewards6}${bluelines}\n` +
                    `${e.barrow} <@&${r['3invites']}> \`=\` **Discord Nitro Basic \`(1 month)\`** ${e.nitrobasic1}\n` +
                    `${e.barrow} <@&${r['6invites']}> \`=\` **Discord Nitro Boost \`(1 month)\`** ${e.nitroboost}\n` +
                    `${e.barrow} <@&${r['9invites']}> \`=\` **Discord Nitro Basic \`(1 year)\`** ${e.nitrobasic}\n` +
                    `${e.barrow} <@&${r['12invites']}> \`=\` **Discord Nitro Boost \`(1 year)\`** ${e.nitroytearl}\n\n` +
                    `${e.yarrow} <@&${r['3invites']}> \`=\` **450 Robux** ${e.robux}\n` +
                    `${e.yarrow} <@&${r['6invites']}> \`=\` **1,500 Robux** ${e.probux}\n` +
                    `${e.yarrow} <@&${r['12invites']}> \`=\` **4,500 Robux** ${e.grobux}\n\n` +
                    `${e.notice1}${e.notice2}${e.notice3}${e.notice4}${bluelines}${e.blueline}\n` +
                    `${e.bluepin} **Note:** Inviting alts/bot accounts will get you **banned**.\n` +
                    `${e.bluepin} **Note:** Failure to follow **[Discord's Terms of Service](https://discord.com/terms)** may result in __removal__ from the event.\n` +
                    `${e.bluereply} Check <#${ch.howToInvite}> and click on "How To Invite More Quickly" for the fastest method! ${e.guide}\n\n` +
                    `${e.mail} \`READY TO CLAIM?\` Once you've reached the required invites, click the button below! ${e.giftbox}`;

                const embed = new EmbedBuilder().setColor(cfg.colors.primary).setDescription(description);
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('claim_rewards')
                        .setLabel('Claim Rewards')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(BotUtils.parseEmoji(e.tada))
                );
                await interaction.channel.send({ embeds: [embed], components: [row] });
                return interaction.editReply({ content: '✅ Invite Rewards message sent!' });
            }

            // ── Boost Prizes ──────────────────────────────────────────────
            if (type === 'boost_prizes') {
                const bluelines = e.blueline + e.blueline + e.blueline + e.blueline + e.blueline + e.blueline + e.blueline + e.blueline;
                const description =
                    `# ${e.giftbox}  __BOOST PRIZES__ ${e.giftbox}\n\n` +
                    `${e.clock}  This is a **LIMITED-TIME** event until **<t:${cfg.event.endTimestamp}:D>**. Boost and claim exclusive rewards.\n\n` +
                    `${e.ourRewards1}${e.ourRewards2}${e.ourRewards3}${e.ourRewards4}${e.ourRewards5}${e.ourRewards6}${bluelines}\n` +
                    `${e.animatedarrow} <@&${r.boost1x}> \`=\` **Nitro Basic Yearly + 1500 Robux** ${e.boost}\n` +
                    `${e.animatedarrow} <@&${r.boost2x}>  \`=\` **Nitro Boost Yearly + 4500 Robux** ${e.boost}\n\n` +
                    `${e.notice1}${e.notice2}${e.notice3}${e.notice4}${bluelines}${e.blueline}\n` +
                    `${e.bluepin} **Note:** Only boosters can claim these rewards.\n` +
                    `${e.bluepin} **Note:** Failure to follow **[Discord's Terms of Service](https://discord.com/terms)** may result in __removal__ from the event.\n\n` +
                    `${e.mail} \`READY TO CLAIM?\` Once you've boosted the server, click the button below! ${e.giftbox}`;

                const embed = new EmbedBuilder().setColor(cfg.colors.primary).setDescription(description);
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('claim_boost_rewards')
                        .setLabel('Claim Boost Rewards')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(BotUtils.parseEmoji(e.tada))
                );
                await interaction.channel.send({ embeds: [embed], components: [row] });
                return interaction.editReply({ content: '✅ Boost Prizes message sent!' });
            }

        } catch (error) {
            console.error(`\n❌ /setup [${type}] FAILED`);
            console.error(`   Error: ${error.message}`);
            console.error(`   Code:  ${error.code || 'none'}`);
            if (error.code === 50035) {
                console.error(`   Hint:  If emoji error → run: node migrate-emojis.js`);
                console.error(`   Hint:  If other form error → check channel permissions`);
            }

            const msg = error.code === 50013
                ? '❌ Missing permissions — bot needs **Send Messages** + **Embed Links** in this channel.'
                : error.code === 50035 && error.message.includes('emoji')
                ? '❌ Emoji not owned by this app. Run `node migrate-emojis.js` once to fix permanently.'
                : `❌ Error \`${error.code || ''}\`: ${error.message}`;

            return interaction.editReply({ content: msg }).catch(() => {});
        }
    }
};
