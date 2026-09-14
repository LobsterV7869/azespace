const { SlashCommandBuilder } = require('discord.js');
const { getOption, getUser, publicReply } = require('../utils/interaction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('iq')
        .setDescription('Calculate someone\'s 100% scientifically accurate IQ')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to scan (defaults to you)')
                .setRequired(false)
        ),
    async execute(interaction) {
        const targetId = getOption(interaction, 'user');
        let username = '';

        if (targetId && interaction.data?.resolved?.users?.[targetId]) {
            username = interaction.data.resolved.users[targetId].username;
        } else {
            username = getUser(interaction).username;
        }

        // Random IQ between 20 and 220
        const iq = Math.floor(Math.random() * 201) + 20;

        let verdict = '';
        let emoji = '🧠';
        if (iq < 50) {
            verdict = 'Single-celled organism. Smooth brain territory.';
            emoji = '🪨';
        } else if (iq < 85) {
            verdict = 'Forgets why they walked into a room 5 times a day.';
            emoji = '🥔';
        } else if (iq < 115) {
            verdict = 'Average human specimen. Perfectly balanced.';
            emoji = '😐';
        } else if (iq < 140) {
            verdict = 'High intellect! Solves Rubik\'s cubes for breakfast.';
            emoji = '🧐';
        } else {
            verdict = 'GALAXY BRAIN OVERLORD! Transcending time and space.';
            emoji = '🌌';
        }

        return publicReply(null, [
            {
                title: `${emoji} IQ Scanner`,
                description: `**${username}** has an IQ of **${iq}**!\n\n*${verdict}*`,
                color: iq > 100 ? 0x5865f2 : 0xfee75c
            }
        ]);
    }
};
