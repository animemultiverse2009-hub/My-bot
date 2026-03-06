const config = require('../config.json');

/**
 * PRODUCTION-READY INVITE TRACKER
 * Combines INVITRON architecture with multiple fallback methods
 * This is the ONLY invite tracker - delete any duplicates
 */
module.exports = {
    name: 'guildMemberAdd',
    async execute(member, client) {
        // Ignore bots
        if (member.user.bot) return;
        
        const guild = member.guild;
        
        try {
            console.log(`\n🔍 NEW MEMBER JOIN: ${member.user.tag}`);
            console.log(`┌────────────────────────────────────────────┐`);
            
            // STEP 1: Check if this is a REJOIN
            const rejoinData = await this.checkRejoin(member, guild, client);
            if (rejoinData) {
                await this.handleRejoin(member, guild, client, rejoinData);
                console.log(`└────────────────────────────────────────────┘\n`);
                return;
            }
            
            // STEP 2: Try multiple tracking methods in order of reliability
            let inviter = null;
            let trackingMethod = null;
            
            // METHOD 1: Invite snapshot comparison (most reliable when online)
            const snapshotResult = await this.trackByInviteSnapshot(member, guild, client);
            if (snapshotResult) {
                inviter = snapshotResult.inviter;
                trackingMethod = snapshotResult.method;
                console.log(`   ✅ Tracked via: ${trackingMethod}`);
            }
            
            // METHOD 2: Discord API metadata (backup)
            if (!inviter) {
                inviter = await this.trackByDiscordAPI(member, guild);
                if (inviter) {
                    trackingMethod = 'discord_api';
                    console.log(`   ✅ Tracked via: Discord API`);
                }
            }
            
            // METHOD 3: Audit logs (last resort)
            if (!inviter) {
                inviter = await this.trackByAuditLog(member, guild);
                if (inviter) {
                    trackingMethod = 'audit_log';
                    console.log(`   ✅ Tracked via: Audit Log`);
                }
            }
            
            // STEP 3: Handle the result
            if (inviter) {
                await this.recordInvite(member, inviter, guild, client, trackingMethod);
            } else {
                console.log(`   ⚠️  Could not determine inviter`);
                console.log(`   ℹ️  Possible reasons:`);
                console.log(`      - Discovery join`);
                console.log(`      - Widget join`);
                console.log(`      - Deleted invite`);
                console.log(`      - Bot just started`);
                await this.storeUntrackedJoin(member, client);
            }
            
            console.log(`└────────────────────────────────────────────┘\n`);
            
        } catch (error) {
            console.error(`❌ Error tracking invite for ${member.user.tag}:`, error);
        }
    },
    
    /**
     * METHOD 1: Track by comparing invite snapshots (INVITRON)
     */
    async trackByInviteSnapshot(member, guild, client) {
        try {
            // Get PREVIOUS snapshot
            const previousInvites = client.invites.get(guild.id);
            
            if (!previousInvites) {
                console.log(`   ℹ️  No cached snapshot (bot recently started)`);
                // Build cache for future joins
                await client.utils.rebuildInviteCache(guild);
                return null;
            }
            
            // Get CURRENT snapshot
            const currentInvites = await guild.invites.fetch({ cache: false });
            
            // Check regular invites for use increase
            for (const [code, currentInv] of currentInvites) {
                const previousInv = previousInvites.get(code);
                
                if (previousInv && currentInv.uses > previousInv.uses) {
                    console.log(`   📋 Invite Code: ${code}`);
                    console.log(`   📊 Uses: ${previousInv.uses} → ${currentInv.uses}`);
                    
                    // Update cache
                    await client.utils.updateInviteCache(guild, currentInvites);
                    
                    return {
                        inviter: currentInv.inviter,
                        method: 'invite_snapshot',
                        code: code
                    };
                }
            }
            
            // Check for newly created invites with uses
            for (const [code, newInv] of currentInvites) {
                if (!previousInvites.has(code) && newInv.uses > 0) {
                    console.log(`   📋 New Invite Code: ${code}`);
                    console.log(`   📊 Uses: ${newInv.uses}`);
                    
                    await client.utils.updateInviteCache(guild, currentInvites);
                    
                    return {
                        inviter: newInv.inviter,
                        method: 'new_invite',
                        code: code
                    };
                }
            }
            
            // Check VANITY URL
            if (guild.vanityURLCode) {
                const previousVanity = previousInvites.get(guild.vanityURLCode);
                const currentVanityUses = guild.vanityURLUses || 0;
                
                if (previousVanity && previousVanity.uses < currentVanityUses) {
                    console.log(`   🌟 Vanity URL: ${guild.vanityURLCode}`);
                    console.log(`   📊 Uses: ${previousVanity.uses} → ${currentVanityUses}`);
                    
                    await client.utils.updateInviteCache(guild, currentInvites);
                    
                    // Return guild as inviter for vanity
                    return {
                        inviter: { id: guild.id, tag: guild.name, isVanity: true },
                        method: 'vanity_url',
                        code: guild.vanityURLCode
                    };
                }
            }
            
            // Update cache even if no match
            await client.utils.updateInviteCache(guild, currentInvites);
            
            return null;
            
        } catch (error) {
            console.error(`   ❌ Snapshot method error:`, error.message);
            return null;
        }
    },
    
    /**
     * METHOD 2: Track by Discord API metadata
     */
    async trackByDiscordAPI(member, guild) {
        try {
            // Check if member object has inviter
            if (member.inviter) {
                return member.inviter;
            }
            
            // Try fetching fresh member data
            const freshMember = await guild.members.fetch({ 
                user: member.id, 
                force: true 
            });
            
            if (freshMember.inviter) {
                return freshMember.inviter;
            }
            
            return null;
            
        } catch (error) {
            console.error(`   ❌ API method error:`, error.message);
            return null;
        }
    },
    
    /**
     * METHOD 3: Track by audit logs
     */
    async trackByAuditLog(member, guild) {
        try {
            // Check permission
            if (!guild.members.me.permissions.has('ViewAuditLog')) {
                return null;
            }
            
            // Fetch recent audit logs
            const auditLogs = await guild.fetchAuditLogs({
                type: 20, // MEMBER_JOIN
                limit: 10
            });
            
            // Find entry for this member
            const joinEntry = auditLogs.entries.find(entry => 
                entry.target.id === member.id &&
                Date.now() - entry.createdTimestamp < 5000 // Within 5 seconds
            );
            
            if (joinEntry && joinEntry.executor) {
                return joinEntry.executor;
            }
            
            return null;
            
        } catch (error) {
            console.error(`   ❌ Audit log method error:`, error.message);
            return null;
        }
    },
    
    /**
     * Check if member is rejoining
     */
    async checkRejoin(member, guild, client) {
        const invites = client.utils.loadJSON('invites.json');
        
        for (const [inviterId, inviterData] of Object.entries(invites)) {
            const previousJoin = inviterData.invitedUsers.find(u => 
                u.userId === member.id && u.hasLeft === true
            );
            
            if (previousJoin) {
                return { inviterId, previousJoin };
            }
        }
        
        return null;
    },
    
    /**
     * Handle rejoin
     */
    async handleRejoin(member, guild, client, rejoinData) {
        const invites = client.utils.loadJSON('invites.json');
        const inviterData = invites[rejoinData.inviterId];
        
        // Reactivate the record
        const invitedUser = inviterData.invitedUsers.find(u => u.userId === member.id);
        if (invitedUser) {
            invitedUser.hasLeft = false;
            invitedUser.rejoinedAt = Date.now();
            invitedUser.rejoinCount = (invitedUser.rejoinCount || 0) + 1;
            inviterData.left = Math.max(0, inviterData.left - 1);
        }
        
        client.utils.saveJSON('invites.json', invites);
        
        console.log(`   🔄 REJOIN DETECTED`);
        console.log(`   👤 Member: ${member.user.tag}`);
        console.log(`   👥 Original Inviter: ${rejoinData.inviterId}`);
        console.log(`   ✅ Reactivated invite record`);
        console.log(`   🔢 Rejoin Count: ${invitedUser.rejoinCount || 1}`);
        
        // Update inviter stats
        await this.updateInviterStats(rejoinData.inviterId, guild, client);
    },
    
    /**
     * Record the invite
     */
    async recordInvite(member, inviter, guild, client, method) {
        const inviterId = inviter.id;
        const inviterData = client.utils.getUserInvites(inviterId);
        
        // Validate if fake account
        const accountAge = Date.now() - member.user.createdTimestamp;
        const dayInMs = 24 * 60 * 60 * 1000;
        const isFake = accountAge < (config.settings.fakeAccountDays * dayInMs);
        const accountAgeDays = Math.floor(accountAge / dayInMs);
        
        // Check if user has verified role
        const hasVerifiedRole = member.roles.cache.has(config.roles.verifiedMember);
        
        // APPEND new record (INVITRON: never update, only append)
        inviterData.total += 1;
        if (isFake) inviterData.fake += 1;
        if (hasVerifiedRole) inviterData.verified = (inviterData.verified || 0) + 1;
        
        inviterData.invitedUsers.push({
            userId: member.id,
            username: member.user.username,
            joinedAt: Date.now(),
            inviteCode: method === 'vanity_url' ? guild.vanityURLCode : 'tracked',
            isFake: isFake,
            hasLeft: false,
            isVerified: hasVerifiedRole,
            trackingMethod: method,
            accountAge: accountAgeDays
        });
        
        client.utils.setUserInvites(inviterId, inviterData);
        
        // Update inviter's stats and roles
        if (inviterId !== guild.id) {
            await this.updateInviterStats(inviterId, guild, client);
        }
        
        console.log(`├────────────────────────────────────────────┤`);
        console.log(`✅ INVITE SUCCESSFULLY TRACKED`);
        console.log(`├────────────────────────────────────────────┤`);
        console.log(`👤 Joined: ${member.user.tag} (${member.id})`);
        console.log(`👥 Inviter: ${inviter.tag} (${inviterId})`);
        console.log(`🔍 Method: ${method.toUpperCase()}`);
        console.log(`📅 Account Age: ${accountAgeDays} days`);
        console.log(`${isFake ? '⚠️  Status: FAKE ACCOUNT' : '✅ Status: VALID'}`);
        console.log(`🛡️  Verified: ${hasVerifiedRole ? 'Yes' : 'Not yet'}`);
        console.log(`📊 Inviter Stats:`);
        console.log(`   Total: ${inviterData.total}`);
        console.log(`   Verified: ${inviterData.verified || 0}`);
        console.log(`   Fake: ${inviterData.fake}`);
        console.log(`   Left: ${inviterData.left}`);
        console.log(`   Bonus: ${inviterData.bonus}`);
    },
    
    /**
     * Update inviter's stats and roles
     */
    async updateInviterStats(inviterId, guild, client) {
        try {
            const member = await guild.members.fetch(inviterId);
            const inviteData = client.utils.getUserInvites(inviterId);
            
            // Recalculate verified count
            const actualVerified = await client.utils.calculateVerifiedInvites(inviterId, guild);
            inviteData.verified = actualVerified;
            client.utils.setUserInvites(inviterId, inviteData);
            
            // Calculate valid invites (verified + bonus)
            const validInvites = inviteData.verified + inviteData.bonus;
            
            // Update reward roles
            const rewardRoles = config.rewards.map(r => ({
                roleId: r.roleId,
                required: r.invitesRequired
            }));
            
            for (const { roleId, required } of rewardRoles) {
                const hasRole = member.roles.cache.has(roleId);
                const qualifies = validInvites >= required;
                
                if (!hasRole && qualifies) {
                    const role = guild.roles.cache.get(roleId);
                    if (role) await member.roles.add(role);
                } else if (hasRole && !qualifies) {
                    const role = guild.roles.cache.get(roleId);
                    if (role) await member.roles.remove(role);
                }
            }
            
        } catch (error) {
            console.error(`Failed to update inviter stats:`, error.message);
        }
    },
    
    /**
     * Store untracked join for later resolution
     */
    async storeUntrackedJoin(member, client) {
        const untracked = client.utils.loadJSON('untracked.json') || {};
        
        untracked[member.id] = {
            userId: member.id,
            username: member.user.username,
            guildId: member.guild.id,
            joinedAt: Date.now(),
            accountCreated: member.user.createdTimestamp
        };
        
        client.utils.saveJSON('untracked.json', untracked);
    }
};