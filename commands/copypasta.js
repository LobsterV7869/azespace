const { SlashCommandBuilder } = require('discord.js');
const { publicReply } = require('../utils/interaction');

const COPYPASTAS = [
    "Did you know that in terms of male human and female Pokémon breeding, Vaporeon is actually the most compatible... Wait no, stop right there! Don't you dare finish that sentence! 🛑",
    "To be fair, you have to have a very high IQ to understand Rick and Morty. The humor is extremely subtle, and without a solid grasp of theoretical physics most of the jokes will go over a typical viewer's head. 🧠",
    "I'd just like to interject for a moment. What you're referring to as Linux, is in fact, GNU/Linux, or as I've recently taken to calling it, GNU plus Linux. Linux is not an operating system unto itself, but rather another free component of a fully functioning GNU system... 🐧",
    "You fool. You absolute buffoon. You thought you could defeat me in my own realm? You thought you could challenge the ancient gods of Discord? Think again. ⚡",
    "According to all known laws of aviation, there is no way a bee should be able to fly. Its wings are too small to get its fat little body off the ground. The bee, of course, flies anyway because bees don't care what humans think is impossible. 🐝"
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('copypasta')
        .setDescription('Post a classic harmless copypasta!'),
    async execute(interaction) {
        const pasta = COPYPASTAS[Math.floor(Math.random() * COPYPASTAS.length)];
        return publicReply(`📜 **Copypasta Archives:**\n\n${pasta}`);
    }
};
