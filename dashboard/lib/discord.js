const DISCORD_API_URL = 'https://discord.com/api/v10';

async function discordRequest(endpoint, options = {}) {
  const res = await fetch(`${DISCORD_API_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.message || 'Discord API error');
  }

  return res.json();
}

export async function getGuildChannels(guildId) {
  return discordRequest(`/guilds/${guildId}/channels`);
}

export async function getGuildRoles(guildId) {
  return discordRequest(`/guilds/${guildId}/roles`);
}

export async function getGuildInfo(guildId) {
  return discordRequest(`/guilds/${guildId}`);
}

export async function getGuildMembers(guildId, { limit = 1000, after = '', query = '' } = {}) {
  const params = new URLSearchParams({ limit: String(Math.min(Math.max(limit, 1), 1000)) });
  if (after) params.set('after', after);
  if (query) params.set('query', query);
  return discordRequest(`/guilds/${guildId}/members?${params}`);
}

export async function getGuildInvites(guildId) {
  return discordRequest(`/guilds/${guildId}/invites`);
}

export async function getUserGuilds(accessToken) {
  const res = await fetch(`${DISCORD_API_URL}/users/@me/guilds`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch user guilds');
  }

  return res.json();
}
