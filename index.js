require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActivityType, 
    PermissionFlagsBits, 
    Events, 
    AuditLogEvent, 
    ApplicationCommandOptionType, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ChannelType
} = require('discord.js');

let Groq;
try {
    Groq = require('groq-sdk');
} catch (e) {
    console.log('⚠️ Groq SDK is not installed or failed to load.');
}

// Function to sanitize sensitive tokens/keys from error messages and logs
function sanitizeSecrets(text) {
    if (typeof text !== 'string') return text;
    let sanitized = text;
    if (process.env.DISCORD_TOKEN) {
        const token = process.env.DISCORD_TOKEN.trim();
        if (token.length > 5) sanitized = sanitized.split(token).join('[REDACTED_DISCORD_TOKEN]');
    }
    if (process.env.GROQ_API_KEY) {
        const key = process.env.GROQ_API_KEY.trim();
        if (key.length > 5) sanitized = sanitized.split(key).join('[REDACTED_GROQ_KEY]');
    }
    return sanitized;
}

// Prevent process crashes and prevent sensitive tokens from leaking in unhandled logs
process.on('unhandledRejection', (reason) => {
    const errorMsg = reason instanceof Error ? (reason.stack || reason.message) : String(reason);
    console.error('⚠️ Unhandled Promise Rejection:', sanitizeSecrets(errorMsg));
});

process.on('uncaughtException', (error) => {
    const errorMsg = error instanceof Error ? (error.stack || error.message) : String(error);
    console.error('❌ Uncaught Exception:', sanitizeSecrets(errorMsg));
});

// Initialize SQLite Database
const Database = require('better-sqlite3');
const sqlDb = new Database('./database.db');

sqlDb.pragma('journal_mode = WAL');
sqlDb.pragma('busy_timeout = 5000');

sqlDb.exec(`
    CREATE TABLE IF NOT EXISTS ban_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        guild_name TEXT NOT NULL,
        banned_at TEXT NOT NULL,
        unbanned_at TEXT,
        moderator_id TEXT,
        reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ban_records_user_id ON ban_records (user_id);
    CREATE INDEX IF NOT EXISTS idx_ban_records_guild_id ON ban_records (guild_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ban_records_active_unique
        ON ban_records (user_id, guild_id)
        WHERE unbanned_at IS NULL;

    CREATE TABLE IF NOT EXISTS warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_warnings_user_guild ON warnings (user_id, guild_id);

    CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL,
        closed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_guild_user ON tickets (guild_id, user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_open_unique
        ON tickets (guild_id, user_id)
        WHERE status = 'open';

    CREATE TABLE IF NOT EXISTS ticket_panels (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL
    );
`);

const insertBanStmt = sqlDb.prepare(`
    INSERT INTO ban_records (user_id, guild_id, guild_name, banned_at, moderator_id, reason)
    VALUES (?, ?, ?, ?, ?, ?)
`);
const findActiveBanStmt = sqlDb.prepare(`
    SELECT id FROM ban_records
    WHERE user_id = ? AND guild_id = ? AND unbanned_at IS NULL
    ORDER BY id DESC LIMIT 1
`);
const markUnbannedStmt = sqlDb.prepare('UPDATE ban_records SET unbanned_at = ? WHERE id = ?');
const getBansForUserStmt = sqlDb.prepare('SELECT * FROM ban_records WHERE user_id = ? ORDER BY id DESC');

const recordBanTxn = sqlDb.transaction((userId, guildId, guildName, bannedAt, moderatorId, reason) => {
    const existing = findActiveBanStmt.get(userId, guildId);
    if (existing) return false;
    insertBanStmt.run(userId, guildId, guildName, bannedAt, moderatorId, reason);
    return true;
});

function recordBan(userId, guildId, guildName, bannedAt, moderatorId, reason) {
    try {
        return recordBanTxn(userId, guildId, guildName, bannedAt, moderatorId, reason);
    } catch (error) {
        if (error && (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT')) {
            return false;
        }
        throw error;
    }
}

const insertWarningStmt = sqlDb.prepare(`
    INSERT INTO warnings (user_id, guild_id, moderator_id, reason, created_at)
    VALUES (?, ?, ?, ?, ?)
`);
const getWarningsStmt = sqlDb.prepare(`
    SELECT * FROM warnings WHERE user_id = ? AND guild_id = ? ORDER BY id DESC
`);

const insertTicketStmt = sqlDb.prepare(`
    INSERT INTO tickets (guild_id, channel_id, user_id, status, created_at)
    VALUES (?, ?, ?, 'open', ?)
`);
const findOpenTicketStmt = sqlDb.prepare(`
    SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1
`);
const getTicketByChannelStmt = sqlDb.prepare(`
    SELECT * FROM tickets WHERE channel_id = ? LIMIT 1
`);
const markTicketClosedStmt = sqlDb.prepare(`
    UPDATE tickets SET status = 'closed', closed_at = ? WHERE id = ? AND status = 'open'
`);
const upsertTicketPanelStmt = sqlDb.prepare(`
    INSERT INTO ticket_panels (guild_id, channel_id, message_id)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id
`);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ]
});

// Initialize Groq client if configured
let groq = null;
if (Groq && process.env.GROQ_API_KEY) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

const PREFIXES = ['!', 'az ', 'az'];
const OWNER_ID = process.env.OWNER_ID || '819897775595454505';

// Simple in-memory storage for server sessions (legacy/other commands)
const db = {
    users: {}
};

function getUser(id, username) {
    if (!db.users[id]) {
        db.users[id] = {
            id,
            username: username || 'User',
            cash: 1000,
            dailyLastClaimed: 0,
            warns: 0
        };
    }
    return db.users[id];
}

const JOKES = [
    "Why don't scientists trust atoms? Because they make up everything!",
    "Why did the scarecrow win an award? Because he was outstanding in his field!",
    "Why don't skeletons fight each other? They don't have the guts.",
    "What do you call a fake noodle? An impasta!",
    "How does a penguin build its house? Igloos it together!",
    "Why was the math book sad? It had too many problems.",
    "Why did the bicycle fall over? Because it was two-tired!",
    "What do you call cheese that isn't yours? Nacho cheese."
];

// Helper to format dates to DD.MM.YYYY [HH:mm]
function formatDate(dateString, includeTime = false) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    if (includeTime) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}.${month}.${year} ${hours}:${minutes}`;
    }
    return `${day}.${month}.${year}`;
}

// Helper to format account creation dates (e.g. 12 May 2023)
function formatCreationDate(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
}

function clipField(text, max = 1024) {
    if (!text) return 'None';
    if (text.length <= max) return text;
    return `${text.slice(0, max - 16)}\n…and more`;
}

const ACTION_COLORS = {
    Ban: '#E74C3C',
    Unban: '#2ECC71',
    Kick: '#E67E22',
    Mute: '#F1C40F',
    Unmute: '#2ECC71',
    Warn: '#F39C12',
    Clear: '#3498DB',
    Lock: '#95A5A6',
    Unlock: '#2ECC71',
    Slowmode: '#3498DB'
};

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
const DEFAULT_MUTE_MS = 10 * 60 * 1000;
const SNOWFLAKE_RE = /^\d{17,20}$/;
const MENTION_RE = /^<@!?\d+>$/;

function parseDurationMs(input) {
    if (!input) return null;
    const match = String(input).trim().toLowerCase().match(
        /^(\d{1,8})\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)?$/
    );
    if (!match) return null;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const unit = match[2] || 'm';
    const multipliers = {
        s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
        m: 60 * 1000, min: 60 * 1000, mins: 60 * 1000, minute: 60 * 1000, minutes: 60 * 1000,
        h: 60 * 60 * 1000, hr: 60 * 60 * 1000, hrs: 60 * 60 * 1000, hour: 60 * 60 * 1000, hours: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000, day: 24 * 60 * 60 * 1000, days: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000, week: 7 * 24 * 60 * 60 * 1000, weeks: 7 * 24 * 60 * 60 * 1000
    };
    return amount * multipliers[unit];
}

function formatDuration(ms) {
    if (!ms || ms < 1000) return '0 seconds';
    const totalSeconds = Math.round(ms / 1000);
    const units = [
        { label: 'day', size: 86400 },
        { label: 'hour', size: 3600 },
        { label: 'minute', size: 60 },
        { label: 'second', size: 1 }
    ];
    const parts = [];
    let remaining = totalSeconds;
    for (const unit of units) {
        const value = Math.floor(remaining / unit.size);
        if (value <= 0) continue;
        remaining -= value * unit.size;
        parts.push(`${value} ${unit.label}${value === 1 ? '' : 's'}`);
        if (parts.length === 2) break;
    }
    return parts.join(', ') || '0 seconds';
}

function extractSnowflake(token) {
    if (!token) return null;
    const mention = String(token).match(/^<@!?(\d+)>$/);
    if (mention) return mention[1];
    if (SNOWFLAKE_RE.test(token)) return token;
    return null;
}

function leftoverArgs(args, targetId) {
    return args.filter((token) => {
        if (MENTION_RE.test(token)) return false;
        if (targetId && token === targetId) return false;
        return true;
    });
}

async function resolveModerationTarget(message, args) {
    let id = message.mentions.users.first()?.id || null;
    if (!id) {
        const token = args.find((item) => extractSnowflake(item));
        id = extractSnowflake(token);
    }
    if (!id) return { error: '❌ Please mention a user or provide a user ID.' };

    const member = await message.guild.members.fetch(id).catch(() => null);
    const user = member?.user || await client.users.fetch(id).catch(() => null);
    if (!user) return { error: '❌ I could not find that user.' };
    return { id, member, user };
}

function hierarchyError(moderator, targetMember, botMember, guild, targetId) {
    if (targetId === moderator.id) {
        return '❌ You cannot moderate yourself.';
    }
    if (targetId === botMember.id) {
        return '❌ I cannot moderate myself.';
    }
    if (targetId === guild.ownerId) {
        return '❌ You cannot moderate the server owner.';
    }
    if (!targetMember) return null;

    if (moderator.id !== guild.ownerId && targetMember.roles.highest.position >= moderator.roles.highest.position) {
        return '❌ You cannot moderate someone whose highest role is equal to or higher than yours.';
    }
    if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
        return '❌ I cannot moderate this user because their highest role is equal to or higher than mine.';
    }
    return null;
}

async function requireGuildCommand(message) {
    if (!message.guild) {
        await message.reply('❌ This command can only be used in a server.');
        return false;
    }
    if (!message.member) {
        try {
            await message.guild.members.fetch(message.author.id);
        } catch (error) {
            await message.reply('❌ Could not resolve your member permissions in this server.');
            return false;
        }
    }
    if (!message.member) {
        await message.reply('❌ Could not resolve your member permissions in this server.');
        return false;
    }
    if (!message.guild.members.me) {
        await message.reply('❌ I could not resolve my own member record in this server.');
        return false;
    }
    return true;
}

function permissionLabel(permission) {
    const labels = {
        [PermissionFlagsBits.ManageMessages]: 'Manage Messages',
        [PermissionFlagsBits.BanMembers]: 'Ban Members',
        [PermissionFlagsBits.KickMembers]: 'Kick Members',
        [PermissionFlagsBits.ModerateMembers]: 'Moderate Members',
        [PermissionFlagsBits.ManageChannels]: 'Manage Channels'
    };
    return labels[permission] || 'the required permission';
}

async function requirePermission(message, permission) {
    if (!(await requireGuildCommand(message))) return false;

    const channel = message.channel;
    const memberPerms = channel.permissionsFor?.(message.member) || message.member.permissions;
    const botMember = message.guild.members.me;
    const botPerms = channel.permissionsFor?.(botMember) || botMember?.permissions;

    if (!memberPerms?.has(permission)) {
        await message.reply(`❌ You need the **${permissionLabel(permission)}** permission to use this command.`);
        return false;
    }
    if (!botPerms?.has(permission)) {
        await message.reply(`❌ I need the **${permissionLabel(permission)}** permission to do that.`);
        return false;
    }
    return true;
}

function buildModerationEmbed({ action, targetUser, moderatorUser, reason, duration }) {
    const embed = new EmbedBuilder()
        .setTitle(action)
        .setColor(ACTION_COLORS[action] || '#3498DB')
        .addFields(
            { name: 'User', value: `${targetUser} (\`${targetUser.id}\`)` },
            { name: 'Moderator', value: `${moderatorUser} (\`${moderatorUser.id}\`)` },
            { name: 'Action', value: action, inline: true }
        )
        .setTimestamp();

    if (duration) {
        embed.addFields({ name: 'Duration', value: duration, inline: true });
    }

    embed.addFields({ name: 'Reason', value: reason || 'No reason provided' });
    return embed;
}

