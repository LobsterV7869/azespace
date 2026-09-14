const { SlashCommandBuilder } = require('discord.js');
const { getOption, getUser, publicReply, ephemeralReply } = require('../utils/interaction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Display a user\'s high-resolution avatar (Server only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user whose avatar you want to view (defaults to you)')
                .setRequired(false)
        ),
    async execute(interaction) {
        // Enforce Server Only context:
        // context 0 = GUILD, 1 = BOT_DM, 2 = PRIVATE_CHANNEL (Group DM)
        const isServer = interaction.context === 0 || Boolean(interaction.guild_id);
        if (!isServer) {
            return ephemeralReply('❌ The `/avatar` command can only be used inside a server, not in DMs or Group DMs.');
        }

        const targetUserId = getOption(interaction, 'user');
        let targetUser;

        if (targetUserId && interaction.data?.resolved?.users?.[targetUserId]) {
            targetUser = interaction.data.resolved.users[targetUserId];
        } else {
            targetUser = getUser(interaction);
        }

        let avatarUrl;
        if (targetUser.avatar) {
            const isAnimated = targetUser.avatar.startsWith('a_');
            avatarUrl = `https://cdn.discordapp.com/avatars/${targetUser.id}/${targetUser.avatar}.${isAnimated ? 'gif' : 'png'}?size=1024`;
        } else {
            const defaultIndex = (targetUser.discriminator && targetUser.discriminator !== '0')
                ? parseInt(targetUser.discriminator, 10) % 5
                : (Number(BigInt(targetUser.id) >> 22n) % 6);
            avatarUrl = `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
        }

        return publicReply(null, [
            {
                title: `🖼️ ${targetUser.username}'s Avatar`,
                image: { url: avatarUrl },
                color: 0x5865f2,
                footer: { text: `User ID: ${targetUser.id}` }
            }
        ]);
    }
};
