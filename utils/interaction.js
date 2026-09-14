/**
 * Helpers for parsing Discord HTTP interaction payloads and constructing responses.
 */

const { InteractionResponseType, InteractionResponseFlags } = require('discord-interactions');

/**
 * Extracts the user object from an interaction (handles both Guild and DM/Group DM contexts).
 */
function getUser(interaction) {
    return interaction.user || interaction.member?.user || { id: 'unknown', username: 'Unknown User' };
}

/**
 * Extracts an option value by name from the interaction options array.
 */
function getOption(interaction, name) {
    const options = interaction.data?.options;
    if (!options || !Array.isArray(options)) return null;
    const opt = options.find((o) => o.name === name);
    return opt ? opt.value : null;
}

/**
 * Creates an interaction response that is visible to everyone in the channel.
 */
function publicReply(content, embeds = null) {
    const data = {};
    if (content) data.content = content;
    if (embeds && Array.isArray(embeds)) data.embeds = embeds;
    return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data
    };
}

/**
 * Creates an interaction response visible ONLY to the user who invoked it (ephemeral).
 */
function ephemeralReply(content, embeds = null) {
    const res = publicReply(content, embeds);
    res.data.flags = InteractionResponseFlags.EPHEMERAL;
    return res;
}

module.exports = {
    getUser,
    getOption,
    publicReply,
    ephemeralReply
};
