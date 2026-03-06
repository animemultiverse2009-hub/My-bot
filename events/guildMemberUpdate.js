const config = require('../config.json');

/**
 * COMPLETE GUILD MEMBER UPDATE HANDLER
 * Place in: events/guildMemberUpdate.js
 * 
 * Handles:
 * - Verified role changes (updates invite stats)
 * - Boost role auto-assignment (1x and 2x)
 * - Boost role removal when users stop boosting
 */
module.exports = {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember, client) {
        
        // ========================================
        // VERIFIED ROLE CHANGES
        // ========================================
        
        const verifiedRoleId = config.roles.verifiedMember;
        const hadVerifiedRole = oldMember.roles.cache.has(verifiedRoleId);
        const hasVerifiedRole = newMember.roles.cache.has(verifiedRoleId);
        
        // User just got verified role
        if (!hadVerifiedRole && hasVerifiedRole) {
            console.log(`\n🛡️ VERIFIED ROLE ASSIGNED`);
            console.log(`┌────────────────────────────────────────────┐`);
            console.log(`👤 User: ${newMember.user.tag}`);
            console.log(`✅ Status: Now Verified`);
            
            // Update all inviters who invited this user
            const invites = client.utils.loadJSON('invites.json');
            let updated = false;
            
            for (const [inviterId, inviteData] of Object.entries(invites)) {
                const invitedUser = inviteData.invitedUsers.find(u => u.userId === newMember.id);
                
                if (invitedUser && !invitedUser.isVerified) {
                    invitedUser.isVerified = true;
                    inviteData.verified = (inviteData.verified || 0) + 1;
                    client.utils.setUserInvites(inviterId, inviteData);
                    updated = true;
                    
                    console.log(`📊 Updated inviter: ${inviterId}`);
                    console.log(`   Verified count: ${inviteData.verified}`);
                    
                    // Update inviter's roles based on new verified count
                    try {
                        const guild = newMember.guild;
                        const inviterMember = await guild.members.fetch(inviterId);
                        const validInvites = inviteData.verified + inviteData.bonus;
                        
                        // Check and assign reward roles
                        for (const reward of config.rewards) {
                            if (validInvites >= reward.invitesRequired) {
                                const role = guild.roles.cache.get(reward.roleId);
                                if (role && !inviterMember.roles.cache.has(reward.roleId)) {
                                    await inviterMember.roles.add(role);
                                    console.log(`   ✅ Assigned ${role.name} to inviter`);
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`   ❌ Failed to update inviter roles:`, error.message);
                    }
                }
            }
            
            if (updated) {
                console.log(`✅ Invite data updated`);
            } else {
                console.log(`ℹ️ No matching invite found`);
            }
            console.log(`└────────────────────────────────────────────┘\n`);
        }
        
        // User lost verified role
        if (hadVerifiedRole && !hasVerifiedRole) {
            console.log(`\n⚠️ VERIFIED ROLE REMOVED`);
            console.log(`┌────────────────────────────────────────────┐`);
            console.log(`👤 User: ${newMember.user.tag}`);
            console.log(`❌ Status: No Longer Verified`);
            
            // Update all inviters who invited this user
            const invites = client.utils.loadJSON('invites.json');
            let updated = false;
            
            for (const [inviterId, inviteData] of Object.entries(invites)) {
                const invitedUser = inviteData.invitedUsers.find(u => u.userId === newMember.id);
                
                if (invitedUser && invitedUser.isVerified) {
                    invitedUser.isVerified = false;
                    inviteData.verified = Math.max(0, (inviteData.verified || 0) - 1);
                    client.utils.setUserInvites(inviterId, inviteData);
                    updated = true;
                    
                    console.log(`📊 Updated inviter: ${inviterId}`);
                    console.log(`   Verified count: ${inviteData.verified}`);
                    
                    // Remove reward roles if user no longer qualifies
                    try {
                        const guild = newMember.guild;
                        const inviterMember = await guild.members.fetch(inviterId);
                        const validInvites = inviteData.verified + inviteData.bonus;
                        
                        // Check and remove reward roles
                        for (const reward of config.rewards) {
                            if (validInvites < reward.invitesRequired) {
                                const role = guild.roles.cache.get(reward.roleId);
                                if (role && inviterMember.roles.cache.has(reward.roleId)) {
                                    await inviterMember.roles.remove(role);
                                    console.log(`   ➖ Removed ${role.name} from inviter`);
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`   ❌ Failed to update inviter roles:`, error.message);
                    }
                }
            }
            
            if (updated) {
                console.log(`✅ Invite data updated`);
            } else {
                console.log(`ℹ️ No matching invite found`);
            }
            console.log(`└────────────────────────────────────────────┘\n`);
        }
        
        // ========================================
        // BOOST STATUS CHANGES
        // ========================================
        
        const oldBoostStatus = oldMember.premiumSince;
        const newBoostStatus = newMember.premiumSince;
        
        // User just started boosting
        if (!oldBoostStatus && newBoostStatus) {
            try {
                // Assign 1x boost role
                const boost1xRole = newMember.guild.roles.cache.get(config.roles.boost1x);
                if (boost1xRole && !newMember.roles.cache.has(config.roles.boost1x)) {
                    await newMember.roles.add(boost1xRole);
                    console.log(`\n🚀 BOOST STARTED`);
                    console.log(`✅ Assigned 1x Boost role to ${newMember.user.tag}\n`);
                }
            } catch (error) {
                console.error(`Failed to assign boost role:`, error);
            }
        }
        
        // User stopped boosting
        if (oldBoostStatus && !newBoostStatus) {
            try {
                // Remove boost roles
                const boost1xRole = newMember.guild.roles.cache.get(config.roles.boost1x);
                const boost2xRole = newMember.guild.roles.cache.get(config.roles.boost2x);
                
                if (boost1xRole && newMember.roles.cache.has(config.roles.boost1x)) {
                    await newMember.roles.remove(boost1xRole);
                }
                
                if (boost2xRole && newMember.roles.cache.has(config.roles.boost2x)) {
                    await newMember.roles.remove(boost2xRole);
                }
                
                console.log(`\n⬇️ BOOST STOPPED`);
                console.log(`➖ Removed boost roles from ${newMember.user.tag}\n`);
            } catch (error) {
                console.error(`Failed to remove boost roles:`, error);
            }
        }
    }
};