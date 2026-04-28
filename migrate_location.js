#!/usr/bin/env node
'use strict';

/**
 * migrate_location.js
 *
 * Adds a `location` column (TEXT NOT NULL DEFAULT '') to the clients and
 * sessions tables. All pre-existing rows receive an empty string.
 *
 * Safe to run multiple times — exits early if the columns already exist.
 *
 * Usage:
 *   node migrate_location.js
 *   DB_PATH=/path/to/scheduler.db node migrate_location.js
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'server/db/scheduler.db');
console.log(`Migrating database at: ${DB_PATH}`);

const db = new DatabaseSync(DB_PATH);

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

let changed = false;

if (hasColumn('clients', 'location')) {
  console.log('clients.location already exists — skipping.');
} else {
  db.exec(`ALTER TABLE clients ADD COLUMN location TEXT NOT NULL DEFAULT ''`);
  console.log('Added clients.location');
  changed = true;
}

if (hasColumn('sessions', 'location')) {
  console.log('sessions.location already exists — skipping.');
} else {
  db.exec(`ALTER TABLE sessions ADD COLUMN location TEXT NOT NULL DEFAULT ''`);
  console.log('Added sessions.location');
  changed = true;
}

if (changed) {
  console.log('Migration complete.');
} else {
  console.log('Nothing to do — already up to date.');
}