const HELP_CATEGORIES = {
    economy: {
        name: 'Economy',
        emoji: '💰',
        value: '`cash` / `bal` [@user] — View cash balance\n`daily` — Claim $500 every 24h\n`pay @user <amount>` — Send cash to a member'
    },
    games: {
        name: 'Games',
        emoji: '🎰',
        value: '`coinflip <amount|all>` — 50/50 gamble\n`dice <amount|all>` — Dice vs the bot\n`slots <amount|all>` — Slot machine'
    },
    fun: {
        name: 'Fun',
        emoji: '🎉',
        value: '`ship @user` — Compatibility test\n`slap @user` — Slap a member\n`hug @user` — Hug a member\n`joke` — Random joke'
    },
    utility: {
        name: 'Utility',
        emoji: '🛠️',
        value: '`ping` — Bot latency\n`avatar [@user]` — High-res avatar\n`server` — Server info\n`userinfo [@user]` — User info\n`poll <question> | <opt1> | <opt2>` — Reaction poll\n`/globalinfo` — Cross-server info (server owner only)'
    },
    moderation: {
        name: 'Moderation',
        emoji: '🛡️',
        value: '`clear <1-100>` — Bulk delete messages\n`ban @user [reason]` — Ban a member\n`unban <user_id> [reason]` — Unban a user\n`kick @user [reason]` — Kick a member\n`mute @user [duration] [reason]` — Timeout a member\n`unmute @user` — Remove timeout\n`warn @user [reason]` — Record a warning\n`warnings @user` — List warnings\n`lock` / `unlock` — Lock or unlock this channel\n`slowmode <seconds>` — Set slowmode (0 disables)'
    },
    tickets: {
        name: 'Tickets',
        emoji: '🎫',
        value: '`ticket` / `/ticket panel` — Post a Create Ticket panel\n**Create Ticket** button — Open a private ticket\n`ticket close` / `/ticket close` — Close this ticket\n`ticket add @user` / `/ticket add` — Add a member\n`ticket remove @user` / `/ticket remove` — Remove a member\n`ticket rename <name>` / `/ticket rename` — Rename the ticket'
    },
    ai: {
        name: 'AI',
        emoji: '🧠',
        value: '`ask <question>` — Chat with Llama3 via Groq (if configured)'
    },
    owner: {
        name: 'Owner',
        emoji: '👑',
        value: '`givemoney @user <amount>` — Add cash\n`removemoney @user <amount>` — Remove cash\n*Bot owner only*'
    }
};

const HELP_CATEGORY_ORDER = ['economy', 'games', 'fun', 'utility', 'moderation', 'tickets', 'ai', 'owner'];

function buildHelpEmbed(categoryKey, requesterId) {
    const isOwner = requesterId === OWNER_ID;
    const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setFooter({ text: 'Prefixes: !  and  az   •   Slash commands work too' });

    if (categoryKey && HELP_CATEGORIES[categoryKey]) {
        if (categoryKey === 'owner' && !isOwner) {
            return embed
                .setTitle('👑 Owner')
                .setDescription('❌ Those commands are restricted to the bot owner.');
        }
        const cat = HELP_CATEGORIES[categoryKey];
        return embed
            .setTitle(`${cat.emoji} ${cat.name}`)
            .setDescription(cat.value);
    }

    embed
        .setTitle('🤖 AzeSpace Commands')
        .setDescription('Pick a category with `!help <category>` or `/help category:`.\nBoth `!` / `az` prefixes and slash commands are supported.');

    for (const key of HELP_CATEGORY_ORDER) {
        if (key === 'owner' && !isOwner) continue;
        const cat = HELP_CATEGORIES[key];
        embed.addFields({ name: `${cat.emoji} ${cat.name}`, value: cat.value });
    }

    return embed;
}

const GLOBALINFO_COMMAND = {
    name: 'globalinfo',
    description: 'Displays global cross-server information for a user (Server Owner only).',
    options: [
        {
            name: 'user',
            description: 'The user to fetch information for.',
            type: ApplicationCommandOptionType.User,
            required: true
        }
    ]
};

const HELP_SLASH_COMMAND = {
    name: 'help',
    description: 'Show bot commands by category.',
    dm_permission: false,
    options: [
        {
            name: 'category',
            description: 'Category to view',
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: HELP_CATEGORY_ORDER.map((key) => ({
                name: HELP_CATEGORIES[key].name,
                value: key
            }))
        }
    ]
};

const MODERATION_SLASH_COMMANDS = [
    {
        name: 'clear',
        description: 'Bulk delete recent messages in this channel.',
        dm_permission: false,
        default_member_permissions: String(PermissionFlagsBits.ManageMessages),
        options: [
            {
                name: 'amount',
                description: 'Number of messages to delete (1–100)',
                type: ApplicationCommandOptionType.Integer,
                required: true,
                min_value: 1,
                max_value: 100
            }
        ]
    },
    {
        name: 'ban',
        description: 'Ban a user from this server.',
        dm_permission: false,
        default_member_permissions: String(PermissionFlagsBits.BanMembers),
        options: [
            { name: 'user', description: 'User to ban', type: ApplicationCommandOptionType.User, required: true },
            { name: 'reason', description: 'Reason for the ban', type: ApplicationCommandOptionType.String, required: false }
        ]
    },
    {
        name: 'unban',
        description: 'Unban a user from this server.',
        dm_permission: false,
        default_member_permissions: String(PermissionFlagsBits.BanMembers),
        options: [
            { name: 'user', description: 'User to unban', type: ApplicationCommandOptionType.User, required: true },
            { name: 'reason', description: 'Reason for the unban', type: ApplicationCommandOptionType.String, required: false }
        ]
    },
    {
        name: 'kick',
        description: 'Kick a member from this server.',
        dm_permission: false,
        default_member_permissions: String(PermissionFlagsBits.KickMembers),
        options: [
            { name: 'user', description: 'Member to kick', type: ApplicationCommandOptionType.User, required: true },
            { name: 'reason', description: 'Reason for the kick', type: ApplicationCommandOptionType.String, required: false }
        ]
    },
    {
        name: 'mute',
        description: 'Timeout a member (default 10 minutes).',
        dm_permission: false,
        default_member_permissions: String(PermissionFlagsBits.ModerateMembers),
        options: [
            { name: 'user', description: 'Member to mute', type: ApplicationCommandOptionType.User, required: true },
            { name: 'duration', description: 'Duration such as 10m, 1h, 1d (max 28 days)', type: ApplicationCommandOptionType.String, required: false },
            { name: 'reason', description: 'Reason for the mute', type: ApplicationCommandOptionType.String, required: false }
        ]
    },
    {
        name: 'unmute',
        description: 'Remove a timeout from a member.',
        dm_permission: false,
        default_member_permissions: String(PermissionFlagsBits.ModerateMembers),
        options: [
            { name: 'user', description: 'Member to unmute', type: ApplicationCommandOptionType.User, required: true }
        ]
    },
    {
        name: 'warn',
        description: 'Warn a member and store it in the database.',
        dm_permission: false,
        default_member_permissions: String(PermissionFlagsBits.ModerateMembers),
        options: [
            { name: 'user', description: 'Member to warn', type: ApplicationCommandOptionType.User, required: true },
            { name: 'reason', description: 'Reason for the warning', type: ApplicationCommandOptionType.String, required: false }
        ]
    },
    {
        name: 'warnings',
        description: 'Show recorded warnings for a member.',
        dm_permission: false,
        default_member_permissions: String(PermissionFlagsBits.ModerateMembers),
        options: [
            { name: 'user', description: 'Member to inspect', type: ApplicationCommandOptionType.User, required: true }
        ]
    },
    {
        name: 'lock',
        description: 'Lock this channel so @everyone cannot send messages.',
        dm_permission: false,
        default_member_permissions: String(PermissionFlagsBits.ManageChannels)
    },
    {
        name: 'unlock',
        description: 'Unlock this channel.',
        dm_permission: false,
        default_member_permissions: String(PermissionFlagsBits.ManageChannels)
    },
    {
        name: 'slowmode',
        description: 'Set slowmode for this channel. Use 0 to disable.',
        dm_permission: false,
        default_member_permissions: String(PermissionFlagsBits.ManageChannels),
        options: [
            {
                name: 'seconds',
                description: 'Slowmode in seconds (0–21600)',
                type: ApplicationCommandOptionType.Integer,
                required: true,
                min_value: 0,
                max_value: 21600
            }
        ]
    }
];

const TICKET_SLASH_COMMAND = {
    name: 'ticket',
    description: 'Ticket panel and ticket management.',
    dm_permission: false,
    options: [
        {
            name: 'panel',
            description: 'Post a ticket panel with a Create Ticket button.',
            type: ApplicationCommandOptionType.Subcommand
        },
        {
            name: 'close',
            description: 'Close this ticket.',
            type: ApplicationCommandOptionType.Subcommand
        },
        {
            name: 'add',
            description: 'Add a member to this ticket.',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: 'user', description: 'Member to add', type: ApplicationCommandOptionType.User, required: true }
            ]
        },
        {
            name: 'remove',
            description: 'Remove a member from this ticket.',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: 'user', description: 'Member to remove', type: ApplicationCommandOptionType.User, required: true }
            ]
        },
        {
            name: 'rename',
            description: 'Rename this ticket channel.',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: 'name', description: 'New channel name', type: ApplicationCommandOptionType.String, required: true }
            ]
        }
    ]
};

