const { SlashCommandBuilder } = require('discord.js');
const { getOption, getUser, publicReply } = require('../utils/interaction');

const ROASTS = [
    "Your secrets are always safe with your friends because they weren't listening anyway.",
    "You have something on your chin... no, the 3rd one down.",
    "I'd agree with you, but then we'd both be wrong.",
    "You're like a cloud. When you disappear, it becomes a beautiful day.",
    "If laughter is the best medicine, your face must be curing the world.",
    "I would roast you, but my mom told me not to burn trash.",
    "You bring everyone so much joy... when you leave the voice channel.",
    "Somewhere out there is a tree tirelessly producing oxygen for you. You owe it an apology."
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roast')
        .setDescription('Playfully roast a friend or yourself')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to roast (defaults to you)')
                .setRequired(false)
        ),
    async execute(interaction) {
        const targetId = getOption(interaction, 'user');
        let username = '';

        if (targetId && interaction.data?.resolved?.users?.[targetId]) {
            username = `<@${targetId}>`;
        } else {
            username = `<@${getUser(interaction).id}>`;
        }

        const roast = ROASTS[Math.floor(Math.random() * ROASTS.length)];
        return publicReply(`🔥 ${username} ${roast}`);
    }
};
