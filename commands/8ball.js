const { SlashCommandBuilder } = require('discord.js');
const { getOption, getUser, publicReply } = require('../utils/interaction');

const RESPONSES = [
    // Positive
    'It is certain. ✨',
    'It is decidedly so. 🌟',
    'Without a doubt. 👍',
    'Yes, definitely! 🔥',
    'You may rely on it. 💫',
    'As I see it, yes. 🔮',
    'Most likely. 📈',
    'Outlook good. ☀️',
    'Yes. ✅',
    'Signs point to yes. 🎯',
    // Neutral
    'Reply hazy, try again. 🌫️',
    'Ask again later. ⏳',
    'Better not tell you now. 🤫',
    'Cannot predict now. 🌀',
    'Concentrate and ask again. 🤔',
    // Negative
    'Don\'t count on it. 🚫',
    'My reply is no. ❌',
    'My sources say no. 📉',
    'Outlook not so good. 🌧️',
    'Very doubtful. 🛑'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Ask the magical 8-Ball any question!')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('The question you wish to ask the 8-Ball')
                .setRequired(true)
        ),
    async execute(interaction) {
        const question = getOption(interaction, 'question');
        const user = getUser(interaction);
        const answer = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];

        return publicReply(null, [
            {
                title: '🎱 Magic 8-Ball',
                color: 0x2b2d31,
                fields: [
                    { name: '❓ Question', value: question },
                    { name: '🔮 Answer', value: answer }
                ],
                footer: { text: `Asked by ${user.username}` }
            }
        ]);
    }
};
