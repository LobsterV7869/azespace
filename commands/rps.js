const { SlashCommandBuilder } = require('discord.js');
const { getOption, getUser, publicReply } = require('../utils/interaction');

const CHOICES = ['rock', 'paper', 'scissors'];
const EMOJIS = {
    rock: '🪨 Rock',
    paper: '📄 Paper',
    scissors: '✂️ Scissors'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play Rock, Paper, Scissors against the app!')
        .addStringOption(option =>
            option.setName('choice')
                .setDescription('Your choice: rock, paper, or scissors')
                .setRequired(true)
                .addChoices(
                    { name: '🪨 Rock', value: 'rock' },
                    { name: '📄 Paper', value: 'paper' },
                    { name: '✂️ Scissors', value: 'scissors' }
                )
        ),
    async execute(interaction) {
        const userChoice = getOption(interaction, 'choice');
        const botChoice = CHOICES[Math.floor(Math.random() * CHOICES.length)];
        const user = getUser(interaction);

        let outcome = '';
        let color = 0x5865f2;

        if (userChoice === botChoice) {
            outcome = "🤝 It's a **Tie**!";
            color = 0xfee75c;
        } else if (
            (userChoice === 'rock' && botChoice === 'scissors') ||
            (userChoice === 'paper' && botChoice === 'rock') ||
            (userChoice === 'scissors' && botChoice === 'paper')
        ) {
            outcome = `🎉 **${user.username} wins!**`;
            color = 0x57f287;
        } else {
            outcome = "🤖 **App wins!** Better luck next time!";
            color = 0xed4245;
        }

        return publicReply(null, [
            {
                title: '🎮 Rock, Paper, Scissors',
                description: `**Your Choice:** ${EMOJIS[userChoice]}\n**My Choice:** ${EMOJIS[botChoice]}\n\n${outcome}`,
                color
            }
        ]);
    }
};
