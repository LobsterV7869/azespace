const { SlashCommandBuilder } = require('discord.js');
const { getOption, getUser, publicReply } = require('../utils/interaction');

const SPAM_CAN = `
  .--------------------.
 /      HORMEL SPAM     \\
|========================|
|  [ SPICED HAM & PORK ] |
|       ★ 100% ★         |
|   EXTRA SALTY TROLL    |
|========================|
 \\______________________/
`;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spam')
        .setDescription('Execute the legendary ultra spam cannon! (Troll command)')
        .addStringOption(option =>
            option.setName('target')
                .setDescription('Who or what you want to spam')
                .setRequired(false)
        ),
    async execute(interaction) {
        const target = getOption(interaction, 'target') || 'this channel';
        const user = getUser(interaction);

        return publicReply(null, [
            {
                title: '🚨 MAXIMUM SPAM PROTOCOL INITIATED 🚨',
                description: `Targeting: **${target}**\n\`\`\`text\n${SPAM_CAN}\n\`\`\`\n🎉 **MISSION ACCOMPLISHED!**\nA fresh 12oz can of delicious luncheon meat has been deployed directly to your chat.\n*Remember kids: Eat your SPAM, don't spam the chat!* 🥫🍖`,
                color: 0xed4245,
                footer: { text: `Spam cannon triggered by ${user.username}` }
            }
        ]);
    }
};
