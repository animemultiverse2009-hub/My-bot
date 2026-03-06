const skipQueue = require('./skipQueue');

module.exports = {
    async execute(interaction, client) {
        // This is essentially the same as skip queue - recheck invites
        await skipQueue.execute(interaction, client);
    }
};