const SLASH_COMMANDS_TO_ENSURE = [
    GLOBALINFO_COMMAND,
    HELP_SLASH_COMMAND,
    ...MODERATION_SLASH_COMMANDS,
    TICKET_SLASH_COMMAND
];

async function upsertGuildSlashCommands(guild) {
    const existing = await guild.commands.fetch();
    const byName = new Map(existing.map((cmd) => [cmd.name, cmd]));
    let created = 0;
    let updated = 0;

    for (const command of SLASH_COMMANDS_TO_ENSURE) {
        const found = byName.get(command.name);
        if (found) {
            await guild.commands.edit(found.id, command);
            updated++;
        } else {
            await guild.commands.create(command);
            created++;
        }
    }

    return { created, updated };
}

async function registerGlobalInfoCommand(guild) {
    try {
        await upsertGuildSlashCommands(guild);
    } catch (error) {
        console.error(`❌ Failed to register slash commands in ${guild.name}:`, error.message);
    }
}

async function safeInteractionReply(interaction, payload) {
    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.followUp(payload);
        }
        return await interaction.reply(payload);
    } catch (error) {
        console.error('Failed to reply to interaction:', error.message);
        return null;
    }
}

async function requireInteractionPermission(interaction, permission) {
    if (!interaction.guild) {
        await safeInteractionReply(interaction, { content: '❌ This command can only be used in a server.', ephemeral: true });
        return false;
    }

    let member = interaction.member;
    if (!member?.permissions) {
        member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    }
    let botMember = interaction.guild.members.me;
    if (!botMember) {
        botMember = await interaction.guild.members.fetchMe().catch(() => null);
    }
    if (!member || !botMember) {
        await safeInteractionReply(interaction, { content: '❌ Could not resolve member permissions in this server.', ephemeral: true });
        return false;
    }

    const channel = interaction.channel;
    const memberPerms = channel?.permissionsFor?.(member) || member.permissions;
    const botPerms = channel?.permissionsFor?.(botMember) || botMember.permissions;

    if (!memberPerms?.has(permission)) {
        await safeInteractionReply(interaction, { content: `❌ You need the **${permissionLabel(permission)}** permission to use this command.`, ephemeral: true });
        return false;
    }
    if (!botPerms?.has(permission)) {
        await safeInteractionReply(interaction, { content: `❌ I need the **${permissionLabel(permission)}** permission to do that.`, ephemeral: true });
        return false;
    }
    return true;
}

function isTicketStaff(member, guild) {
    if (!member || !guild) return false;
    if (member.id === guild.ownerId) return true;
    return member.permissions?.has(PermissionFlagsBits.ManageChannels) || member.permissions?.has(PermissionFlagsBits.Administrator);
}

function sanitizeChannelName(input) {
    const cleaned = String(input || 'ticket')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 100);
    return cleaned || 'ticket';
}

function ticketStaffOverwrites(guild) {
    const overwrites = [];
    for (const role of guild.roles.cache.values()) {
        if (role.id === guild.id) continue;
        if (role.permissions.has(PermissionFlagsBits.Administrator) || role.permissions.has(PermissionFlagsBits.ManageChannels)) {
            overwrites.push({
                id: role.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageMessages,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.EmbedLinks
                ]
            });
        }
    }
    return overwrites;
}

async function postTicketPanel(channel) {
    const embed = new EmbedBuilder()
        .setTitle('🎫 Support Tickets')
        .setDescription('Need help? Click **Create Ticket** below to open a private channel with staff.\nYou can only have one open ticket at a time.')
        .setColor('#5865F2');
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_create')
            .setLabel('Create Ticket')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎫')
    );
    const sent = await channel.send({ embeds: [embed], components: [row] });
    upsertTicketPanelStmt.run(channel.guild.id, channel.id, sent.id);
    return sent;
}

async function createTicketChannel(guild, user) {
    const botMember = guild.members.me || await guild.members.fetchMe();
    const category = guild.channels.cache.find(
        (ch) => ch.type === ChannelType.GuildCategory && /^tickets$/i.test(ch.name)
    );
    const permissionOverwrites = [
        {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
        },
        {
            id: user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
            ]
        },
        {
            id: botMember.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
            ]
        },
        ...ticketStaffOverwrites(guild)
    ];

    return guild.channels.create({
        name: sanitizeChannelName(`ticket-${user.username || user.id}`),
        type: ChannelType.GuildText,
        parent: category?.id || null,
        permissionOverwrites,
        reason: `Ticket opened by ${user.tag || user.id}`
    });
}

async function resolveOpenTicketChannel(guild, userId) {
    const existing = findOpenTicketStmt.get(guild.id, userId);
    if (!existing) return null;
    const channel = await guild.channels.fetch(existing.channel_id).catch(() => null);
    if (channel) return { ticket: existing, channel };
    markTicketClosedStmt.run(new Date().toISOString(), existing.id);
    return null;
}

async function closeTicketRecord(channel, ticket, closer) {
    markTicketClosedStmt.run(new Date().toISOString(), ticket.id);
    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle('🎫 Ticket Closed')
                .setDescription(`Closed by ${closer}. This channel will be deleted in 5 seconds.`)
                .setColor('#E74C3C')
                .setTimestamp()
        ]
    }).catch(() => {});
    setTimeout(() => {
        channel.delete('Ticket closed').catch(() => {});
    }, 5000);
}

async function handleTicketCreateButton(interaction) {
    if (!interaction.guild) {
        return interaction.reply({ content: '❌ Tickets can only be created in a server.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.editReply({ content: '❌ I need the **Manage Channels** permission to create tickets.' });
    }

    const alreadyOpen = await resolveOpenTicketChannel(interaction.guild, interaction.user.id);
    if (alreadyOpen) {
        return interaction.editReply({ content: `❌ You already have an open ticket: ${alreadyOpen.channel}` });
    }

    try {
        const channel = await createTicketChannel(interaction.guild, interaction.user);
        try {
            insertTicketStmt.run(interaction.guild.id, channel.id, interaction.user.id, new Date().toISOString());
        } catch (dbError) {
            if (dbError && (dbError.code === 'SQLITE_CONSTRAINT_UNIQUE' || dbError.code === 'SQLITE_CONSTRAINT')) {
                await channel.delete('Duplicate ticket').catch(() => {});
                const open = await resolveOpenTicketChannel(interaction.guild, interaction.user.id);
                if (open) {
                    return interaction.editReply({ content: `❌ You already have an open ticket: ${open.channel}` });
                }
                return interaction.editReply({ content: '❌ You already have an open ticket.' });
            }
            throw dbError;
        }

        const closeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_close')
                .setLabel('Close Ticket')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒')
        );
        await channel.send({
            content: `${interaction.user}`,
            embeds: [
                new EmbedBuilder()
                    .setTitle('🎫 Ticket Opened')
                    .setDescription(`Welcome ${interaction.user}. Staff will be with you shortly.\nUse \`!ticket close\`, \`/ticket close\`, or the button below to close this ticket.`)
                    .setColor('#5865F2')
                    .setTimestamp()
            ],
            components: [closeRow]
        });
        return interaction.editReply({ content: `✅ Ticket created: ${channel}` });
    } catch (error) {
        console.error('Error creating ticket:', error);
        return interaction.editReply({ content: '❌ Failed to create a ticket. Check my permissions and channel limits.' });
    }
}

async function handleTicketCloseRequest(guild, channel, member, user, reply) {
    const ticket = getTicketByChannelStmt.get(channel.id);
    if (!ticket || ticket.status !== 'open') {
        return reply('❌ This command can only be used inside an open ticket.');
    }
    const canClose = ticket.user_id === user.id || isTicketStaff(member, guild);
    if (!canClose) {
        return reply('❌ Only the ticket owner or staff with **Manage Channels** can close this ticket.');
    }
    await closeTicketRecord(channel, ticket, user);
    return reply('🔒 Closing this ticket…');
}

// Pagination buttons for /globalinfo
const getButtons = (currentPage, totalPages) => {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('globalinfo_prev')
            .setLabel('◀️ Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === 0 || totalPages <= 1),
        new ButtonBuilder()
            .setCustomId('globalinfo_next')
            .setLabel('▶️ Next')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage >= totalPages - 1 || totalPages <= 1),
        new ButtonBuilder()
            .setCustomId('globalinfo_close')
            .setLabel('❌ Close')
            .setStyle(ButtonStyle.Danger)
    );
};

// ==================== DISCORD EVENT LISTENERS ====================

client.once(Events.ClientReady, async () => {
    console.log(`🚀 Bot is now online as ${client.user.tag}!`);
    client.user.setActivity('!help | Managing Server', { type: ActivityType.Playing });

    try {
        let registeredGuilds = 0;
        for (const guild of client.guilds.cache.values()) {
            try {
                const result = await upsertGuildSlashCommands(guild);
                registeredGuilds++;
                console.log(`✅ Synced slash commands in ${guild.name} (created ${result.created}, updated ${result.updated})`);
            } catch (guildError) {
                console.error(`❌ Failed to register slash commands in ${guild.name}:`, guildError.message);
            }
        }

        if (registeredGuilds > 0) {
            // Guild commands appear immediately. Remove leftover global /globalinfo only —
            // do not wipe unrelated global commands with commands.set([]).
            try {
                const globalCmds = await client.application.commands.fetch();
                const leftoverGlobalInfo = globalCmds.find((cmd) => cmd.name === 'globalinfo');
                if (leftoverGlobalInfo) {
                    await leftoverGlobalInfo.delete();
                }
            } catch (cleanupError) {
                console.error('❌ Failed to clean leftover global /globalinfo:', cleanupError.message);
            }
            console.log(`✅ Registered moderation, ticket, help, and /globalinfo commands in ${registeredGuilds} server(s)!`);
        } else {
            const globalCmds = await client.application.commands.fetch();
            const byName = new Map(globalCmds.map((cmd) => [cmd.name, cmd]));
            for (const command of SLASH_COMMANDS_TO_ENSURE) {
                const found = byName.get(command.name);
                if (found) {
                    await client.application.commands.edit(found.id, command);
                } else {
                    await client.application.commands.create(command);
                }
            }
            console.log('✅ Registered slash commands globally (guild registration unavailable).');
        }
    } catch (error) {
        console.error('❌ Failed to register slash commands:', error);
    }
});

client.on(Events.GuildCreate, async (guild) => {
    await registerGlobalInfoCommand(guild);
});

client.on(Events.ChannelDelete, (channel) => {
    try {
        const ticket = getTicketByChannelStmt.get(channel.id);
        if (ticket && ticket.status === 'open') {
            markTicketClosedStmt.run(new Date().toISOString(), ticket.id);
        }
    } catch (error) {
        console.error('[ChannelDelete] Failed to close ticket record:', error.message);
    }
});

