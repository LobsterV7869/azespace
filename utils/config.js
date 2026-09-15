const Database = require('better-sqlite3');
const path = require('path');

let db;
try {
  // Try locating the db file (it resides in the root directory)
  const dbPath = path.resolve(__dirname, '..', 'azespace.db');
  db = new Database(dbPath);
} catch (error) {
  console.error('Bot Config Error: Failed to open shared database.', error);
}

const DEFAULT_CONFIG = {
  overview: {
    prefix: '!',
    language: 'en',
    timezone: 'UTC',
  },
  setup: {
    adminRoles: [],
    modRoles: [],
    mutedRole: '',
  },
  features: {
    leveling: true,
    tickets: true,
    fun: true,
    moderation: true,
    security: true,
  },
  server: {
    language: 'en',
    welcome: {
      enabled: false,
      channel: '',
      message: 'Welcome to the server, {user}!',
    },
    autoRole: {
      enabled: false,
      roles: [],
    },
    tagSync: {
      enabled: false,
    },
    voice: {
      enabled: false,
      channel: '',
    },
  },
  members: {
    users: [],
    infractions: [],
    invites: [],
  },
  leveling: {
    enabled: true,
    xpRate: 1.0,
    cooldown: 60,
    levelUpChannel: 'current',
    levelUpMessage: 'GG {user}, you leveled up to level {level}!',
    roles: [],
  },
  security: {
    guard: { enabled: false },
    filter: { enabled: false, words: [] },
    antiFlood: { enabled: false, threshold: 5, cooldown: 3 },
    antiSpam: { enabled: false, maxDuplicates: 3 },
  },
  logs: {
    eventLogs: { enabled: false, channel: '' },
    panelLogs: { enabled: false, channel: '' },
  },
  tickets: {
    enabled: true,
    category: '',
    settings: {
      limit: 1,
      claim: true,
    },
    reviews: { enabled: false, channel: '' },
    hours: { enabled: false, start: '09:00', end: '17:00' },
    inactivity: { enabled: false, hours: 24 },
  },
  fun: {
    counting: { enabled: false, channel: '' },
    wordGame: { enabled: false, channel: '' },
    confessions: { enabled: false, channel: '' },
    autoReplies: [],
  },
  tools: {
    embedSender: {},
    announce: {},
    rawConfig: {},
  },
};

/**
 * Retrieves the current configuration for a specific guild from the shared SQLite store.
 * Falls back to default configurations if none exist.
 */
function getGuildConfig(guildId) {
  if (!db || !guildId) return DEFAULT_CONFIG;
  try {
    const row = db.prepare('SELECT config FROM guild_configs WHERE guild_id = ?').get(guildId);
    if (!row) return DEFAULT_CONFIG;
    return JSON.parse(row.config);
  } catch (error) {
    console.error(`Failed to get guild config for ${guildId}:`, error);
    return DEFAULT_CONFIG;
  }
}

module.exports = {
  getGuildConfig,
  DEFAULT_CONFIG,
};
