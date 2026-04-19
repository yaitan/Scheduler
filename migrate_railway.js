#!/usr/bin/env node
'use strict';

/**
 * migrate_railway.js
 *
 * Migrates an existing scheduler.db from the old schema to the new schema:
 *   - clients: adds integer PK `id`, keeps name UNIQUE
 *   - sessions: adds integer PK `id`, replaces client_name FK with client_id,
 *               converts duration from hours (REAL) to minutes (INTEGER),
 *               adds optional `rate` column
 *   - payments: adds integer PK `id`, replaces client_name FK with client_id
 *
 * Safe to run multiple times — exits early if already migrated.
 *
 * Usage:
 *   DB_PATH=/path/to/scheduler.db node migrate_railway.js
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'server/db/scheduler.db');
console.log(`Migrating database at: ${DB_PATH}`);

const db = new DatabaseSync(DB_PATH);

// Check if already migrated (clients table has an `id` column)
const tableInfo = db.prepare("PRAGMA table_info(clients)").all();
const hasId = tableInfo.some(col => col.name === 'id');
if (hasId) {
  console.log('Already migrated (clients.id exists). Nothing to do.');
  process.exit(0);
}

// Snapshot row counts before migration for verification
const beforeCounts = {
  clients:  db.prepare('SELECT COUNT(*) AS n FROM clients').get().n,
  sessions: db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,
  payments: db.prepare('SELECT COUNT(*) AS n FROM payments').get().n,
};
console.log(`Before: ${beforeCounts.clients} clients, ${beforeCounts.sessions} sessions, ${beforeCounts.payments} payments`);

db.exec('BEGIN');
try {

  // ── Step 1: rename old tables ────────────────────────────────
  db.exec('ALTER TABLE sessions RENAME TO sessions_old');
  db.exec('ALTER TABLE payments RENAME TO payments_old');
  db.exec('ALTER TABLE clients  RENAME TO clients_old');

  // ── Step 2: create new tables ────────────────────────────────
  db.exec(`
    CREATE TABLE clients (
      id           INTEGER PRIMARY KEY,
      name         TEXT NOT NULL UNIQUE,
      rate         REAL NOT NULL,
      phone        TEXT,
      parent_phone TEXT
    )
  `);

  db.exec(`
    CREATE TABLE sessions (
      id        INTEGER PRIMARY KEY,
      client_id INTEGER NOT NULL,
      date      TEXT NOT NULL,
      time      TEXT NOT NULL,
      duration  INTEGER NOT NULL,
      rate      REAL NOT NULL,
      status    TEXT NOT NULL DEFAULT 'Scheduled'
                  CHECK(status IN ('Scheduled', 'Completed', 'Cancelled')),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `);

  db.exec(`
    CREATE TABLE payments (
      id             INTEGER PRIMARY KEY,
      client_id      INTEGER NOT NULL,
      date           TEXT NOT NULL,
      amount         REAL NOT NULL,
      method         TEXT NOT NULL
                       CHECK(method IN ('PayBox', 'Bit', 'Transfer', 'Cash', 'Other')),
      receipt_number TEXT,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `);

  // ── Step 3: migrate clients (sequential IDs assigned by SQLite) ──
  db.exec(`
    INSERT INTO clients (name, rate, phone, parent_phone)
    SELECT name, rate, phone, parent_phone
    FROM clients_old
    ORDER BY name
  `);

  // ── Step 4: migrate sessions (convert duration hours → minutes) ──
  db.exec(`
    INSERT INTO sessions (client_id, date, time, duration, rate, status)
    SELECT
      c.id,
      s.date,
      s.time,
      CAST(ROUND(s.duration * 60) AS INTEGER),
      c.rate,
      s.status
    FROM sessions_old s
    JOIN clients c ON c.name = s.client_name
  `);

  // ── Step 5: migrate payments ─────────────────────────────────
  db.exec(`
    INSERT INTO payments (client_id, date, amount, method, receipt_number)
    SELECT
      c.id,
      p.date,
      p.amount,
      p.method,
      p.receipt_number
    FROM payments_old p
    JOIN clients c ON c.name = p.client_name
  `);

  // ── Step 6: drop old tables ───────────────────────────────────
  db.exec('DROP TABLE sessions_old');
  db.exec('DROP TABLE payments_old');
  db.exec('DROP TABLE clients_old');

  db.exec('COMMIT');

} catch (err) {
  db.exec('ROLLBACK');
  console.error('Migration FAILED — rolled back. Error:', err.message);
  process.exit(1);
}

// ── Verify ────────────────────────────────────────────────────
const afterCounts = {
  clients:  db.prepare('SELECT COUNT(*) AS n FROM clients').get().n,
  sessions: db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,
  payments: db.prepare('SELECT COUNT(*) AS n FROM payments').get().n,
};

if (
  afterCounts.clients  !== beforeCounts.clients  ||
  afterCounts.sessions !== beforeCounts.sessions ||
  afterCounts.payments !== beforeCounts.payments
) {
  console.error('Row count mismatch after migration!');
  console.error('Before:', beforeCounts);
  console.error('After: ', afterCounts);
  process.exit(1);
}

console.log('Migration complete!');
console.log(`  Clients:  ${afterCounts.clients}`);
console.log(`  Sessions: ${afterCounts.sessions} (durations converted from hours to minutes, rates backfilled from client rate)`);
console.log(`  Payments: ${afterCounts.payments}`);