// BAN TRACKING: Detect guild ban add (only servers where this bot is installed)
client.on(Events.GuildBanAdd, async (ban) => {
    try {
        const userId = ban.user.id;
        const guildId = ban.guild.id;
        const guildName = ban.guild.name;
        const bannedAt = new Date().toISOString();
        let reason = ban.reason || null;
        let moderatorId = null;

        try {
            const me = ban.guild.members.me;
            if (me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
                const auditLogs = await ban.guild.fetchAuditLogs({
                    limit: 5,
                    type: AuditLogEvent.MemberBanAdd
                });
                const banLog = auditLogs.entries.find((entry) => (
                    entry.target?.id === userId && Date.now() - entry.createdTimestamp < 15000
                ));
                if (banLog) {
                    moderatorId = banLog.executor?.id ?? null;
                    if (!reason && banLog.reason) reason = banLog.reason;
                }
            }
        } catch (auditError) {
            console.error(`[BanAdd] Failed to fetch audit logs for guild ${guildId}:`, auditError.message);
        }

        const inserted = recordBan(userId, guildId, guildName, bannedAt, moderatorId, reason);
        if (inserted) {
            console.log(`[BanAdd] Recorded ban for ${ban.user.tag} in ${guildName}`);
        } else {
            console.log(`[BanAdd] Active ban already recorded for ${ban.user.tag} in ${guildName}, skipping.`);
        }
    } catch (error) {
        console.error('[BanAdd] Error recording ban event:', error);
    }
});

// BAN TRACKING: Detect guild ban remove (unban)
client.on(Events.GuildBanRemove, async (ban) => {
    try {
        const existing = findActiveBanStmt.get(ban.user.id, ban.guild.id);
        if (existing) {
            markUnbannedStmt.run(new Date().toISOString(), existing.id);
            console.log(`[BanRemove] Updated ban record with unban for ${ban.user.tag} in ${ban.guild.name}`);
        } else {
            console.log(`[BanRemove] No active ban record found to update for ${ban.user.tag} in ${ban.guild.name}.`);
        }
    } catch (error) {
        console.error('[BanRemove] Error updating unban event:', error);
    }
});

