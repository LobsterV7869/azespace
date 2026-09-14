/**
 * Deploy Global Slash Commands for Discord User-Installed App
 * 
 * Configures each command with:
 *   - integration_types: [1] (ApplicationIntegrationType.UserInstall)
 *   - contexts: [0, 1, 2]    (Guild, Bot DM, and Private Channel/Group DM)
 * 
 * Usage:
 *   node deploy-commands.js
 *   (or npm run deploy)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes, ApplicationIntegrationType, InteractionContextType } = require('discord.js');

const token = process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.trim() : null;
const clientId = process.env.CLIENT_ID ? process.env.CLIENT_ID.trim() : null;

if (!token || token === 'your_bot_token_here') {
    console.error('❌ Error: DISCORD_TOKEN is missing in your .env file!');
    console.error('👉 Please set DISCORD_TOKEN before deploying commands.');
    process.exit(1);
}

if (!clientId || clientId === 'your_application_client_id_here') {
    console.error('❌ Error: CLIENT_ID is missing in your .env file!');
    console.error('👉 Please set CLIENT_ID before deploying commands.');
    process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log(`📦 Loading ${commandFiles.length} commands from ./commands/...`);

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
        // Explicitly attach user-install integration type and all three interaction contexts
        // integration_types: [1] -> UserInstall (can be added to a user's account)
        // contexts: [0, 1, 2]    -> Guilds, Bot DMs, and Group DMs
        command.data
            .setIntegrationTypes(ApplicationIntegrationType.UserInstall)
            .setContexts(
                InteractionContextType.Guild,
                InteractionContextType.BotDM,
                InteractionContextType.PrivateChannel
            );

        commands.push(command.data.toJSON());
        console.log(`  ✓ Loaded /${command.data.name}`);
    } else {
        console.warn(`⚠️ Warning: Command at ${filePath} is missing 'data' or 'execute' export.`);
    }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`\n🚀 Deploying ${commands.length} global slash commands to Discord API...`);

        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        );

        console.log(`✅ Successfully registered ${data.length} global commands as User-Installed (integration_types: [1], contexts: [0, 1, 2])!`);
        console.log(`🎉 Users can now install your app to their profile and use commands everywhere!`);
    } catch (error) {
        console.error('❌ Failed to deploy commands:', error);
    }
})();
