const MANAGE_SERVER = 0x20n;

export function hasManageServer(user, guildId) {
  if (!guildId || !Array.isArray(user?.guilds)) return false;

  const guild = user.guilds.find((candidate) => candidate.id === guildId);
  if (!guild) return false;

  const permissions = parsePermissions(guild.permissions);
  return (permissions & MANAGE_SERVER) === MANAGE_SERVER;
}

export function getManageableGuilds(user) {
  if (!Array.isArray(user?.guilds)) return [];
  return user.guilds.filter((guild) => {
    const permissions = parsePermissions(guild.permissions);
    return (permissions & MANAGE_SERVER) === MANAGE_SERVER;
  });
}

function parsePermissions(value) {
  try {
    return BigInt(value || '0');
  } catch {
    return 0n;
  }
}

export { MANAGE_SERVER };