// SLASH COMMAND + BUTTON INTERACTION HANDLER
client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('globalinfo_')) return;

        if (interaction.customId === 'ticket_create') {
            return handleTicketCreateButton(interaction);
        }

        if (interaction.customId === 'ticket_close') {
            if (!interaction.guild || !interaction.channel) {
                return interaction.reply({ content: '❌ This can only be used in a server ticket.', ephemeral: true }).catch(() => {});
            }
            const ticket = getTicketByChannelStmt.get(interaction.channel.id);
            if (!ticket || ticket.status !== 'open') {
                return interaction.reply({ content: '❌ This is not an open ticket.', ephemeral: true }).catch(() => {});
            }
            const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
            const canClose = ticket.user_id === interaction.user.id || isTicketStaff(member, interaction.guild);
            if (!canClose) {
                return interaction.reply({ content: '❌ Only the ticket owner or staff with **Manage Channels** can close this ticket.', ephemeral: true }).catch(() => {});
            }
            await interaction.reply({ content: '🔒 Closing this ticket…', ephemeral: true }).catch(() => {});
            await closeTicketRecord(interaction.channel, ticket, interaction.user);
            return;
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'help') {
        const category = interaction.options.getString('category');
        return interaction.reply({ embeds: [buildHelpEmbed(category, interaction.user.id)] });
    }

    if (interaction.commandName === 'clear') {
        if (!(await requireInteractionPermission(interaction, PermissionFlagsBits.ManageMessages))) return;
        const amount = interaction.options.getInteger('amount', true);
        try {
            const deleted = await interaction.channel.bulkDelete(amount, true);
            return interaction.reply({ content: `🧹 Deleted **${deleted.size}** message${deleted.size === 1 ? '' : 's'}.`, ephemeral: true });
        } catch (error) {
            console.error('Error in /clear:', error);
            return safeInteractionReply(interaction, { content: '❌ Failed to clear messages. Messages older than 14 days cannot be bulk-deleted.', ephemeral: true });
        }
    }

    if (interaction.commandName === 'ban') {
        if (!(await requireInteractionPermission(interaction, PermissionFlagsBits.BanMembers))) return;
        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        const roleError = hierarchyError(interaction.member, targetMember, interaction.guild.members.me, interaction.guild, targetUser.id);
        if (roleError) return interaction.reply({ content: roleError, ephemeral: true });
        try {
            await interaction.guild.members.ban(targetUser.id, { reason: reason.slice(0, 512) });
            recordBan(targetUser.id, interaction.guild.id, interaction.guild.name, new Date().toISOString(), interaction.user.id, reason);
            return interaction.reply({
                embeds: [buildModerationEmbed({ action: 'Ban', targetUser, moderatorUser: interaction.user, reason })]
            });
        } catch (error) {
            console.error('Error in /ban:', error);
            return safeInteractionReply(interaction, { content: '❌ Failed to ban that user. Check my role position and Ban Members permission.', ephemeral: true });
        }
    }

    if (interaction.commandName === 'unban') {
        if (!(await requireInteractionPermission(interaction, PermissionFlagsBits.BanMembers))) return;
        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';
        try {
            const ban = await interaction.guild.bans.fetch(targetUser.id).catch(() => null);
            if (!ban) {
                return interaction.reply({ content: '❌ That user is not banned in this server.', ephemeral: true });
            }
            await interaction.guild.members.unban(targetUser.id, reason.slice(0, 512));
            const existing = findActiveBanStmt.get(targetUser.id, interaction.guild.id);
            if (existing) {
                markUnbannedStmt.run(new Date().toISOString(), existing.id);
            }
            return interaction.reply({
                embeds: [buildModerationEmbed({ action: 'Unban', targetUser: ban.user, moderatorUser: interaction.user, reason })]
            });
        } catch (error) {
            console.error('Error in /unban:', error);
            return safeInteractionReply(interaction, { content: '❌ Failed to unban that user. Check my Ban Members permission.', ephemeral: true });
        }
    }

    if (interaction.commandName === 'kick') {
        if (!(await requireInteractionPermission(interaction, PermissionFlagsBits.KickMembers))) return;
        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) return interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });
        const roleError = hierarchyError(interaction.member, targetMember, interaction.guild.members.me, interaction.guild, targetUser.id);
        if (roleError) return interaction.reply({ content: roleError, ephemeral: true });
        try {
            await targetMember.kick(reason.slice(0, 512));
            return interaction.reply({
                embeds: [buildModerationEmbed({ action: 'Kick', targetUser, moderatorUser: interaction.user, reason })]
            });
        } catch (error) {
            console.error('Error in /kick:', error);
            return safeInteractionReply(interaction, { content: '❌ Failed to kick that user. Check my role position and Kick Members permission.', ephemeral: true });
        }
    }

    if (interaction.commandName === 'mute') {
        if (!(await requireInteractionPermission(interaction, PermissionFlagsBits.ModerateMembers))) return;
        const targetUser = interaction.options.getUser('user', true);
        const durationInput = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) return interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });
        const roleError = hierarchyError(interaction.member, targetMember, interaction.guild.members.me, interaction.guild, targetUser.id);
        if (roleError) return interaction.reply({ content: roleError, ephemeral: true });

        let durationMs = DEFAULT_MUTE_MS;
        if (durationInput) {
            const parsed = parseDurationMs(durationInput);
            if (!parsed) {
                return interaction.reply({ content: '❌ Invalid duration. Try `10m`, `1h`, or `1d` (max 28 days).', ephemeral: true });
            }
            durationMs = parsed;
        }
        if (durationMs < 1000) {
            return interaction.reply({ content: '❌ Mute duration must be at least 1 second.', ephemeral: true });
        }
        if (durationMs > MAX_TIMEOUT_MS) {
            return interaction.reply({ content: '❌ Mute duration cannot exceed 28 days.', ephemeral: true });
        }
        try {
            await targetMember.timeout(durationMs, reason.slice(0, 512));
            return interaction.reply({
                embeds: [buildModerationEmbed({
                    action: 'Mute',
                    targetUser,
                    moderatorUser: interaction.user,
                    reason,
                    duration: formatDuration(durationMs)
                })]
            });
        } catch (error) {
            console.error('Error in /mute:', error);
            return safeInteractionReply(interaction, { content: '❌ Failed to mute that user. Check my role position and Moderate Members permission.', ephemeral: true });
        }
    }

    if (interaction.commandName === 'unmute') {
        if (!(await requireInteractionPermission(interaction, PermissionFlagsBits.ModerateMembers))) return;
        const targetUser = interaction.options.getUser('user', true);
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) return interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });
        const roleError = hierarchyError(interaction.member, targetMember, interaction.guild.members.me, interaction.guild, targetUser.id);
        if (roleError) return interaction.reply({ content: roleError, ephemeral: true });
        if (!targetMember.isCommunicationDisabled()) {
            return interaction.reply({ content: '❌ That user is not currently muted.', ephemeral: true });
        }
        try {
            await targetMember.timeout(null, 'Timeout removed');
            return interaction.reply({
                embeds: [buildModerationEmbed({
                    action: 'Unmute',
                    targetUser,
                    moderatorUser: interaction.user,
                    reason: 'Timeout removed'
                })]
            });
        } catch (error) {
            console.error('Error in /unmute:', error);
            return safeInteractionReply(interaction, { content: '❌ Failed to unmute that user. Check my role position and Moderate Members permission.', ephemeral: true });
        }
    }

    if (interaction.commandName === 'warn') {
        if (!(await requireInteractionPermission(interaction, PermissionFlagsBits.ModerateMembers))) return;
        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        const roleError = hierarchyError(interaction.member, targetMember, interaction.guild.members.me, interaction.guild, targetUser.id);
        if (roleError) return interaction.reply({ content: roleError, ephemeral: true });
        try {
            insertWarningStmt.run(targetUser.id, interaction.guild.id, interaction.user.id, reason, new Date().toISOString());
            const targetData = getUser(targetUser.id, targetUser.username);
            targetData.warns += 1;
            return interaction.reply({
                embeds: [buildModerationEmbed({ action: 'Warn', targetUser, moderatorUser: interaction.user, reason })]
            });
        } catch (error) {
            console.error('Error in /warn:', error);
            return safeInteractionReply(interaction, { content: '❌ Failed to save that warning.', ephemeral: true });
        }
    }

    if (interaction.commandName === 'warnings') {
        if (!(await requireInteractionPermission(interaction, PermissionFlagsBits.ModerateMembers))) return;
        const targetUser = interaction.options.getUser('user', true);
        const records = getWarningsStmt.all(targetUser.id, interaction.guild.id);
        if (records.length === 0) {
            return interaction.reply({ content: `✅ **${targetUser.tag}** has no recorded warnings in this server.`, ephemeral: true });
        }
        const listed = records.slice(0, 10).map((rec, index) => {
            const when = formatDate(rec.created_at, true);
            const reason = rec.reason || 'No reason provided';
            return `**${index + 1}.** ${when}\n└─ By <@${rec.moderator_id}>\n└─ ${reason}`;
        }).join('\n\n');
        const embed = new EmbedBuilder()
            .setTitle(`Warnings for ${targetUser.tag}`)
            .setDescription(clipField(listed))
            .addFields({ name: 'Total', value: String(records.length), inline: true })
            .setColor('#F39C12')
            .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
            .setFooter({ text: records.length > 10 ? 'Showing the 10 most recent warnings' : 'Recorded by this bot' });
        return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'lock') {
        if (!(await requireInteractionPermission(interaction, PermissionFlagsBits.ManageChannels))) return;
        const channel = interaction.channel;
        if (!channel?.permissionOverwrites) {
            return interaction.reply({ content: '❌ I cannot lock this type of channel.', ephemeral: true });
        }
        try {
            const overwrite = channel.isVoiceBased() ? { Connect: false } : { SendMessages: false };
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, overwrite);
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('Lock')
                    .setColor(ACTION_COLORS.Lock)
                    .setDescription(`🔒 ${channel} has been locked.`)
                    .addFields(
                        { name: 'Moderator', value: `${interaction.user} (\`${interaction.user.id}\`)` },
                        { name: 'Action', value: 'Lock' }
                    )
                    .setTimestamp()]
            });
        } catch (error) {
            console.error('Error in /lock:', error);
            return safeInteractionReply(interaction, { content: '❌ Failed to lock this channel. Check my Manage Channels permission.', ephemeral: true });
        }
    }

    if (interaction.commandName === 'unlock') {
        if (!(await requireInteractionPermission(interaction, PermissionFlagsBits.ManageChannels))) return;
        const channel = interaction.channel;
        if (!channel?.permissionOverwrites) {
            return interaction.reply({ content: '❌ I cannot unlock this type of channel.', ephemeral: true });
        }
        try {
            const overwrite = channel.isVoiceBased() ? { Connect: null } : { SendMessages: null };
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, overwrite);
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('Unlock')
                    .setColor(ACTION_COLORS.Unlock)
                    .setDescription(`🔓 ${channel} has been unlocked.`)
                    .addFields(
                        { name: 'Moderator', value: `${interaction.user} (\`${interaction.user.id}\`)` },
                        { name: 'Action', value: 'Unlock' }
                    )
                    .setTimestamp()]
            });
        } catch (error) {
            console.error('Error in /unlock:', error);
            return safeInteractionReply(interaction, { content: '❌ Failed to unlock this channel. Check my Manage Channels permission.', ephemeral: true });
        }
    }

    if (interaction.commandName === 'slowmode') {
        if (!(await requireInteractionPermission(interaction, PermissionFlagsBits.ManageChannels))) return;
        if (typeof interaction.channel?.setRateLimitPerUser !== 'function') {
            return interaction.reply({ content: '❌ Slowmode can only be set in text channels.', ephemeral: true });
        }
        const seconds = interaction.options.getInteger('seconds', true);
        try {
            await interaction.channel.setRateLimitPerUser(seconds);
            const description = seconds === 0
                ? `🐢 Slowmode disabled in ${interaction.channel}.`
                : `🐢 Slowmode set to **${seconds}** second${seconds === 1 ? '' : 's'} in ${interaction.channel}.`;
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('Slowmode')
                    .setColor(ACTION_COLORS.Slowmode)
                    .setDescription(description)
                    .addFields(
                        { name: 'Moderator', value: `${interaction.user} (\`${interaction.user.id}\`)` },
                        { name: 'Action', value: 'Slowmode' },
                        { name: 'Duration', value: seconds === 0 ? 'Off' : `${seconds} second${seconds === 1 ? '' : 's'}` }
                    )
                    .setTimestamp()]
            });
        } catch (error) {
            console.error('Error in /slowmode:', error);
            return safeInteractionReply(interaction, { content: '❌ Failed to set slowmode. Check my Manage Channels permission.', ephemeral: true });
        }
    }

    if (interaction.commandName === 'ticket') {
        if (!interaction.guild) {
            return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
        }
        const sub = interaction.options.getSubcommand();
        const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

        if (sub === 'panel') {
            if (!(await requireInteractionPermission(interaction, PermissionFlagsBits.ManageChannels))) return;
            try {
                await postTicketPanel(interaction.channel);
                return interaction.reply({ content: '✅ Ticket panel posted.', ephemeral: true });
            } catch (error) {
                console.error('Error in /ticket panel:', error);
                return safeInteractionReply(interaction, { content: '❌ Failed to post the ticket panel.', ephemeral: true });
            }
        }

        const ticket = getTicketByChannelStmt.get(interaction.channel.id);
        if (!ticket || ticket.status !== 'open') {
            return interaction.reply({ content: '❌ This command can only be used inside an open ticket.', ephemeral: true });
        }

        if (sub === 'close') {
            const canClose = ticket.user_id === interaction.user.id || isTicketStaff(member, interaction.guild);
            if (!canClose) {
                return interaction.reply({ content: '❌ Only the ticket owner or staff with **Manage Channels** can close this ticket.', ephemeral: true });
            }
            await interaction.reply({ content: '🔒 Closing this ticket…' });
            await closeTicketRecord(interaction.channel, ticket, interaction.user);
            return;
        }

        if (!isTicketStaff(member, interaction.guild)) {
            return interaction.reply({ content: '❌ You need the **Manage Channels** permission to manage this ticket.', ephemeral: true });
        }

        if (sub === 'add') {
            const targetUser = interaction.options.getUser('user', true);
            if (targetUser.id === ticket.user_id) {
                return interaction.reply({ content: '❌ That user already owns this ticket.', ephemeral: true });
            }
            try {
                await interaction.channel.permissionOverwrites.edit(targetUser.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true,
                    EmbedLinks: true
                });
                return interaction.reply({ content: `✅ Added ${targetUser} to this ticket.` });
            } catch (error) {
                console.error('Error in /ticket add:', error);
                return safeInteractionReply(interaction, { content: '❌ Failed to add that user to this ticket.', ephemeral: true });
            }
        }

        if (sub === 'remove') {
            const targetUser = interaction.options.getUser('user', true);
            if (targetUser.id === ticket.user_id) {
                return interaction.reply({ content: '❌ You cannot remove the ticket owner.', ephemeral: true });
            }
            if (targetUser.id === interaction.client.user.id) {
                return interaction.reply({ content: '❌ You cannot remove the bot from this ticket.', ephemeral: true });
            }
            try {
                await interaction.channel.permissionOverwrites.delete(targetUser.id);
                return interaction.reply({ content: `✅ Removed ${targetUser} from this ticket.` });
            } catch (error) {
                console.error('Error in /ticket remove:', error);
                return safeInteractionReply(interaction, { content: '❌ Failed to remove that user from this ticket.', ephemeral: true });
            }
        }

        if (sub === 'rename') {
            const name = sanitizeChannelName(interaction.options.getString('name', true));
            try {
                await interaction.channel.setName(name, `Ticket renamed by ${interaction.user.tag}`);
                return interaction.reply({ content: `✅ Ticket renamed to \`${name}\`.` });
            } catch (error) {
                console.error('Error in /ticket rename:', error);
                return safeInteractionReply(interaction, { content: '❌ Failed to rename this ticket.', ephemeral: true });
            }
        }
        return;
    }

    if (interaction.commandName !== 'globalinfo') return;

    try {
        if (!interaction.guild) {
            return interaction.reply({ content: '❌ This command can only be used within a server.', ephemeral: true });
        }

        if (!interaction.guild.ownerId) {
            try {
                await interaction.guild.fetch();
            } catch (fetchError) {
                console.error('[globalinfo] Failed to fetch guild owner:', fetchError.message);
                return interaction.reply({ content: '❌ Could not verify the server owner for this guild.', ephemeral: true });
            }
        }

        if (!(interaction.guild.ownerId === interaction.user.id)) {
            return interaction.reply({ content: '❌ Only the server owner can use /globalinfo.', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('user', false);
        if (!targetUser) {
            return interaction.reply({ content: '❌ Target user not found.', ephemeral: true });
        }

        await interaction.deferReply();

        const mutualServers = [];
        await Promise.all(Array.from(client.guilds.cache.values()).map(async (guild) => {
            if (!guild.available) return;
            try {
                const member = await guild.members.fetch(targetUser.id);
                if (member) mutualServers.push(guild.name);
            } catch (err) {
                // User is not in this guild, or the guild/member is inaccessible.
            }
        }));
        mutualServers.sort((a, b) => a.localeCompare(b));

        let allBans = [];
        try {
            allBans = getBansForUserStmt.all(targetUser.id);
        } catch (dbError) {
            console.error('[globalinfo] Failed to query ban records:', dbError);
            return interaction.editReply({ content: '❌ Failed to read ban history from the database.' });
        }

        const PAGE_SIZE = 5;
        const totalPages = Math.max(1, Math.ceil(allBans.length / PAGE_SIZE));
        const displayName = targetUser.displayName && targetUser.displayName !== targetUser.username
            ? targetUser.displayName
            : 'None';
        const mutualText = mutualServers.length
            ? clipField(mutualServers.join('\n'))
            : 'None';

        const generateEmbed = (page) => {
            const startIndex = page * PAGE_SIZE;
            const pageBans = allBans.slice(startIndex, startIndex + PAGE_SIZE);

            let banHistoryText = 'No recorded ban history.';
            if (allBans.length > 0) {
                banHistoryText = pageBans.map((rec) => {
                    const serverName = rec.guild_name || 'Unknown Server';
                    if (rec.unbanned_at) {
                        return `**${serverName}**\n└─ Banned: ${formatDate(rec.banned_at, false)}\n└─ Unbanned: ${formatDate(rec.unbanned_at, false)}`;
                    }
                    return `**${serverName}**\n└─ Banned: ${formatDate(rec.banned_at, true)}`;
                }).join('\n\n');
            }

            const banTitle = allBans.length > PAGE_SIZE
                ? `🚫 Recorded Ban History (Page ${page + 1}/${totalPages})`
                : '🚫 Recorded Ban History';

            return new EmbedBuilder()
                .setTitle('AZ GlobalInfo')
                .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
                .addFields(
                    { name: '👤 Username', value: targetUser.username || 'Unknown' },
                    { name: '🏷️ Display Name', value: displayName },
                    { name: '🆔 User ID', value: targetUser.id },
                    { name: '📅 Account Created', value: formatCreationDate(targetUser.createdAt) },
                    { name: '🤖 Bot Status', value: targetUser.bot ? 'Bot' : 'User' },
                    { name: banTitle, value: clipField(banHistoryText) },
                    { name: `🌐 Mutual Servers (${mutualServers.length})`, value: mutualText },
                    { name: 'ℹ️ Note', value: 'Ban history only contains records collected by this bot in servers where it is installed. It does **not** know every Discord server.' }
                )
                .setColor('#E74C3C')
                .setFooter({ text: `Queried by server owner: ${interaction.user.username} • Bot-recorded data only` });
        };

        const response = await interaction.editReply({
            embeds: [generateEmbed(0)],
            components: [getButtons(0, totalPages)]
        });

        const collector = response.createMessageComponentCollector({
            filter: (i) => i.customId === 'globalinfo_prev' || i.customId === 'globalinfo_next' || i.customId === 'globalinfo_close',
            time: 300000
        });

        let currentPage = 0;

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '❌ Only the command executor can use these buttons.', ephemeral: true });
            }

            try {
                if (i.customId === 'globalinfo_prev') {
                    currentPage = Math.max(0, currentPage - 1);
                    await i.update({
                        embeds: [generateEmbed(currentPage)],
                        components: [getButtons(currentPage, totalPages)]
                    });
                } else if (i.customId === 'globalinfo_next') {
                    currentPage = Math.min(totalPages - 1, currentPage + 1);
                    await i.update({
                        embeds: [generateEmbed(currentPage)],
                        components: [getButtons(currentPage, totalPages)]
                    });
                } else if (i.customId === 'globalinfo_close') {
                    collector.stop('closed');
                    await i.deferUpdate().catch(() => {});
                }
            } catch (buttonError) {
                console.error('[globalinfo] Button interaction failed:', buttonError);
            }
        });

        collector.on('end', async (_collected, reason) => {
            try {
                if (reason === 'closed') {
                    await interaction.deleteReply().catch(() => {});
                } else {
                    await interaction.editReply({ components: [] }).catch(() => {});
                }
            } catch (e) {
                // Ignored
            }
        });
    } catch (error) {
        console.error('Error executing /globalinfo:', error);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: '❌ An error occurred while executing this command.', ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ An error occurred while executing this command.', ephemeral: true });
            }
        } catch (err) {
            // Ignored
        }
    }
});

