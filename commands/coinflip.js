const { SlashCommandBuilder } = require('discord.js');
const { publicReply } = require('../utils/interaction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Flip a coin! (Watch out for the rare edge landing!)'),
    async execute(interaction) {
        const rand = Math.random();

        let result = '';
        let color = 0xfee75c;

        if (rand < 0.01) {
            result = '😱 **WHAT?!** The coin bounced, spun like crazy, and landed **PERFECTLY ON ITS EDGE**! (1 in 100 chance!) 🪙';
            color = 0xed4245;
        } else if (rand < 0.505) {
            result = '🪙 The coin landed on: **HEADS**! 🦅';
            color = 0x5865f2;
        } else {
            result = '🪙 The coin landed on: **TAILS**! 👑';
            color = 0x57f287;
        }

        return publicReply(result);
    }
};
