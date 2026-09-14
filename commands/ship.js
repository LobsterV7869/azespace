const { SlashCommandBuilder } = require('discord.js');
const { getOption, getUser, publicReply } = require('../utils/interaction');

function getProgressBar(percent) {
    const totalBars = 10;
    const filledBars = Math.round((percent / 100) * totalBars);
    const emptyBars = totalBars - filledBars;
    return '█'.repeat(filledBars) + '░'.repeat(emptyBars);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ship')
        .setDescription('Calculate the love and friendship compatibility between two users!')
        .addUserOption(option =>
            option.setName('user1')
                .setDescription('The first user')
                .setRequired(true)
        )
        .addUserOption(option =>
            option.setName('user2')
                .setDescription('The second user (defaults to you)')
                .setRequired(false)
        ),
    async execute(interaction) {
        const user1Id = getOption(interaction, 'user1');
        const user2Id = getOption(interaction, 'user2') || getUser(interaction).id;

        const resolvedUsers = interaction.data?.resolved?.users || {};
        const u1Name = resolvedUsers[user1Id]?.username || 'User 1';
        const u2Name = resolvedUsers[user2Id]?.username || getUser(interaction).username;

        // Generate deterministic or pseudo-random percentage based on user IDs
        const combined = BigInt(user1Id || 1) + BigInt(user2Id || 2);
        const percent = Number((combined % 101n + BigInt(Math.floor(Date.now() / 86400000))) % 101n);

        const bar = getProgressBar(percent);
        let comment = '';
        let heart = '💔';

        if (percent < 20) {
            comment = 'Zero chemistry. Stay 500 meters apart!';
            heart = '☣️';
        } else if (percent < 50) {
            comment = 'Awkward silence in the room vibes.';
            heart = '💔';
        } else if (percent < 75) {
            comment = 'Great friendship potential!';
            heart = '💛';
        } else if (percent < 90) {
            comment = 'Cute couple alert! 🌟';
            heart = '💖';
        } else {
            comment = 'Soulmates written in the stars! True love! 💍';
            heart = '💞';
        }

        return publicReply(null, [
            {
                title: `${heart} Love Compatibility Matcher`,
                description: `**${u1Name}**  x  **${u2Name}**\n\n**${percent}%** [${bar}]\n\n*${comment}*`,
                color: percent > 50 ? 0xeb459e : 0x5865f2
            }
        ]);
    }
};
