const { SlashCommandBuilder } = require('discord.js');
const { getOption, getUser, publicReply } = require('../utils/interaction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fakeban')
        .setDescription('Pretend to ban a friend with a dramatic moderation embed!')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to fake ban')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('The hilarious fake reason')
                .setRequired(false)
        ),
    async execute(interaction) {
        const targetId = getOption(interaction, 'user');
        const reason = getOption(interaction, 'reason') || 'Being too cool for this server';
        const user = getUser(interaction);

        const targetUser = interaction.data?.resolved?.users?.[targetId] || { username: 'Unknown User' };

        return publicReply(null, [
            {
                title: '🔨 USER HAS BEEN BANNED',
                description: `**Member:** <@${targetId}> (${targetUser.username})\n**Action:** Permanent Ban\n**Reason:** ${reason}\n\n⚠️ **Appeal Status:** Denied forever!\n\n*(P.S. Relax, you are not actually banned! You just got pranked by ${user.username} 🤡)*`,
                color: 0xed4245,
                timestamp: new Date().toISOString(),
                footer: { text: 'Automated AzeSpace Ban System (100% Fake)' }
            }
        ]);
    }
};
