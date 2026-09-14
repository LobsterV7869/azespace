const { SlashCommandBuilder } = require('discord.js');
const { getOption, publicReply } = require('../utils/interaction');

function toMockingCase(str) {
    return str
        .split('')
        .map((char, index) => (index % 2 === 0 ? char.toLowerCase() : char.toUpperCase()))
        .join('');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mock')
        .setDescription('Convert text into sPoNgEbOb MoCkInG cAsE!')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('The text you want to mock')
                .setRequired(true)
        ),
    async execute(interaction) {
        const text = getOption(interaction, 'text');
        const mocked = toMockingCase(text);

        return publicReply(`🐔 "${mocked}"`);
    }
};
