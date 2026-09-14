const { SlashCommandBuilder } = require('discord.js');
const { getOption, getUser, publicReply } = require('../utils/interaction');

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a numbered reaction poll in the channel')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('The question for the poll')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('options')
                .setDescription('Comma-separated choices (e.g. "Pizza, Burgers, Sushi")')
                .setRequired(true)
        ),
    async execute(interaction) {
        const question = getOption(interaction, 'question');
        const optionsRaw = getOption(interaction, 'options');
        const user = getUser(interaction);

        // Split by comma or pipe
        const delimiter = optionsRaw.includes('|') ? '|' : ',';
        const choices = optionsRaw
            .split(delimiter)
            .map(c => c.trim())
            .filter(c => c.length > 0);

        if (choices.length < 2) {
            return publicReply('❌ Please provide at least 2 options separated by commas (e.g. `Yes, No` or `Option A, Option B`).');
        }

        if (choices.length > 10) {
            return publicReply('❌ You can have a maximum of 10 options in a poll.');
        }

        const pollFields = choices.map((choice, index) => {
            return `${NUMBER_EMOJIS[index]} **${choice}**`;
        }).join('\n\n');

        return publicReply(null, [
            {
                title: `📊 ${question}`,
                description: `${pollFields}\n\n*React with the numbers below to cast your vote!*`,
                color: 0x5865f2,
                footer: { text: `Poll created by ${user.username}` }
            }
        ]);
    }
};
