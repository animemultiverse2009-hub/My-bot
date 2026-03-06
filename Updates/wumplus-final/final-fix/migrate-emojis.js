/**
 * EMOJI MIGRATION SCRIPT
 * Run ONCE with: node migrate-emojis.js
 * 
 * What it does:
 *   1. Reads every custom emoji from config.json
 *   2. Downloads the image from Discord CDN using the emoji ID
 *   3. Uploads it to your bot's Application Emojis
 *      (works in EVERY server, no cross-server restrictions)
 *   4. Saves a new config.json with the updated IDs
 * 
 * After running, delete this file. You only need it once.
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ── Config ────────────────────────────────────────────────────────────────────
const TOKEN     = require('./config.json').token;
const CLIENT_ID = require('./config.json').clientId;
const CONFIG_PATH = path.join(__dirname, 'config.json');
// ─────────────────────────────────────────────────────────────────────────────

/** Download a URL and return as a Buffer */
function download(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                return download(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

/** Call the Discord API */
async function discordAPI(method, endpoint, body = null) {
    const url = `https://discord.com/api/v10${endpoint}`;
    const options = {
        method,
        headers: {
            'Authorization': `Bot ${TOKEN}`,
            'Content-Type': 'application/json',
            'User-Agent': 'WumplusBot/1.0'
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(url, options, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        reject(new Error(`API ${res.statusCode}: ${JSON.stringify(parsed)}`));
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(new Error(`Parse error: ${data}`));
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

/** Upload one emoji to application emojis */
async function uploadAppEmoji(name, imageBuffer, animated) {
    const mimeType = animated ? 'image/gif' : 'image/png';
    const base64   = imageBuffer.toString('base64');
    const dataUri  = `data:${mimeType};base64,${base64}`;

    return discordAPI('POST', `/applications/${CLIENT_ID}/emojis`, {
        name,
        image: dataUri
    });
}

/** Get existing application emojis so we skip duplicates */
async function getExistingAppEmojis() {
    try {
        const res = await discordAPI('GET', `/applications/${CLIENT_ID}/emojis`);
        return res.items || [];
    } catch {
        return [];
    }
}

/** Sleep helper for rate limiting */
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🚀 Wumplus Emoji Migration');
    console.log('══════════════════════════════════════════\n');

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

    // Extract all custom emoji entries from config
    const entries = [];
    for (const [key, val] of Object.entries(config.emojis)) {
        if (typeof val !== 'string' || !val.includes('<')) continue;
        const m = val.match(/<(a?):([^:]+):(\d+)>/);
        if (!m) continue;
        entries.push({
            configKey:  key,
            name:       m[2],
            id:         m[3],
            animated:   m[1] === 'a',
            original:   val
        });
    }

    console.log(`📋 Found ${entries.length} custom emojis in config.json\n`);

    // Get already-uploaded app emojis
    console.log('🔍 Fetching existing application emojis...');
    const existing = await getExistingAppEmojis();
    const existingMap = new Map(existing.map(e => [e.name, e]));
    console.log(`   ${existing.length} already uploaded\n`);

    // Process each emoji
    let succeeded = 0, skipped = 0, failed = 0;
    const updates = {}; // configKey → new emoji string

    for (let i = 0; i < entries.length; i++) {
        const { configKey, name, id, animated, original } = entries[i];
        const num = `[${i + 1}/${entries.length}]`;

        // Already uploaded?
        if (existingMap.has(name)) {
            const existing_emoji = existingMap.get(name);
            const prefix = animated ? 'a' : '';
            const newString = `<${prefix}:${name}:${existing_emoji.id}>`;
            updates[configKey] = newString;
            console.log(`⏭️  ${num} SKIP (already exists): ${name} → ${existing_emoji.id}`);
            skipped++;
            continue;
        }

        // Download from CDN
        const ext  = animated ? 'gif' : 'png';
        const cdnUrl = `https://cdn.discordapp.com/emojis/${id}.${ext}`;

        let imageBuffer;
        try {
            imageBuffer = await download(cdnUrl);
        } catch (err) {
            console.error(`❌ ${num} FAIL download: ${name} (${err.message})`);
            failed++;
            continue;
        }

        // Upload to application
        try {
            const result = await uploadAppEmoji(name, imageBuffer, animated);
            const prefix = animated ? 'a' : '';
            const newString = `<${prefix}:${name}:${result.id}>`;
            updates[configKey] = newString;
            console.log(`✅ ${num} UPLOADED: ${name} → new ID: ${result.id}`);
            succeeded++;
        } catch (err) {
            console.error(`❌ ${num} FAIL upload: ${name} (${err.message})`);
            // Keep original if upload fails
            failed++;
        }

        // Rate limit: 1 upload per second to avoid 429s
        if (i < entries.length - 1) await sleep(1100);
    }

    // Apply all updates to config
    for (const [key, newVal] of Object.entries(updates)) {
        config.emojis[key] = newVal;
    }

    // Write updated config
    const backupPath = CONFIG_PATH + '.before-emoji-migration';
    fs.copyFileSync(CONFIG_PATH, backupPath);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4));

    console.log('\n══════════════════════════════════════════');
    console.log('✅ MIGRATION COMPLETE');
    console.log(`   Uploaded:  ${succeeded}`);
    console.log(`   Skipped:   ${skipped} (already existed)`);
    console.log(`   Failed:    ${failed}`);
    console.log(`\n📄 config.json updated with new emoji IDs`);
    console.log(`💾 Backup saved to: config.json.before-emoji-migration`);
    console.log('\n🔥 Now restart your bot. All emojis will work in every server!');
    console.log('══════════════════════════════════════════\n');
}

main().catch(err => {
    console.error('\n💥 FATAL ERROR:', err.message);
    process.exit(1);
});
