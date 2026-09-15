export async function fetchConfig(guildId) {
  const res = await fetch(`/api/guilds/${guildId}/config`);
  if (!res.ok) throw new Error('Failed to fetch configuration');
  return res.json();
}

export async function saveConfig(guildId, section, updates) {
  const res = await fetch(`/api/guilds/${guildId}/config`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ [section]: updates }),
  });
  if (!res.ok) throw new Error('Failed to save configuration');
  return res.json();
}

export async function saveFullConfig(guildId, config) {
  const res = await fetch(`/api/guilds/${guildId}/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to save configuration');
  return res.json();
}

export async function fetchMembersData(guildId, query = '') {
  const suffix = query ? `?query=${encodeURIComponent(query)}` : '';
  const res = await fetch(`/api/guilds/${guildId}/members${suffix}`);
  if (!res.ok) throw new Error('Failed to fetch members');
  return res.json();
}

export async function sendToolMessage(guildId, payload) {
  const res = await fetch(`/api/guilds/${guildId}/tools/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to send message');
  return res.json();
}

export async function fetchChannels(guildId) {
  const res = await fetch(`/api/guilds/${guildId}/channels`);
  if (!res.ok) throw new Error('Failed to fetch channels');
  return res.json();
}

export async function fetchRoles(guildId) {
  const res = await fetch(`/api/guilds/${guildId}/roles`);
  if (!res.ok) throw new Error('Failed to fetch roles');
  return res.json();
}
