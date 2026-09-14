const { SlashCommandBuilder } = require('discord.js');
const { getOption, getUser, ephemeralReply } = require('../utils/interaction');

/**
 * Parses time strings like "10s", "5m", "2h", "1d" into milliseconds.
 */
function parseDuration(str) {
    if (!str) return null;
    const match = str.trim().toLowerCase().match(/^(\d+)\s*(s|sec|m|min|h|hr|d|day)?$/);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2] || 'm'; // default to minutes if unit omitted

    if (unit.startsWith('s')) return value * 1000;
    if (unit.startsWith('m')) return value * 60 * 1000;
    if (unit.startsWith('h')) return value * 60 * 60 * 1000;
    if (unit.startsWith('d')) return value * 24 * 60 * 60 * 1000;
    return null;
}

/**
 * Sends a Direct Message to the target user via Discord REST API.
 */
async function sendDM(userId, messageContent) {
    if (!process.env.DISCORD_TOKEN) {
        console.error('DISCORD_TOKEN not set; cannot send reminder DM.');
        return;
    }

    const token = process.env.DISCORD_TOKEN.trim();
    const headers = {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json'
    };

    try {
        // Step 1: Open or get existing DM channel
        const channelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
            method: 'POST',
            headers,
            body: JSON.stringify({ recipient_id: userId })
        });

        if (!channelRes.ok) {
            console.error('Failed to open DM channel for reminder:', await channelRes.text());
            return;
        }

        const channelData = await channelRes.json();
        const channelId = channelData.id;

        // Step 2: Post the reminder message in the DM channel
        const msgRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                embeds: [
                    {
                        title: '⏰ Reminder Alert!',
                        description: messageContent,
                        color: 0xeb459e,
                        timestamp: new Date().toISOString(),
                        footer: { text: 'AzeSpace Reminder Service' }
                    }
                ]
            })
        });

        if (!msgRes.ok) {
            console.error('Failed to send reminder message:', await msgRes.text());
        }
    } catch (err) {
        console.error('Error delivering reminder DM:', err.message);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remindme')
        .setDescription('Set a one-time reminder that will be DM\'d to you')
        .addStringOption(option =>
            option.setName('time')
                .setDescription('When to remind you (e.g. "30s", "10m", "2h")')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('note')
                .setDescription('What you want to be reminded about')
                .setRequired(true)
        ),
    async execute(interaction) {
        const timeStr = getOption(interaction, 'time');
        const note = getOption(interaction, 'note');
        const user = getUser(interaction);

        const durationMs = parseDuration(timeStr);
        if (!durationMs || durationMs < 5000 || durationMs > 24 * 60 * 60 * 1000) {
            return ephemeralReply('❌ Invalid time format! Please specify between 5 seconds and 24 hours (e.g. `30s`, `15m`, `2h`).');
        }

        // Schedule background delivery
        setTimeout(() => {
            sendDM(user.id, `🔔 **Reminder:** ${note}`);
        }, durationMs);

        const targetTimeUnix = Math.floor((Date.now() + durationMs) / 1000);
        return ephemeralReply(`✅ **Reminder set!** I will DM you <t:${targetTimeUnix}:R> (<t:${targetTimeUnix}:t>) with your note:\n> *"${note}"*`);
    }
};
