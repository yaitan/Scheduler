/**
 * database.js
 *
 * SQLite database connection and lifecycle helpers for the Scheduler server.
 *
 * Uses Node's built-in `node:sqlite` module (available since Node 22) for a
 * zero-dependency synchronous SQLite interface. The database file path is
 * configurable via the DB_PATH environment variable, defaulting to
 * `scheduler.db` in the same directory as this file.
 *
 * Exports:
 *   db                    — The open DatabaseSync instance. Import this in route
 *                           handlers to run queries directly.
 *   initDb()              — Reads schema.sql and executes it against the database.
 *                           Safe to call on every startup because schema.sql uses
 *                           CREATE TABLE IF NOT EXISTS.
 *   autoCompleteSessions() — Marks all past Scheduled sessions as Completed.
 *                            Called on every incoming request so statuses stay
 *                            current without a background job.
 */

const { DatabaseSync } = require('node:sqlite');
const fs   = require('node:fs');
const path = require('node:path');

const DB_PATH     = process.env.DB_PATH || path.join(__dirname, 'scheduler.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/** Open (or create) the SQLite database file. Synchronous — ready immediately. */
const db = new DatabaseSync(DB_PATH);

/**
 * Reads schema.sql and executes it against the database.
 * Called once at server startup (in server.js) to ensure all tables and
 * indexes exist before any requests are handled.
 *
 * schema.sql uses CREATE TABLE IF NOT EXISTS throughout, so calling this on
 * an already-initialised database is safe and idempotent.
 */
function initDb() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);
  console.log('Database initialized');
}

/**
 * Returns the current date and time in the Israel timezone (Asia/Jerusalem)
 * as values suitable for direct SQL comparison.
 *
 * Uses the same Intl.DateTimeFormat approach as the client-side nowInIsrael()
 * in dateUtils.js, because Node's `new Date()` reflects the server's system
 * timezone (which may differ from Israel when running on a cloud host).
 *
 * @returns {{ today: string, currentMinutes: number }}
 *   today          — Current date as "YYYY-MM-DD", matching the `date` column format.
 *   currentMinutes — Current time as total minutes since midnight (e.g. 14:30 → 870),
 *                    matching the arithmetic used in autoCompleteSessions.
 */
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
    today:          `${get('year')}-${String(get('month')).padStart(2, '0')}-${String(get('day')).padStart(2, '0')}`,
    currentMinutes: get('hour') * 60 + get('minute'),
  };
}

/**
 * Marks all Scheduled sessions that have already ended as Completed.
 * Called as middleware on every incoming request so the status reflects
 * reality without needing a background cron job.
 *
 * A session is considered ended when:
 *   - Its date is before today (entirely in the past), OR
 *   - Its date is today AND (start time in minutes + duration) ≤ current minutes.
 *
 * The end-time arithmetic mirrors how the client computes session end times:
 *   CAST(SUBSTR(time, 1, 2) AS INTEGER) * 60   — hour component → minutes
 *   + CAST(SUBSTR(time, 4, 2) AS INTEGER)       — minute component
 *   + duration                                  — session length in minutes
 *
 * Note: string interpolation is used here instead of prepared statement
 * parameters because db.exec() does not support parameter binding. The
 * values (`today` and `currentMinutes`) are derived entirely from the
 * server clock and contain no user input, so there is no SQL injection risk.
 */
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
          duration
        ) <= ${currentMinutes})
      )
  `);
}

module.exports = { db, initDb, autoCompleteSessions };
