# 🤖 AzeSpace - Server Bot for Friends

A modern, highly polished, and extremely fun Discord bot built with **Discord.js v14** for your server with friends. Completely clean of any UwU/OwO elements, featuring fully-fledged economy games, social commands, utility tools, and AI chat integration!

## 🚀 Key Features

*   **💰 Complete Economy System:** Cash checks (`!cash`), daily rewards (`!daily` with cooldowns), and peer-to-peer transfers (`!pay`).
*   **🎰 Interactive Casino Games:** Risk your cash on Coinflip (`!coinflip`), Dice battles (`!dice`), or a gorgeous emoji Slot Machine (`!slots`).
*   **🎉 Social & Fun Commands:** Measure server matchmaking with the Love Ship calculator (`!ship`), slap friends with funny physical descriptions (`!slap`), send warm hugs (`!hug`), and enjoy built-in jokes (`!joke`).
*   **🧠 AI Chat Integration:** Chat with Llama3 AI (`!ask`) powered by Groq API (when configured).
*   **🛠️ Utility and Moderation:** Quick latency checks (`!ping`), high-resolution avatar viewing (`!avatar`), server/user stats (`!server`, `!userinfo`), reaction polls (`!poll`), and automated message clearing (`!clear`).
*   **🌐 Server Owner GlobalInfo:** `/globalinfo @user` shows account details, recorded ban/unban history from servers this bot is in, and mutual servers. Only the Discord server owner (`guild.ownerId`) can use it.

---

## 🛠️ Setup Instructions

### 1. Create the Bot on Discord
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create a **New Application**.
2. Go to the **Bot** tab, click **Reset Token**, and copy the token to your clipboard.
3. Scroll down to **Privileged Gateway Intents** and enable:
   * **Presence Intent**
   * **Server Members Intent**
   * **Message Content Intent** (Required for Prefix commands to function)
4. Go to **OAuth2 -> URL Generator**:
   * Scopes: `bot`, `applications.commands`
   * Bot Permissions: `Administrator` (or select permissions manually: *Manage Messages*, *Send Messages*, *Embed Links*, *Read Message History*, *View Audit Log*).
5. Copy the generated URL and open it in your browser to invite the bot to your server.

### 2. Install & Configuration
Rename `.env.example` to `.env` (or create it) and fill in your keys:
```env
DISCORD_TOKEN=YOUR_DISCORD_BOT_TOKEN
GROQ_API_KEY=YOUR_GROQ_API_KEY_OPTIONAL
```

To run the bot locally:
```bash
npm install
npm start
```

---

## 🎮 Command List

The bot supports the `!` and `az` prefixes (e.g., `!help` or `az help`).

| Command | Usage | Description |
|---|---|---|
| **`!help`** | `!help` | Displays the bot's custom help menu and command categories. |
| **`!cash` / `!bal`** | `!cash [@user]` | Checks your current cash balance or a friend's balance. |
| **`!daily`** | `!daily` | Claims your daily **$500** cash reward (24-hour cooldown). |
| **`!pay`** | `!pay @user <amount>` | Safely transfer cash to one of your friends on the server. |
| **`!coinflip`** | `!coinflip <amount \| all>` | Gamble cash on a 50/50 heads-or-tails coinflip. |
| **`!dice`** | `!dice <amount \| all>` | Roll a 6-sided die against the bot. Highest roll wins the pot! |
| **`!slots`** | `!slots <amount \| all>` | Play a realistic slot machine with multipliers (Diamonds pay 10x!). |
| **`!ship`** | `!ship @user` | Measures love/friendship compatibility with a visual bar and funny results. |
| **`!slap`** | `!slap @user` | Slaps a server member with a randomly selected funny flavor text. |
| **`!hug`** | `!hug @user` | Wrap your friend in a warm, cozy virtual hug. |
| **`!joke`** | `!joke` | Tells a clean, random dad joke to make your server smile. |
| **`!ask`** | `!ask <question>` | Talk directly to Llama3 AI via Groq. |
| **`!ping`** | `!ping` | Returns current websocket and API latency. |
| **`!avatar`** | `!avatar [@user]` | View a user's high-resolution avatar image. |
| **`!server`** | `!server` | Display server metrics, channels, member count, and creation date. |
| **`!userinfo`** | `!userinfo [@user]` | Shows full user profile stats, join dates, and roles. |
| **`!poll`** | `!poll <question> \| <opt1> \| <opt2>`| Generates a highly stylized reaction-based poll. Supports up to 9 options. |
| **`!clear`** | `!clear <number>` | Bulk deletes recent messages in a channel (Staff only). |
| **`/globalinfo`** | `/globalinfo @user` | Server owner only. Shows account info, recorded ban history from servers this bot is in, and mutual servers. |

---

## 🌐 /globalinfo (Server Owner)

This slash command is restricted with `interaction.user.id === interaction.guild.ownerId`. Administrator permission, Manage Server, a role named Owner, and the bot's configured owner ID are **not** enough.

Ban history only includes events this bot has actually seen (ban/unban) in servers where it is installed. Discord does not provide a global ban database. Records are stored in local SQLite (`database.db`).

---

## 👑 Owner Administration

If your user ID matches the owner configured in `index.js`, you gain access to:
*   `!givemoney @user <amount>`: Instantly add cash to a member's wallet.
*   `!removemoney @user <amount>`: Deduct cash from a member's wallet.