// ==================== PREFIX MESSAGE COMMANDS ====================

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim();
    
    // Check if the message starts with one of our prefixes
    const matchedPrefix = PREFIXES.find(p => content.toLowerCase().startsWith(p));
    if (!matchedPrefix) return;

    // Extract command and arguments
    const rawCommand = content.slice(matchedPrefix.length).trim();
    if (!rawCommand) return;

    const args = rawCommand.split(/ +/);
    const command = args.shift().toLowerCase();
    const user = getUser(message.author.id, message.author.username);

    // ==================== OWNER COMMANDS ====================
    if (command === 'givemoney' || command === 'addmoney') {
        if (message.author.id !== OWNER_ID) {
            return message.reply('🚫 Only the bot owner can use this command.');
        }
        const target = message.mentions.users.first();
        const amount = parseInt(args[1]);

        if (!target || isNaN(amount)) {
            return message.reply('❌ Usage: `!givemoney @user <amount>`');
        }

        const targetUser = getUser(target.id, target.username);
        targetUser.cash += amount;

        const embed = new EmbedBuilder()
            .setTitle('💵 Admin Cash Transfer')
            .setDescription(`Successfully added **$${amount.toLocaleString()}** cash to **${target.username}**.\nNew Balance: **$${targetUser.cash.toLocaleString()}**`)
            .setColor('#2ECC71');

        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'removemoney') {
        if (message.author.id !== OWNER_ID) {
            return message.reply('🚫 Only the bot owner can use this command.');
        }
        const target = message.mentions.users.first();
        const amount = parseInt(args[1]);

        if (!target || isNaN(amount)) {
            return message.reply('❌ Usage: `!removemoney @user <amount>`');
        }

        const targetUser = getUser(target.id, target.username);
        targetUser.cash = Math.max(0, targetUser.cash - amount);

        const embed = new EmbedBuilder()
            .setTitle('💵 Admin Cash Removal')
            .setDescription(`Successfully removed **$${amount.toLocaleString()}** cash from **${target.username}**.\nNew Balance: **$${targetUser.cash.toLocaleString()}**`)
            .setColor('#E74C3C');

        return message.channel.send({ embeds: [embed] });
    }

    // ==================== ECONOMY COMMANDS ====================
    if (command === 'cash' || command === 'bal' || command === 'balance') {
        const target = message.mentions.users.first() || message.author;
        const targetUser = getUser(target.id, target.username);
        
        const embed = new EmbedBuilder()
            .setTitle('💰 Balance')
            .setDescription(`**${target.username}** has **$${targetUser.cash.toLocaleString()}** cash!`)
            .setColor('#F1C40F');

        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'daily') {
        const now = Date.now();
        const cooldown = 24 * 60 * 60 * 1000; // 24 hours

        if (now - user.dailyLastClaimed < cooldown) {
            const timeLeft = cooldown - (now - user.dailyLastClaimed);
            const hours = Math.floor(timeLeft / (60 * 60 * 1000));
            const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
            return message.reply(`⏳ You've already claimed your daily cash! Come back in **${hours}h ${minutes}m**.`);
        }

        user.cash += 500;
        user.dailyLastClaimed = now;

        const embed = new EmbedBuilder()
            .setTitle('🎁 Daily Reward')
            .setDescription(`You claimed your daily reward and received **$500** cash!\nNew Balance: **$${user.cash.toLocaleString()}**`)
            .setColor('#2ECC71');

        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'pay' || command === 'send' || command === 'transfer') {
        const target = message.mentions.users.first();
        const amount = parseInt(args[1]);

        if (!target) {
            return message.reply('❌ Usage: `!pay @user <amount>`');
        }
        if (target.id === message.author.id) {
            return message.reply("❌ You can't send money to yourself!");
        }
        if (target.bot) {
            return message.reply("❌ You can't send money to a bot!");
        }
        if (isNaN(amount) || amount <= 0) {
            return message.reply('❌ Please specify a valid positive amount.');
        }
        if (user.cash < amount) {
            return message.reply(`❌ Insufficient balance! You need **$${(amount - user.cash).toLocaleString()}** more cash.`);
        }

        const targetUser = getUser(target.id, target.username);
        user.cash -= amount;
        targetUser.cash += amount;

        const embed = new EmbedBuilder()
            .setTitle('💸 Cash Transfer')
            .setDescription(`**${message.author.username}** sent **$${amount.toLocaleString()}** to **${target.username}**!\n\nYour New Balance: **$${user.cash.toLocaleString()}**`)
            .setColor('#2ECC71');

        return message.channel.send({ embeds: [embed] });
    }

    // ==================== ECONOMY GAMES ====================
    if (command === 'coinflip' || command === 'cf') {
        const amountInput = args[0];
        let bet = amountInput === 'all' ? user.cash : parseInt(amountInput);

        if (isNaN(bet) || bet <= 0) {
            return message.reply('❌ Usage: `!coinflip <amount | all>`');
        }
        if (user.cash < bet) {
            return message.reply('❌ You do not have enough cash for this bet!');
        }

        const won = Math.random() < 0.5;
        if (won) {
            user.cash += bet;
            return message.reply(`🎰 **Coinflip** | You flipped a coin and won! **+$${bet.toLocaleString()}** cash. New Balance: **$${user.cash.toLocaleString()}**`);
        } else {
            user.cash -= bet;
            return message.reply(`🎰 **Coinflip** | You flipped a coin and lost... **-$${bet.toLocaleString()}** cash. New Balance: **$${user.cash.toLocaleString()}**`);
        }
    }

    if (command === 'dice') {
        const amountInput = args[0];
        let bet = amountInput === 'all' ? user.cash : parseInt(amountInput);

        if (isNaN(bet) || bet <= 0) {
            return message.reply('❌ Usage: `!dice <amount | all>`');
        }
        if (user.cash < bet) {
            return message.reply('❌ You do not have enough cash for this bet!');
        }

        const userRoll = Math.floor(Math.random() * 6) + 1;
        const botRoll = Math.floor(Math.random() * 6) + 1;

        if (userRoll > botRoll) {
            user.cash += bet;
            return message.reply(`🎲 **Dice** | You rolled a **${userRoll}**! I rolled a **${botRoll}**.\n🎉 You won! **+$${bet.toLocaleString()}** cash. New Balance: **$${user.cash.toLocaleString()}**`);
        } else if (userRoll < botRoll) {
            user.cash -= bet;
            return message.reply(`🎲 **Dice** | You rolled a **${userRoll}**... I rolled a **${botRoll}**.\n😢 You lost... **-$${bet.toLocaleString()}** cash. New Balance: **$${user.cash.toLocaleString()}**`);
        } else {
            return message.reply(`🎲 **Dice** | Both of us rolled a **${userRoll}**! It's a draw. Your cash remains unchanged.`);
        }
    }

    if (command === 'slots') {
        const amountInput = args[0];
        let bet = amountInput === 'all' ? user.cash : parseInt(amountInput);

        if (isNaN(bet) || bet <= 0) {
            return message.reply('❌ Usage: `!slots <amount | all>`');
        }
        if (user.cash < bet) {
            return message.reply('❌ You do not have enough cash for this bet!');
        }

        const EMOJIS = ['🍒', '🍋', '🍇', '💎', '🔔', '🍀', '🍎'];
        const r1 = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
        const r2 = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
        const r3 = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

        let win = 0;
        let messageText = '';

        if (r1 === r2 && r2 === r3) {
            if (r1 === '💎') {
                win = bet * 10;
                messageText = `💎 JACKPOT! 💎 Triple Diamonds! **10x payout!**`;
            } else {
                win = bet * 5;
                messageText = `🎉 Three of a kind! **5x payout!**`;
            }
        } else if (r1 === r2 || r2 === r3 || r1 === r3) {
            win = bet * 2;
            messageText = `✨ Two of a kind! **2x payout!**`;
        }

        if (win > 0) {
            user.cash += (win - bet);
            const embed = new EmbedBuilder()
                .setTitle('🎰 Slot Machine')
                .setDescription(`[ ${r1} | ${r2} | ${r3} ]\n\n${messageText}\nWon: **$${win.toLocaleString()}**\nNew Balance: **$${user.cash.toLocaleString()}**`)
                .setColor('#2ECC71');
            return message.channel.send({ embeds: [embed] });
        } else {
            user.cash -= bet;
            const embed = new EmbedBuilder()
                .setTitle('🎰 Slot Machine')
                .setDescription(`[ ${r1} | ${r2} | ${r3} ]\n\nNo matches. Better luck next time!\nLost: **$${bet.toLocaleString()}**\nNew Balance: **$${user.cash.toLocaleString()}**`)
                .setColor('#E74C3C');
            return message.channel.send({ embeds: [embed] });
        }
    }

    // ==================== SOCIAL & FUN COMMANDS ====================
    if (command === 'ship') {
        let u1 = message.author;
        let u2 = message.mentions.users.first();

        const mentioned = message.mentions.users.size;
        if (mentioned >= 2) {
            const usersArr = Array.from(message.mentions.users.values());
            u1 = usersArr[0];
            u2 = usersArr[1];
        } else if (mentioned === 1) {
            u1 = message.author;
            u2 = message.mentions.users.first();
        } else {
            return message.reply('❌ Usage: `!ship @user` or `!ship @user1 @user2`');
        }

        if (u1.id === u2.id) {
            return message.reply("Self-love is important, but let's try shipping yourself with someone else!");
        }

        const score = Math.floor(Math.random() * 101);
        let bar = '';
        const filled = Math.round(score / 10);
        for (let i = 0; i < 10; i++) {
            bar += i < filled ? '❤️' : '🖤';
        }

        let desc = '';
        if (score >= 90) desc = '💞 True Soulmates! Perfect match!';
        else if (score >= 70) desc = '💖 Extremely compatible. Love is in the air!';
        else if (score >= 50) desc = '🤝 Good potential. Nice connection!';
        else if (score >= 30) desc = '📉 Just friends. Maybe a little awkward.';
        else desc = '💔 Completely incompatible. Yikes!';

        const embed = new EmbedBuilder()
            .setTitle('💘 Love Match Ship')
            .setDescription(`Shipping **${u1.username}** and **${u2.username}**:\n\n**${score}%** compatibility!\n${bar}\n\n${desc}`)
            .setColor('#E91E63');

        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'slap') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('❌ Usage: `!slap @user`');
        if (target.id === message.author.id) return message.reply("You can't slap yourself!");

        const slapMessages = [
            `slapped ${target.username} with a giant, smelly fish! 🐟`,
            `delivered a massive facepalm slap to ${target.username}! ✋`,
            `gently slapped ${target.username} to wake them up. 😴`,
            `slapped ${target.username} with a rubber chicken! 🐔`
        ];
        const randomMsg = slapMessages[Math.floor(Math.random() * slapMessages.length)];
        return message.channel.send(`👋 **${message.author.username}** ${randomMsg}`);
    }

    if (command === 'hug') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('❌ Usage: `!hug @user`');

        if (target.id === message.author.id) {
            return message.channel.send(`🤗 **${message.author.username}** wrapped their own arms around themselves and gave a cozy hug! Self-love is wonderful!`);
        }

        return message.channel.send(`🤗 **${message.author.username}** gave **${target.username}** a big, warm hug!`);
    }

    if (command === 'joke') {
        const randomJoke = JOKES[Math.floor(Math.random() * JOKES.length)];
        return message.channel.send(`😄 **Joke:** ${randomJoke}`);
    }

    if (command === 'ask' || command === 'ai') {
        const prompt = args.join(' ');
        if (!prompt) return message.reply('❌ Usage: `!ask <your question>`');

        if (!groq) {
            return message.reply('💡 Groq AI is not currently configured on this bot. Ask your server admin to configure the `GROQ_API_KEY` in the `.env` file!');
        }

        const processingMsg = await message.reply('🧠 Thinking...');
        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama3-8b-8192',
                max_tokens: 500
            });

            const replyText = chatCompletion.choices[0]?.message?.content || 'Sorry, I couldn\'t generate a response.';
            await processingMsg.edit(replyText.substring(0, 2000));
        } catch (error) {
            console.error('Groq API Error:', error);
            await processingMsg.edit('❌ An error occurred while generating a response from the AI.');
        }
        return;
    }

    // ==================== UTILITY COMMANDS ====================
    if (command === 'ping') {
        const sent = await message.reply('Pinging...');
        const latency = sent.createdTimestamp - message.createdTimestamp;
        return sent.edit(`🏓 **Pong!**\nLatency: **${latency}ms**\nAPI Latency: **${Math.round(client.ws.ping)}ms**`);
    }

    if (command === 'avatar' || command === 'av') {
        const target = message.mentions.users.first() || message.author;
        const avatarUrl = target.displayAvatarURL({ dynamic: true, size: 1024 });

        const embed = new EmbedBuilder()
            .setTitle(`${target.username}'s Avatar`)
            .setImage(avatarUrl)
            .setColor('#3498DB');

        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'server' || command === 'serverinfo') {
        const guild = message.guild;
        if (!guild) return message.reply('This command can only be used in a server.');

        const owner = await guild.fetchOwner();
        const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;

        const embed = new EmbedBuilder()
            .setTitle(`📊 Server Information: ${guild.name}`)
            .addFields(
                { name: 'Owner', value: owner.user.tag, inline: true },
                { name: 'Members', value: `${guild.memberCount}`, inline: true },
                { name: 'Boost Level', value: `Level ${guild.premiumTier} (${guild.premiumSubscriptionCount} Boosts)`, inline: true },
                { name: 'Channels', value: `💬 ${textChannels} Text / 🔊 ${voiceChannels} Voice`, inline: true },
                { name: 'Created At', value: guild.createdAt.toLocaleDateString(), inline: true }
            )
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .setColor('#3498DB');

        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'userinfo' || command === 'user') {
        const target = message.mentions.users.first() || message.author;
        const member = await message.guild.members.fetch(target.id).catch(() => null);

        const embed = new EmbedBuilder()
            .setTitle(`👤 User Information: ${target.username}`)
            .setThumbnail(target.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'ID', value: target.id, inline: true },
                { name: 'Tag', value: target.tag, inline: true },
                { name: 'Created At', value: target.createdAt.toLocaleDateString(), inline: true }
            )
            .setColor('#3498DB');

        if (member) {
            embed.addFields(
                { name: 'Joined Server At', value: member.joinedAt ? member.joinedAt.toLocaleDateString() : 'Unknown', inline: true },
                { name: 'Roles', value: member.roles.cache.size > 1 ? member.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name).slice(0, 10).join(', ') : 'None', inline: true }
            );
        }

        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'poll') {
        const pollContent = args.join(' ');
        if (!pollContent) {
            return message.reply('❌ Usage: `!poll <question> | <option 1> | <option 2> ...` (Up to 9 options, or skip options for a simple Yes/No poll)');
        }

        const parts = pollContent.split('|').map(p => p.trim());
        const question = parts[0];
        const options = parts.slice(1);

        const embed = new EmbedBuilder()
            .setTitle('📊 New Poll')
            .setColor('#9B59B6')
            .setFooter({ text: `Created by ${message.author.username}` });

        if (options.length === 0) {
            embed.setDescription(`**${question}**\n\n👍 Yes\n👎 No`);
            const sentMsg = await message.channel.send({ embeds: [embed] });
            await sentMsg.react('👍');
            await sentMsg.react('👎');
        } else {
            if (options.length > 9) {
                return message.reply('❌ Polls are limited to a maximum of 9 options.');
            }

            const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
            let desc = `**${question}**\n\n`;
            for (let i = 0; i < options.length; i++) {
                desc += `${NUMBER_EMOJIS[i]} ${options[i]}\n`;
            }

            embed.setDescription(desc);
            const sentMsg = await message.channel.send({ embeds: [embed] });
            for (let i = 0; i < options.length; i++) {
                await sentMsg.react(NUMBER_EMOJIS[i]);
            }
        }
        return;
    }

    // ==================== MODERATION COMMANDS ====================
    if (command === 'clear' || command === 'purge') {
        if (!(await requirePermission(message, PermissionFlagsBits.ManageMessages))) return;

        const amount = parseInt(args[0], 10);
        if (isNaN(amount) || amount < 1 || amount > 100) {
            return message.reply('❌ Usage: `az clear <amount>` (1–100)');
        }

        try {
            await message.delete().catch(() => {});
            const deleted = await message.channel.bulkDelete(amount, true);
            const reply = await message.channel.send(`🧹 Deleted **${deleted.size}** message${deleted.size === 1 ? '' : 's'}.`);
            setTimeout(() => reply.delete().catch(() => {}), 5000);
        } catch (error) {
            console.error('Error in clear command:', error);
            return message.channel.send('❌ Failed to clear messages. Messages older than 14 days cannot be bulk-deleted.').catch(() => {});
        }
        return;
    }

    if (command === 'ban') {
        if (!(await requirePermission(message, PermissionFlagsBits.BanMembers))) return;

        const target = await resolveModerationTarget(message, args);
        if (target.error) return message.reply(target.error);

        const roleError = hierarchyError(message.member, target.member, message.guild.members.me, message.guild, target.id);
        if (roleError) return message.reply(roleError);

        const reason = leftoverArgs(args, target.id).join(' ').trim() || 'No reason provided';

        try {
            await message.guild.members.ban(target.id, { reason: reason.slice(0, 512) });
            recordBan(
                target.id,
                message.guild.id,
                message.guild.name,
                new Date().toISOString(),
                message.author.id,
                reason
            );
            return message.channel.send({
                embeds: [buildModerationEmbed({
                    action: 'Ban',
                    targetUser: target.user,
                    moderatorUser: message.author,
                    reason
                })]
            });
        } catch (error) {
            console.error('Error in ban command:', error);
            return message.reply('❌ Failed to ban that user. Check my role position and Ban Members permission.');
        }
    }

    if (command === 'unban') {
        if (!(await requirePermission(message, PermissionFlagsBits.BanMembers))) return;

        const userId = extractSnowflake(args[0]);
        if (!userId) {
            return message.reply('❌ Usage: `az unban <user_id> [reason]`');
        }

        const reason = args.slice(1).join(' ').trim() || 'No reason provided';

        try {
            const ban = await message.guild.bans.fetch(userId).catch(() => null);
            if (!ban) {
                return message.reply('❌ That user is not banned in this server.');
            }

            await message.guild.members.unban(userId, reason.slice(0, 512));

            const existing = findActiveBanStmt.get(userId, message.guild.id);
            if (existing) {
                markUnbannedStmt.run(new Date().toISOString(), existing.id);
            }

            return message.channel.send({
                embeds: [buildModerationEmbed({
                    action: 'Unban',
                    targetUser: ban.user,
                    moderatorUser: message.author,
                    reason
                })]
            });
        } catch (error) {
            console.error('Error in unban command:', error);
            return message.reply('❌ Failed to unban that user. Check the user ID and my Ban Members permission.');
        }
    }

    if (command === 'kick') {
        if (!(await requirePermission(message, PermissionFlagsBits.KickMembers))) return;

        const target = await resolveModerationTarget(message, args);
        if (target.error) return message.reply(target.error);
        if (!target.member) return message.reply('❌ That user is not in this server.');

        const roleError = hierarchyError(message.member, target.member, message.guild.members.me, message.guild, target.id);
        if (roleError) return message.reply(roleError);

        const reason = leftoverArgs(args, target.id).join(' ').trim() || 'No reason provided';

        try {
            await target.member.kick(reason.slice(0, 512));
            return message.channel.send({
                embeds: [buildModerationEmbed({
                    action: 'Kick',
                    targetUser: target.user,
                    moderatorUser: message.author,
                    reason
                })]
            });
        } catch (error) {
            console.error('Error in kick command:', error);
            return message.reply('❌ Failed to kick that user. Check my role position and Kick Members permission.');
        }
    }

    if (command === 'mute' || command === 'timeout') {
        if (!(await requirePermission(message, PermissionFlagsBits.ModerateMembers))) return;

        const target = await resolveModerationTarget(message, args);
        if (target.error) return message.reply(target.error);
        if (!target.member) return message.reply('❌ That user is not in this server.');

        const roleError = hierarchyError(message.member, target.member, message.guild.members.me, message.guild, target.id);
        if (roleError) return message.reply(roleError);

        const rest = leftoverArgs(args, target.id);
        const parsedDuration = parseDurationMs(rest[0]);
        let durationMs = DEFAULT_MUTE_MS;
        if (parsedDuration) {
            durationMs = parsedDuration;
            rest.shift();
        }
        const reason = rest.join(' ').trim() || 'No reason provided';

        if (durationMs < 1000) {
            return message.reply('❌ Mute duration must be at least 1 second.');
        }
        if (durationMs > MAX_TIMEOUT_MS) {
            return message.reply('❌ Mute duration cannot exceed 28 days.');
        }

        try {
            await target.member.timeout(durationMs, reason.slice(0, 512));
            return message.channel.send({
                embeds: [buildModerationEmbed({
                    action: 'Mute',
                    targetUser: target.user,
                    moderatorUser: message.author,
                    reason,
                    duration: formatDuration(durationMs)
                })]
            });
        } catch (error) {
            console.error('Error in mute command:', error);
            return message.reply('❌ Failed to mute that user. Check my role position and Moderate Members permission.');
        }
    }

    if (command === 'unmute' || command === 'untimeout') {
        if (!(await requirePermission(message, PermissionFlagsBits.ModerateMembers))) return;

        const target = await resolveModerationTarget(message, args);
        if (target.error) return message.reply(target.error);
        if (!target.member) return message.reply('❌ That user is not in this server.');

        const roleError = hierarchyError(message.member, target.member, message.guild.members.me, message.guild, target.id);
        if (roleError) return message.reply(roleError);

        if (!target.member.isCommunicationDisabled()) {
            return message.reply('❌ That user is not currently muted.');
        }

        try {
            await target.member.timeout(null, 'Timeout removed');
            return message.channel.send({
                embeds: [buildModerationEmbed({
                    action: 'Unmute',
                    targetUser: target.user,
                    moderatorUser: message.author,
                    reason: leftoverArgs(args, target.id).join(' ').trim() || 'Timeout removed'
                })]
            });
        } catch (error) {
            console.error('Error in unmute command:', error);
            return message.reply('❌ Failed to unmute that user. Check my role position and Moderate Members permission.');
        }
    }

    if (command === 'warn') {
        if (!(await requirePermission(message, PermissionFlagsBits.ModerateMembers))) return;

        const target = await resolveModerationTarget(message, args);
        if (target.error) return message.reply(target.error);

        const roleError = hierarchyError(message.member, target.member, message.guild.members.me, message.guild, target.id);
        if (roleError) return message.reply(roleError);

        const reason = leftoverArgs(args, target.id).join(' ').trim() || 'No reason provided';

        try {
            insertWarningStmt.run(target.id, message.guild.id, message.author.id, reason, new Date().toISOString());
            const targetData = getUser(target.id, target.user.username);
            targetData.warns += 1;

            return message.channel.send({
                embeds: [buildModerationEmbed({
                    action: 'Warn',
                    targetUser: target.user,
                    moderatorUser: message.author,
                    reason
                })]
            });
        } catch (error) {
            console.error('Error in warn command:', error);
            return message.reply('❌ Failed to save that warning.');
        }
    }

    if (command === 'warnings' || command === 'warns') {
        if (!(await requirePermission(message, PermissionFlagsBits.ModerateMembers))) return;

        const target = await resolveModerationTarget(message, args);
        if (target.error) return message.reply(target.error);

        const records = getWarningsStmt.all(target.id, message.guild.id);
        if (records.length === 0) {
            return message.reply(`✅ **${target.user.tag}** has no recorded warnings in this server.`);
        }

        const listed = records.slice(0, 10).map((rec, index) => {
            const when = formatDate(rec.created_at, true);
            const reason = rec.reason || 'No reason provided';
            return `**${index + 1}.** ${when}\n└─ By <@${rec.moderator_id}>\n└─ ${reason}`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
            .setTitle(`Warnings for ${target.user.tag}`)
            .setDescription(clipField(listed))
            .addFields({ name: 'Total', value: String(records.length), inline: true })
            .setColor('#F39C12')
            .setThumbnail(target.user.displayAvatarURL({ size: 256 }))
            .setFooter({ text: records.length > 10 ? 'Showing the 10 most recent warnings' : 'Recorded by this bot' });

        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'lock') {
        if (!(await requirePermission(message, PermissionFlagsBits.ManageChannels))) return;

        const channel = message.channel;
        if (!channel.permissionOverwrites) {
            return message.reply('❌ I cannot lock this type of channel.');
        }

        try {
            const overwrite = channel.isVoiceBased()
                ? { Connect: false }
                : { SendMessages: false };
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, overwrite);
            return message.channel.send({
                embeds: [new EmbedBuilder()
                    .setTitle('Lock')
                    .setColor(ACTION_COLORS.Lock)
                    .setDescription(`🔒 ${channel} has been locked.`)
                    .addFields(
                        { name: 'Moderator', value: `${message.author} (\`${message.author.id}\`)` },
                        { name: 'Action', value: 'Lock' }
                    )
                    .setTimestamp()]
            });
        } catch (error) {
            console.error('Error in lock command:', error);
            return message.reply('❌ Failed to lock this channel. Check my Manage Channels permission.');
        }
    }

    if (command === 'unlock') {
        if (!(await requirePermission(message, PermissionFlagsBits.ManageChannels))) return;

        const channel = message.channel;
        if (!channel.permissionOverwrites) {
            return message.reply('❌ I cannot unlock this type of channel.');
        }

        try {
            const overwrite = channel.isVoiceBased()
                ? { Connect: null }
                : { SendMessages: null };
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, overwrite);
            return message.channel.send({
                embeds: [new EmbedBuilder()
                    .setTitle('Unlock')
                    .setColor(ACTION_COLORS.Unlock)
                    .setDescription(`🔓 ${channel} has been unlocked.`)
                    .addFields(
                        { name: 'Moderator', value: `${message.author} (\`${message.author.id}\`)` },
                        { name: 'Action', value: 'Unlock' }
                    )
                    .setTimestamp()]
            });
        } catch (error) {
            console.error('Error in unlock command:', error);
            return message.reply('❌ Failed to unlock this channel. Check my Manage Channels permission.');
        }
    }

    if (command === 'slowmode' || command === 'slow') {
        if (!(await requirePermission(message, PermissionFlagsBits.ManageChannels))) return;

        if (typeof message.channel.setRateLimitPerUser !== 'function') {
            return message.reply('❌ Slowmode can only be set in text channels.');
        }

        const seconds = parseInt(args[0], 10);
        if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
            return message.reply('❌ Usage: `az slowmode <seconds>` (0–21600). Use `0` to disable.');
        }

        try {
            await message.channel.setRateLimitPerUser(seconds);
            const description = seconds === 0
                ? `🐢 Slowmode disabled in ${message.channel}.`
                : `🐢 Slowmode set to **${seconds}** second${seconds === 1 ? '' : 's'} in ${message.channel}.`;
            return message.channel.send({
                embeds: [new EmbedBuilder()
                    .setTitle('Slowmode')
                    .setColor(ACTION_COLORS.Slowmode)
                    .setDescription(description)
                    .addFields(
                        { name: 'Moderator', value: `${message.author} (\`${message.author.id}\`)` },
                        { name: 'Action', value: 'Slowmode' },
                        { name: 'Duration', value: seconds === 0 ? 'Off' : `${seconds} second${seconds === 1 ? '' : 's'}` }
                    )
                    .setTimestamp()]
            });
        } catch (error) {
            console.error('Error in slowmode command:', error);
            return message.reply('❌ Failed to set slowmode. Check my Manage Channels permission.');
        }
    }

    // ==================== TICKET COMMANDS ====================
    if (command === 'ticket') {
        if (!(await requireGuildCommand(message))) return;

        const sub = (args[0] || 'panel').toLowerCase();

        if (sub === 'panel' || sub === 'setup') {
            if (!(await requirePermission(message, PermissionFlagsBits.ManageChannels))) return;
            try {
                await postTicketPanel(message.channel);
            } catch (error) {
                console.error('Error in !ticket panel:', error);
                return message.reply('❌ Failed to post the ticket panel.');
            }
            return;
        }

        const ticket = getTicketByChannelStmt.get(message.channel.id);
        if (!ticket || ticket.status !== 'open') {
            return message.reply('❌ This command can only be used inside an open ticket. Use `!ticket` to post a panel.');
        }

        if (sub === 'close') {
            return handleTicketCloseRequest(message.guild, message.channel, message.member, message.author, (text) => message.reply(text));
        }

        if (!isTicketStaff(message.member, message.guild)) {
            return message.reply('❌ You need the **Manage Channels** permission to manage this ticket.');
        }

        if (sub === 'add') {
            const target = await resolveModerationTarget(message, args.slice(1));
            if (target.error) return message.reply(target.error);
            if (target.id === ticket.user_id) {
                return message.reply('❌ That user already owns this ticket.');
            }
            try {
                await message.channel.permissionOverwrites.edit(target.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true,
                    EmbedLinks: true
                });
                return message.reply(`✅ Added ${target.user} to this ticket.`);
            } catch (error) {
                console.error('Error in !ticket add:', error);
                return message.reply('❌ Failed to add that user to this ticket.');
            }
        }

        if (sub === 'remove') {
            const target = await resolveModerationTarget(message, args.slice(1));
            if (target.error) return message.reply(target.error);
            if (target.id === ticket.user_id) {
                return message.reply('❌ You cannot remove the ticket owner.');
            }
            if (target.id === client.user.id) {
                return message.reply('❌ You cannot remove the bot from this ticket.');
            }
            try {
                await message.channel.permissionOverwrites.delete(target.id);
                return message.reply(`✅ Removed ${target.user} from this ticket.`);
            } catch (error) {
                console.error('Error in !ticket remove:', error);
                return message.reply('❌ Failed to remove that user from this ticket.');
            }
        }

        if (sub === 'rename') {
            const name = sanitizeChannelName(args.slice(1).join(' '));
            if (!name || name === 'ticket') {
                return message.reply('❌ Usage: `!ticket rename <name>`');
            }
            try {
                await message.channel.setName(name, `Ticket renamed by ${message.author.tag}`);
                return message.reply(`✅ Ticket renamed to \`${name}\`.`);
            } catch (error) {
                console.error('Error in !ticket rename:', error);
                return message.reply('❌ Failed to rename this ticket.');
            }
        }

        return message.reply('❌ Usage: `!ticket` | `!ticket close` | `!ticket add @user` | `!ticket remove @user` | `!ticket rename <name>`');
    }

    // ==================== HELP COMMAND ====================
    if (command === 'help') {
        const categoryArg = (args[0] || '').toLowerCase();
        const categoryKey = HELP_CATEGORIES[categoryArg] ? categoryArg : null;
        return message.channel.send({ embeds: [buildHelpEmbed(categoryKey, message.author.id)] });
    }
});

// Token verification and secure login
const botToken = process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.trim() : null;

if (!botToken || botToken === 'your_discord_bot_token_here') {
    console.error('❌ DISCORD_TOKEN is missing or not configured in your .env file.');
    console.error('👉 Please copy .env.example to .env and add your valid Discord bot token.');
    process.exit(1);
}

client.login(botToken).catch((error) => {
    console.error('❌ Failed to login to Discord:', sanitizeSecrets(error.message || String(error)));
});
