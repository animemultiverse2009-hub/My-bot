const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = {
    async execute(interaction, client) {
        // This button IS deferred in interactionCreate.js
        const user = interaction.user;
        
        const dmEmbed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('💡 Pro Tip: Get Invites Faster!')
            .setDescription(
                `Want to boost your invite count quickly? Here's the secret:\n\n` +
                `**Join "Join for Join" (J4J) Servers:**\n\n` +
                `🔗 **discord.gg/joinforjoin**\n` +
                `🔗 **discord.gg/j4jfast**\n\n` +
                `**How It Works:**\n` +
                `1️⃣ Join these J4J servers\n` +
                `2️⃣ Share your server invite in their channels\n` +
                `3️⃣ Other members will join your server\n` +
                `4️⃣ You join their servers in return\n\n` +
                `**Tips for Success:**\n` +
                `✅ Be professional and friendly\n` +
                `✅ Join back when people join you\n` +
                `✅ Follow each server's rules\n` +
                `✅ Use active J4J channels\n\n` +
                `This is the **fastest legal way** to get invites! Many users earn 10-50+ invites per day using this method. 🚀`
            )
            .setFooter({ text: 'Remember: Only real members count towards rewards!' })
            .setTimestamp();
        
        try {
            // Try to send DM
            await user.send({ embeds: [dmEmbed] });
            
            // Confirm to user
            const confirmEmbed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Pro Tip Sent!')
                .setDescription(`Check your DMs! I've sent you detailed instructions on how to get invites faster. 📬`);
            
            await interaction.editReply({ embeds: [confirmEmbed] });
            
        } catch (error) {
            // DMs are closed
            console.log(`Failed to DM ${user.tag}: DMs closed`);
            
            const errorEmbed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle('❌ Cannot Send DM')
                .setDescription(
                    `I couldn't send you a DM because your DMs are closed!\n\n` +
                    `**To receive the Pro Tip:**\n` +
                    `1️⃣ Go to **User Settings** (⚙️)\n` +
                    `2️⃣ Click **Privacy & Safety**\n` +
                    `3️⃣ Enable **"Allow direct messages from server members"**\n` +
                    `4️⃣ Click the **Pro Tip** button again!\n\n` +
                    `**Quick Tip Here:**\n` +
                    `Join J4J servers like **discord.gg/joinforjoin** and **discord.gg/j4jfast** to get invites fast! 🚀`
                )
                .setFooter({ text: 'Open your DMs to get the full guide!' });
            
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};