#!/usr/bin/env node
'use strict';

/**
 * migrate.js
 *
 * Idempotent database migration script. Safe to run multiple times — every
 * step checks whether the object already exists before creating or altering it.
 *
 * Migrations included:
 *   1. Create the `events` table with timed and all-day uniqueness indexes.
 *   2. Add a `location` column (TEXT NOT NULL DEFAULT '') to `clients` and
 *      `sessions`; pre-existing rows receive an empty string.
 *
 * Usage:
 *   node migrate.js
 *   DB_PATH=/path/to/scheduler.db node migrate.js
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'server/db/scheduler.db');
console.log(`Migrating database at: ${DB_PATH}`);

const db = new DatabaseSync(DB_PATH);

/**
 * Returns true if `table` already exists in the database.
 *
 * @param {string} table
 * @returns {boolean}
 */
function hasTable(table) {
  return !!db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(table);
}

/**
 * Returns true if `index` already exists in the database.
 *
 * @param {string} index
 * @returns {boolean}
 */
function hasIndex(index) {
  return !!db.prepare(
    `SELECT name FROM sqlite_master WHERE type='index' AND name=?`
  ).get(index);
}

/**
 * Returns true if `column` already exists in `table`.
 *
 * @param {string} table
 * @param {string} column
 * @returns {boolean}
 */
function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
}

// ─── Migration 1: events table ────────────────────────────────────────────────

if (hasTable('events')) {
  console.log('events table already exists — skipping CREATE TABLE.');
} else {
  db.exec(`
    CREATE TABLE events (
      id       INTEGER PRIMARY KEY,
      name     TEXT NOT NULL,
      date     TEXT NOT NULL,
      time     TEXT,
      duration INTEGER,
      location TEXT NOT NULL DEFAULT ''
    )
  `);
  console.log('Created events table.');
}

if (hasIndex('events_timed_unique')) {
  console.log('events_timed_unique index already exists — skipping.');
} else {
  db.exec(`
    CREATE UNIQUE INDEX events_timed_unique
      ON events(date, time) WHERE time IS NOT NULL
  `);
  console.log('Created events_timed_unique index.');
}

if (hasIndex('events_allday_unique')) {
  console.log('events_allday_unique index already exists — skipping.');
} else {
  db.exec(`
    CREATE UNIQUE INDEX events_allday_unique
      ON events(date) WHERE time IS NULL
  `);
  console.log('Created events_allday_unique index.');
}

// ─── Migration 2: location columns ───────────────────────────────────────────

if (hasColumn('clients', 'location')) {
  console.log('clients.location already exists — skipping.');
} else {
  db.exec(`ALTER TABLE clients ADD COLUMN location TEXT NOT NULL DEFAULT ''`);
  console.log('Added clients.location');
}

if (hasColumn('sessions', 'location')) {
  console.log('sessions.location already exists — skipping.');
} else {
  db.exec(`ALTER TABLE sessions ADD COLUMN location TEXT NOT NULL DEFAULT ''`);
  console.log('Added sessions.location');
}

console.log('Migration complete.');
