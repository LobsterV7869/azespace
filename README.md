# ⚡ AzeSpace - Discord User-Installed App

A modern **Discord User-Installed App** built with **Discord.js v14**, **Express**, and **discord-interactions**.

Unlike traditional bots that require server invites and gateway connections, **User-Installed Apps** (`integration_types: [1]`) are installed directly to your personal Discord account. Once installed, your commands work **everywhere you go**:
* 🌐 **Any Discord Server** you belong to (even without bot permissions)
* 💬 **Direct Messages (Bot DMs)**
* 👥 **Private Group DMs**

---

## 🚀 Key Features

* ⚡ **Serverless / Webhook Architecture:** Zero gateway websocket connections. Powered by an Express HTTP server receiving signed interaction webhooks.
* 🛡️ **Cryptographic Verification:** Every request is authenticated using Ed25519 signature checks via `discord-interactions` and your Discord `PUBLIC_KEY`.
* ⏳ **Anti-Abuse Rate Limiting:** Built-in in-memory rate limiter (1 command per 3 seconds per user).
* 🎯 **Strict Single-Response Execution:** Every command produces exactly one clean reply (no spam loops, no repeat buttons, no multi-message bursts).
* 🎭 **Massive Arsenal of Commands:** Includes utility, fun, and troll commands!

---

## 🎮 Command List

### 🛠️ Core Utility & Fun Commands
| Command | Options | Description |
|---|---|---|
| **`/8ball`** | `[question]` | Ask the magical 8-Ball any question. |
| **`/roll`** | `[dice]` | Roll custom dice (e.g. `20`, `2d6`, `d100`). Defaults to 6. |
| **`/quote`** | *None* | Get an inspiring or witty quote from public APIs. |
| **`/fact`** | *None* | Learn a random fun or useless fact. |
| **`/translate`** | `[text]` `[language]` | Quick language translation (e.g. Spanish, French, az, tr, de). |
| **`/remindme`** | `[time]` `[note]` | DMs you a one-time reminder when the timer expires (e.g. `10m`, `2h`). |
| **`/poll`** | `[question]` `[options]` | Creates a numbered reaction poll with up to 10 choices. |
| **`/avatar`** | `[user]` | View high-res avatar (**Server context only**; blocked in DMs). |

### 🤪 Troll & Entertainment Commands
| Command | Options | Description |
|---|---|---|
| **`/spam`** | `[text]` `[count]` | Repeats plain text up to 100 times in one public response in the current DM or server channel. |
| **`/mock`** | `[text]` | Converts text into sPoNgEbOb MoCkInG cAsE 🐔. |
| **`/fakeban`** | `[user]` `[reason]` | Scares a friend with a dramatic moderation ban embed (revealed as a prank!). |
| **`/reverse`** | `[text]` | Reverses text backwards (!txet desreveR). |
| **`/rate`** | `[target]` | Rates anything from 0 to 100% with funny commentary. |
| **`/iq`** | `[user]` | Measures "100% scientifically accurate" galaxy brain IQ. |
| **`/ship`** | `[user1]` `[user2]` | Love and friendship compatibility meter with visual progress bar. |
| **`/roast`** | `[user]` | Friendly, lighthearted roasts to tease your friends. |
| **`/copypasta`** | *None* | Posts a classic harmless internet copypasta. |
| **`/coinflip`** | *None* | Flips a coin (with a 1% chance to land on its edge!). |
| **`/rps`** | `[choice]` | Play Rock, Paper, Scissors against the app. |

---

## 🛠️ Setup & Installation Guide

### 1. Discord Developer Portal Setup
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and select your application.
2. In **General Information**:
   * Copy the **APPLICATION ID** (this is your `CLIENT_ID`).
   * Copy the **PUBLIC KEY** (this is your `PUBLIC_KEY`).
3. In **Bot**:
   * Copy your bot token (this is your `DISCORD_TOKEN`, used by `deploy-commands.js` to register commands).
4. In **Installation**:
   * Under **Installation Contexts**, make sure **User Install** is checked!
   * Under **Default Install Settings**, select:
     * Scopes: `applications.commands`

---

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your `.env` credentials:
```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id_here
PUBLIC_KEY=your_application_public_key_here
PORT=3000
```

---

### 3. Deploy Global Slash Commands
Register the commands with `integration_types: [1]` and `contexts: [0, 1, 2]`:
```bash
npm run deploy
```
*Note: Global commands appear instantly on Discord for user-installed apps.*

---

### 4. Start the Webhook Server & Expose HTTPS
Start the Express server:
```bash
npm start
```
Discord requires an **HTTPS** URL for the interactions endpoint.
If developing locally, expose port 3000 using Cloudflare Tunnel or ngrok:
```bash
ngrok http 3000
# or
cloudflared tunnel --url http://localhost:3000
```

---

### 5. Set Interactions Endpoint URL in Discord
1. In Discord Developer Portal -> **General Information**.
2. Set **Interactions Endpoint URL** to:
   ```
   https://<your-domain>/interactions
   ```
3. Click **Save Changes**. Discord will send a `PING` payload, which AzeSpace automatically validates and answers with `PONG`.

---

### 6. Install to Your Profile ("Add to My Apps")
Use the User-Install authorization link:
```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=applications.commands&integration_type=1
```
Click **Add to My Apps**. Now, type `/` in any server, DM, or group chat to use your commands!
