const { SlashCommandBuilder } = require('discord.js');
const { getOption, publicReply } = require('../utils/interaction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spam')
        .setDescription('Repeat a short message visibly (max 100 repetitions)')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Message to send')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('count')
                .setDescription('How many times to repeat it (1-100)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(100)
        ),
    async execute(interaction) {
        const text = String(getOption(interaction, 'text') || '').trim();
        const count = Number(getOption(interaction, 'count') || 1);

        if (!text) {
            return publicReply('Please provide a message to send.');
        }

        const safeCount = Math.min(Math.max(Number.isInteger(count) ? count : 1, 1), 100);
        const response = publicReply(text.slice(0, 2000));
        response.followUpMessages = Array.from({ length: safeCount - 1 }, () => text.slice(0, 2000));
        return response;
    }
};
