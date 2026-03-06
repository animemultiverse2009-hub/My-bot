module.exports = {
    name: 'inviteCreate',
    async execute(invite, client) {
        // Ignore bot-created invites
        if (invite.inviter?.bot) return;
        
        const guild = invite.guild;
        
        try {
            // INVITRON ARCHITECTURE: Update cache in real-time
            const guildCache = client.invites.get(guild.id);
            
            if (guildCache) {
                guildCache.set(invite.code, {
                    inviterId: invite.inviter?.id,
                    uses: invite.uses || 0
                });
                
                console.log(`➕ Invite created: ${invite.code} by ${invite.inviter?.tag || 'Unknown'}`);
            } else {
                // Cache doesn't exist, rebuild it
                await client.utils.rebuildInviteCache(guild);
                console.log(`📊 Cache rebuilt after invite creation: ${invite.code}`);
            }
            
        } catch (error) {
            console.error('Error handling invite create:', error);
        }
    }
};