import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { verifySession } from '@/lib/auth';
import { hasManageServer } from '@/lib/permissions';
import db from '@/lib/db';

const DEFAULT_CONFIG = {
  overview: { prefix: '!', language: 'en', timezone: 'UTC' },
  setup: { adminRoles: [], modRoles: [], mutedRole: '' },
  features: { leveling: true, tickets: true, fun: true, moderation: true, security: true },
  server: {
    language: 'en',
    welcome: { enabled: false, channel: '', message: 'Welcome to the server, {user}!' },
    autoRole: { enabled: false, roles: [] },
    tagSync: { enabled: false },
    voice: { enabled: false, channel: '' },
  },
  members: { users: [], infractions: [], invites: [] },
  leveling: {
    enabled: true, xpRate: 1.0, cooldown: 60, levelUpChannel: 'current',
    levelUpMessage: 'GG {user}, you leveled up to level {level}!', roles: [],
  },
  security: {
    guard: { enabled: false }, filter: { enabled: false, words: [] },
    antiFlood: { enabled: false, threshold: 5, cooldown: 3 },
    antiSpam: { enabled: false, maxDuplicates: 3 },
  },
  logs: {
    eventLogs: { enabled: false, channel: '' },
    panelLogs: { enabled: false, channel: '' },
  },
  tickets: {
    enabled: true, category: '', settings: { limit: 1, claim: true },
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
  tools: { embedSender: {}, announce: {}, rawConfig: {} },
};

function tokensMatch(left, right) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

// Browser requests use a session and guild permission; server requests use BOT_API_TOKEN.
async function isAuthorized(request, guildId) {
  const authHeader = request.headers.get('Authorization');
  const expectedToken = process.env.BOT_API_TOKEN;
  if (authHeader?.startsWith('Bearer ') && tokensMatch(authHeader.slice(7), expectedToken)) {
    return true;
  }

  const sessionToken = request.cookies.get('session')?.value;
  const user = sessionToken ? await verifySession(sessionToken) : null;
  return Boolean(user && await hasManageServer(user, guildId));
}

function mergeConfig(currentConfig, updates) {
  const newConfig = { ...currentConfig };
  for (const section of Object.keys(updates)) {
    if (updates[section] && typeof updates[section] === 'object' && !Array.isArray(updates[section])) {
      newConfig[section] = { ...(currentConfig[section] || {}), ...updates[section] };
    } else {
      newConfig[section] = updates[section];
    }
  }
  return newConfig;
}

async function getGuildId(params) {
  return (await params).guildId;
}

export async function GET(request, { params }) {
  const guildId = await getGuildId(params);
  if (!(await isAuthorized(request, guildId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const row = db.prepare('SELECT config FROM guild_configs WHERE guild_id = ?').get(guildId);
    return NextResponse.json(row ? JSON.parse(row.config) : DEFAULT_CONFIG);
  } catch (error) {
    console.error('Database fetch error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const guildId = await getGuildId(params);
  if (!(await isAuthorized(request, guildId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const updates = await request.json();
    const row = db.prepare('SELECT config FROM guild_configs WHERE guild_id = ?').get(guildId);
    const currentConfig = row ? JSON.parse(row.config) : DEFAULT_CONFIG;
    const newConfig = mergeConfig(currentConfig, updates);

    db.prepare(`
      INSERT INTO guild_configs (guild_id, config, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(guild_id) DO UPDATE SET config = excluded.config, updated_at = CURRENT_TIMESTAMP
    `).run(guildId, JSON.stringify(newConfig));

    return NextResponse.json(newConfig);
  } catch (error) {
    console.error('Database update error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
