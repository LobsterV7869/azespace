const { SlashCommandBuilder } = require('discord.js');
const { getOption, publicReply } = require('../utils/interaction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reverse')
        .setDescription('Reverse text backwards (!txet desreveR)')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('The text to reverse')
                .setRequired(true)
        ),
    async execute(interaction) {
        const text = getOption(interaction, 'text');
        const reversed = text.split('').reverse().join('');

        return publicReply(`🔄 **Reversed:** ${reversed}`);
    }
};
