const { SlashCommandBuilder } = require('discord.js');
const { getOption, getUser, publicReply } = require('../utils/interaction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Roll dice (e.g. "6", "20", "2d6", "d100")')
        .addStringOption(option =>
            option.setName('dice')
                .setDescription('Dice format: sides (e.g. 20) or dice notation (e.g. 2d6). Defaults to 6.')
                .setRequired(false)
        ),
    async execute(interaction) {
        const input = (getOption(interaction, 'dice') || '6').trim().toLowerCase();
        const user = getUser(interaction);

        let count = 1;
        let sides = 6;

        // Parse dice format: e.g. "2d6", "d20", or "20"
        if (input.includes('d')) {
            const parts = input.split('d');
            count = parts[0] ? parseInt(parts[0], 10) : 1;
            sides = parseInt(parts[1], 10);
        } else {
            sides = parseInt(input, 10);
        }

        if (isNaN(count) || isNaN(sides) || count < 1 || sides < 2 || count > 20 || sides > 1000) {
            return publicReply('🎲 **Invalid dice format!** Please specify sides between 2 and 1000, and count up to 20 (e.g. `20`, `2d6`, `d100`).');
        }

        const rolls = [];
        let total = 0;
        for (let i = 0; i < count; i++) {
            const roll = Math.floor(Math.random() * sides) + 1;
            rolls.push(roll);
            total += roll;
        }

        let description = `Rolled **${count}d${sides}**: **${total}**`;
        if (count > 1) {
            description += `\nRoll details: [ ${rolls.join(', ')} ]`;
        }

        return publicReply(null, [
            {
                title: '🎲 Dice Roll',
                description: description,
                color: 0x5865f2,
                footer: { text: `Rolled by ${user.username}` }
            }
        ]);
    }
};
