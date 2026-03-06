const axios = require('axios');
const config = require('../config.json');

/**
 * ShortXLinks API Handler
 * Replaces Lootlabs. Users click a shortened link → complete 1 quick ad → see their verification key.
 * Much simpler than Lootlabs (1 step vs 5 tasks) = higher completion rate = more earnings.
 */
class ShortXLinksAPI {

    get apiKey() {
        // Always read from config so live updates via /shortxlinks set-api-key work
        return require('../config.json').shortxlinks.apiKey;
    }

    get expiryMinutes() {
        return require('../config.json').shortxlinks.keyExpiryMinutes || 30;
    }

    get landingPage() {
        return require('../config.json').shortxlinks.landingPage
            || 'https://verificationweb.github.io/discord-verification/verify.html';
    }

    /**
     * Shorten a URL via ShortXLinks API
     */
    async shortenURL(url) {
        try {
            const response = await axios.get('https://shortxlinks.com/api', {
                params: {
                    api: this.apiKey,
                    url: url,
                    format: 'json'
                },
                timeout: 10000
            });

            const data = response.data;

            // Handle various success response shapes
            if (data.status === 'success' || data.shortenedUrl || data.short_url) {
                return {
                    success: true,
                    shortUrl: data.shortenedUrl || data.short_url || data.url
                };
            }

            return {
                success: false,
                error: data.message || data.error || 'API returned no URL'
            };

        } catch (error) {
            console.error('ShortXLinks API Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    /**
     * Generate a unique formatted verification key  e.g. ABCD-EFGH-IJKL-MNOP
     */
    generateVerificationKey(length = 16) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let key = '';
        for (let i = 0; i < length; i++) {
            if (i > 0 && i % 4 === 0) key += '-';
            key += chars[Math.floor(Math.random() * chars.length)];
        }
        return key;
    }

    /**
     * Check if a key has expired
     */
    isKeyExpired(keyGeneratedAt) {
        return Date.now() - keyGeneratedAt > this.expiryMinutes * 60000;
    }

    /**
     * Create a complete verification link for a user
     * Returns the shortened URL that the user clicks to see their key
     */
    async createVerificationLink(username, verificationKey) {
        // Landing page URL - after completing ad, user is redirected here and sees their key
        const landingURL = `${this.landingPage}?key=${encodeURIComponent(verificationKey)}`;

        const result = await this.shortenURL(landingURL);

        if (!result.success) {
            console.error(`❌ ShortXLinks failed for ${username}: ${result.error}`);
            return { success: false, error: result.error };
        }

        console.log(`✅ ShortXLinks verification link created`);
        console.log(`   User: ${username} | Key: ${verificationKey}`);
        console.log(`   Short URL: ${result.shortUrl}`);

        return {
            success: true,
            shortUrl: result.shortUrl,
            landingUrl: landingURL,
            key: verificationKey
        };
    }

    /**
     * Clean up expired claims from claims data
     */
    cleanupExpiredClaims(claims) {
        const cleaned = {};
        let expiredCount = 0;

        for (const [threadId, claim] of Object.entries(claims)) {
            if (claim.verificationKey && !claim.verified && this.isKeyExpired(claim.keyGeneratedAt)) {
                expiredCount++;
                continue;
            }
            cleaned[threadId] = claim;
        }

        if (expiredCount > 0) {
            console.log(`🗑️ Cleaned ${expiredCount} expired verification claims`);
        }

        return cleaned;
    }

    /**
     * Get verification statistics from claims data
     */
    getStatistics(claims) {
        let total = 0, successful = 0, failed = 0, totalTime = 0, timeCount = 0;

        for (const claim of Object.values(claims)) {
            if (!claim.verificationKey) continue;
            total++;
            if (claim.verified) {
                successful++;
                if (claim.verifiedAt && claim.keyGeneratedAt) {
                    totalTime += claim.verifiedAt - claim.keyGeneratedAt;
                    timeCount++;
                }
            } else if (this.isKeyExpired(claim.keyGeneratedAt)) {
                failed++;
            }
        }

        return {
            totalVerifications: total,
            successfulVerifications: successful,
            failedVerifications: failed,
            completionRate: total > 0 ? Math.round((successful / total) * 100) : 0,
            avgCompletionTime: timeCount > 0 ? Math.round(totalTime / timeCount / 60000) : 0,
            activeVerifications: total - successful - failed
        };
    }

    /**
     * Estimate revenue - ShortXLinks pays per unique visit through shortened link
     */
    calculateRevenue(completions) {
        // ShortXLinks typical rates (varies by region)
        const rates = { tier1: 2.50, tier2: 1.20, tier3: 0.50 };
        const distribution = { tier1: 0.35, tier2: 0.30, tier3: 0.35 };
        const avgRate = (rates.tier1 * distribution.tier1) + (rates.tier2 * distribution.tier2) + (rates.tier3 * distribution.tier3);

        return {
            totalRevenue: parseFloat((completions * avgRate).toFixed(2)),
            avgPerCompletion: parseFloat(avgRate.toFixed(2)),
            dailyAverage: parseFloat((completions / 30).toFixed(1)),
            monthlyProjection: parseFloat(((completions / 30) * 30 * avgRate).toFixed(2)),
            rates
        };
    }
}

module.exports = new ShortXLinksAPI();
