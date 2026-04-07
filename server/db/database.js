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

function nowInIsrael() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = type => parseInt(parts.find(p => p.type === type).value, 10);
  return {
    today: `${get('year')}-${String(get('month')).padStart(2, '0')}-${String(get('day')).padStart(2, '0')}`,
    currentMinutes: get('hour') * 60 + get('minute'),
  };
}

function autoCompleteSessions() {
  const { today, currentMinutes } = nowInIsrael();

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
