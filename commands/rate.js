const { SlashCommandBuilder } = require('discord.js');
const { getOption, publicReply } = require('../utils/interaction');

const RATINGS = [
    { max: 10, remark: '💀 Absolute disaster. Negative aura.' },
    { max: 25, remark: '😬 Not looking great chief...' },
    { max: 50, remark: '😐 Perfectly mid. Room temperature rating.' },
    { max: 75, remark: '✨ Pretty solid! Above average vibes.' },
    { max: 90, remark: '🔥 Certified fire! High tier.' },
    { max: 100, remark: '👑 100/100 God-tier perfection!' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rate')
        .setDescription('Rate anything from 0% to 100%')
        .addStringOption(option =>
            option.setName('target')
                .setDescription('What or who you want to rate')
                .setRequired(true)
        ),
    async execute(interaction) {
        const target = getOption(interaction, 'target');
        const score = Math.floor(Math.random() * 101);
        const match = RATINGS.find(r => score <= r.max) || RATINGS[RATINGS.length - 1];

        return publicReply(null, [
            {
                title: '⭐ Rating Machine 3000',
                description: `I rate **${target}**: **${score}/100**\n\n${match.remark}`,
                color: score > 50 ? 0x57f287 : 0xed4245
            }
        ]);
    }
};
