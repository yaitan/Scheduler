const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'scheduler.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new DatabaseSync(DB_PATH);

function initDb() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);
  console.log('Database initialized');
}

function autoCompleteSessions() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  db.exec(`
    UPDATE sessions
    SET status = 'Completed'
    WHERE status = 'Scheduled'
      AND (
        date < '${today}'
        OR (date = '${today}' AND (
          CAST(SUBSTR(time, 1, 2) AS INTEGER) * 60 +
          CAST(SUBSTR(time, 4, 2) AS INTEGER) +
          CAST(duration * 60 AS INTEGER)
        ) <= ${currentMinutes})
      )
  `);
}

module.exports = { db, initDb, autoCompleteSessions };
