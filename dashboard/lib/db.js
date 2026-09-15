const Database = require('better-sqlite3');
const path = require('path');

// Place the database file in the root directory so it can be shared with the bot
const dbPath = path.join(process.cwd(), '..', 'azespace.db');
const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS guild_configs (
    guild_id TEXT PRIMARY KEY,
    config JSON NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports = db;
