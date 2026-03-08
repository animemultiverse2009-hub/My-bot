const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const BotUtils = require('../utils');

class RandomPayoutSystem {
    constructor(client) {
        this.client = client;
        this.isRunning = false;
        this.currentTimer = null;
    }

    start() {
        if (this.isRunning) { console.log('⚠️ Random payout system already running'); return; }
        this.isRunning = true;
        const cfg = require('../config.json');
        console.log('🎰 Random Payout System STARTED');
        console.log(`📢 Sending payouts every ${cfg.randomPayouts?.minMinutes || 1}–${cfg.randomPayouts?.maxMinutes || 10} minutes`);
        this.scheduleNextPayout();
    }

    stop() {
        this.isRunning = false;
        if (this.currentTimer) { clearTimeout(this.currentTimer); this.currentTimer = null; }
        console.log('🛑 Random Payout System STOPPED');
    }

    scheduleNextPayout() {
        if (!this.isRunning) return;
        const cfg = require('../config.json');
        const min = cfg.randomPayouts?.minMinutes || 1;
        const max = cfg.randomPayouts?.maxMinutes || 10;
        const minutes = Math.random() * (max - min) + min;
        console.log(`⏰ Next random payout in ${minutes.toFixed(2)} minutes`);
        this.currentTimer = setTimeout(async () => {
            await this.sendRandomPayout();
            this.scheduleNextPayout();
        }, minutes * 60 * 1000);
    }

    selectRandomReward() {
        const cfg = require('../config.json');
        const weights = cfg.randomPayouts?.rarityWeights || { 3: 40, 6: 30, 9: 20, 12: 10 };
        const pool = [];
        for (const reward of cfg.rewards) {
            const w = weights[reward.invitesRequired] || 10;
            for (let i = 0; i < w; i++) pool.push(reward);
        }
        return pool[Math.floor(Math.random() * pool.length)];
    }

    async sendRandomPayout() {
        const cfg = require('../config.json');

        // ── Guild check ───────────────────────────────────────────────────
        const guild = this.client.guilds.cache.get(cfg.guildId);
        if (!guild) {
            console.error(`\n❌ RANDOM PAYOUT FAILED: Guild ${cfg.guildId} not in cache`);
            console.error(`   Bot is in: ${[...this.client.guilds.cache.values()].map(g => `${g.name} (${g.id})`).join(', ')}`);
            console.error(`   Fix: Update guildId in config.json to match one of the above\n`);
            return;
        }

        // ── Channel check ─────────────────────────────────────────────────
        let vouchChannel;
        try {
            vouchChannel = await this.client.channels.fetch(cfg.channels.vouchPayments);
        } catch (err) {
            console.error(`\n❌ RANDOM PAYOUT FAILED: Can't fetch channel ${cfg.channels.vouchPayments}`);
            console.error(`   Code: ${err.code} — ${err.message}`);
            if (err.code === 10003) console.error(`   Fix: Update channels.vouchPayments in config.json`);
            if (err.code === 50001) console.error(`   Fix: Bot needs access to that channel`);
            console.error('');
            return;
        }

        try {
            const reward = this.selectRandomReward();
            const rewardName = reward?.displayName || reward?.name || 'a reward';
            const invitesRequired = reward?.invitesRequired || 0;
            const embedColor = reward?.embedColor || cfg.colors?.success || '#00FF00';

            let description = '';
            if (reward.type === 'nitro') {
                description =
                    `A member has successfully claimed **${rewardName}** for \`${reward.duration}\` ` +
                    `by inviting \`${invitesRequired}\` **verified friends** ${cfg.emojis.giftbox}\n` +
                    `You can also claim your reward by __inviting__ your **friends**! ${cfg.emojis.tada}\n\n` +
                    `> Click on __"Verification"__ **To Verify Yourself** and have access to **exclusive prizes & rewards!**`;
            } else if (reward.type === 'robux') {
                description =
                    `A member has successfully earned **${reward.amount}** Robux ` +
                    `by inviting \`${invitesRequired}\` **verified friends** ${cfg.emojis.giftbox}\n` +
                    `You can also claim your reward by __inviting__ your **friends**! ${cfg.emojis.tada}\n\n` +
                    `> Click on __"Verification"__ **To Verify Yourself** and have access to **exclusive prizes & rewards!**`;
            }

            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle('__Congratulations!__')
                .setDescription(description);

            if (reward.payoutImage) embed.setImage(reward.payoutImage);
            if (reward.payoutIcon)  embed.setThumbnail(reward.payoutIcon);

            // After migrate-emojis.js, these will use app-owned emoji IDs
            // and work in every server without COMPONENT_INVALID_EMOJI
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Claim Rewards')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://discord.com/channels/${cfg.guildId}/${cfg.channels.inviteReward}`)
                    .setEmoji(BotUtils.parseEmoji(cfg.emojis.tada)),
                new ButtonBuilder()
                    .setLabel('Verification')
                    .setStyle(ButtonStyle.Link)
                    .setURL(cfg.messages.verificationURL)
                    .setEmoji(BotUtils.parseEmoji(cfg.emojis.verification))
            );

            await vouchChannel.send({ embeds: [embed], components: [row] });

            console.log(`\n🎰 RANDOM PAYOUT SENT — ${rewardName} (${invitesRequired} invites tier) → #${vouchChannel.name}\n`);

        } catch (error) {
            console.error(`\n❌ RANDOM PAYOUT FAILED`);
            console.error(`   Error:   ${error.message}`);
            console.error(`   Code:    ${error.code || 'none'}`);
            if (error.code === 50035) {
                if (error.message.includes('emoji')) {
                    console.error(`   Cause:   Custom emoji rejected by Discord API`);
                    console.error(`   Fix:     Run "node migrate-emojis.js" once to upload emojis to your app`);
                } else {
                    console.error(`   Cause:   Invalid form body — check embed fields`);
                }
            } else if (error.code === 50013) {
                console.error(`   Cause:   Bot missing permissions in #${vouchChannel?.name}`);
                console.error(`   Fix:     Give bot Send Messages + Embed Links in that channel`);
            }
            console.error('');
        }
    }

    getStats() {
        return { isRunning: this.isRunning, nextPayoutScheduled: this.currentTimer !== null };
    }
}

module.exports = RandomPayoutSystem;
