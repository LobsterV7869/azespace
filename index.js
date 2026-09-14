/**
 * AzeSpace - Discord User-Installed App
 * 
 * ==============================================================================
 * ARCHITECTURE OVERVIEW: USER-INSTALLED APPS & HTTP WEBHOOK INTERACTIONS
 * ==============================================================================
 * Unlike traditional Discord bots that connect to a persistent WebSocket gateway,
 * User-Installed Apps operate via incoming HTTP webhooks:
 * 
 * 1. NO BOT PRESENCE / NO GATEWAY:
 *    There is no active WebSocket client (`client.login()`). The app is purely
 *    an Express HTTP server listening for interaction webhooks from Discord.
 * 
 * 2. USER INSTALLATION (integration_types: [1]):
 *    Users install this app to their personal Discord account ("Add App to Profile"),
 *    granting the `applications.commands` OAuth2 scope.
 * 
 * 3. USABLE ANYWHERE (contexts: [0, 1, 2]):
 *    Once installed by a user, the app's slash commands can be used across:
 *      - Context 0: Any Discord server the user is in (Guilds)
 *      - Context 1: Direct Messages with the app (Bot DMs)
 *      - Context 2: Private group chats (Group DMs)
 * 
 * 4. CRYPTOGRAPHIC SIGNATURE VERIFICATION:
 *    Every incoming HTTP request from Discord includes `X-Signature-Ed25519` and
 *    `X-Signature-Timestamp` headers. The `discord-interactions` middleware verifies
 *    these headers against your Discord application's PUBLIC_KEY to ensure the request
 *    genuinely originated from Discord.
 * 
 * 5. SINGLE-RESPONSE CYCLE & RATE LIMITING:
 *    Each invocation produces exactly one response back over the open HTTP connection
 *    (within Discord's 3.0-second deadline). To prevent abuse, requests are limited
 *    to 1 command per 3 seconds per user.
 * ==============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const {
    verifyKeyMiddleware,
    InteractionType,
    InteractionResponseType,
    InteractionResponseFlags
} = require('discord-interactions');

const app = express();
const PORT = process.env.PORT || 3000;
const publicKey = process.env.PUBLIC_KEY ? process.env.PUBLIC_KEY.trim() : null;

// ==============================================================================
// 1. INITIALIZATION CHECKS
// ==============================================================================
if (!publicKey || publicKey === 'your_application_public_key_here') {
    console.error('❌ CRITICAL ERROR: PUBLIC_KEY is missing in your .env file!');
    console.error('👉 Find your Public Key in Discord Developer Portal -> AzeSpace -> General Information -> PUBLIC KEY');
    console.error('👉 Add it to your .env file: PUBLIC_KEY=your_key_here');
    process.exit(1);
}

// ==============================================================================
// 2. DYNAMIC COMMAND LOADER
// ==============================================================================
const commands = new Map();
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.set(command.data.name, command);
            console.log(`📦 Loaded slash command: /${command.data.name}`);
        } else {
            console.warn(`⚠️ Skipped invalid command file: ${file}`);
        }
    }
} else {
    console.warn('⚠️ No ./commands directory found.');
}

// ==============================================================================
// 3. PER-USER RATE LIMITER (1 command per 3 seconds)
// ==============================================================================
const userCooldowns = new Map();
const RATE_LIMIT_MS = 3000;

function isRateLimited(userId) {
    if (!userId) return false;
    const now = Date.now();
    const lastTime = userCooldowns.get(userId);
    if (lastTime && (now - lastTime) < RATE_LIMIT_MS) {
        return true;
    }
    userCooldowns.set(userId, now);
    return false;
}

// Periodic cleanup of stale cooldowns to avoid memory leaks
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of userCooldowns.entries()) {
        if (now - timestamp > RATE_LIMIT_MS * 2) {
            userCooldowns.delete(userId);
        }
    }
}, 5 * 60 * 1000).unref();

// ==============================================================================
// 4. HTTP ROUTES
// ==============================================================================

// Health Check & Status Page
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        app: 'AzeSpace User-Installed Discord App',
        commandsLoaded: commands.size,
        interactionsEndpoint: '/interactions'
    });
});

/**
 * Main Discord Interactions Endpoint
 * 
 * IMPORTANT: verifyKeyMiddleware consumes the raw request body stream to compute
 * the Ed25519 signature. Do NOT place express.json() or other body parsers before
 * this route!
 */
app.post('/interactions', verifyKeyMiddleware(publicKey), async (req, res) => {
    const interaction = req.body;

    // STEP A: Discord Endpoint Verification (PING)
    // When configuring your Interactions Endpoint URL in Developer Portal,
    // Discord sends a PING interaction. You MUST respond with PONG.
    if (interaction.type === InteractionType.PING) {
        return res.json({ type: InteractionResponseType.PONG });
    }

    // STEP B: Slash Command Interactions
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        const { name } = interaction.data;
        const command = commands.get(name);

        if (!command) {
            return res.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `❌ Command \`/${name}\` not recognized on this server.`,
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            });
        }

        // Extract user ID (works in Guild context, Bot DMs, and Group DMs)
        const userId = interaction.user?.id || interaction.member?.user?.id;

        // Rate Limiting (1 command every 3 seconds per user)
        if (isRateLimited(userId)) {
            return res.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '⏳ **Cooldown Active:** Please wait 3 seconds before using another command!',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            });
        }

        try {
            // Execute the command and return the single synchronous response
            const response = await command.execute(interaction);
            return res.json(response);
        } catch (error) {
            console.error(`❌ Error executing /${name}:`, error);
            return res.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ An unexpected error occurred while executing this command.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            });
        }
    }

    // Unhandled interaction type fallback
    return res.status(400).json({ error: 'Unknown interaction type' });
});

// ==============================================================================
// 5. SERVER STARTUP
// ==============================================================================
const server = app.listen(PORT, () => {
    console.log(`\n🚀 AzeSpace User-Installed App running on http://localhost:${PORT}`);
    console.log(`📡 Set your Discord Interactions Endpoint URL to: https://<your-domain>/interactions`);
    console.log(`🛡️ Signature verification: ACTIVE (using PUBLIC_KEY)`);
    console.log(`⚡ Loaded ${commands.size} slash commands with 3-second rate limiting.\n`);
});

module.exports = { app, server };
