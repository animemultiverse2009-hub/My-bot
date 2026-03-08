module.exports = {
    name: 'inviteDelete',
    async execute(invite, client) {
        const guild = invite.guild;
        
        try {
            // INVITRON ARCHITECTURE: Remove from cache
            const guildCache = client.invites.get(guild.id);
            
            if (guildCache) {
                guildCache.delete(invite.code);
                console.log(`➖ Invite deleted: ${invite.code}`);
            }
            
        } catch (error) {
            console.error('Error handling invite delete:', error);
        }
    }
};