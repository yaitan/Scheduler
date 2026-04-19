/**
 * backup.js
 *
 * Database backup endpoint. Streams the live SQLite database file to the
 * authenticated caller as a binary file download. The filename includes the
 * current date so successive downloads are easy to tell apart in the user's
 * Downloads folder.
 *
 * Protected by the requireAuth middleware applied in index.js — only a logged-in
 * user can trigger a download.
 *
 * API routes used:
 *   GET  /api/backup  — Download the SQLite database file as a .db attachment.
 */

const express = require('express');
const router  = express.Router();

/**
 * GET /api/backup
 *
 * Sends the SQLite database file as a binary download. Uses Express's
 * res.download(), which sets Content-Disposition: attachment and
 * Content-Type: application/octet-stream automatically.
 *
 * No query or body parameters.
 *
 * Example request:
 *   GET /api/backup
 *
 * Example response (200):
 *   Content-Disposition: attachment; filename="scheduler-backup-2026-04-19.db"
 *   Content-Type: application/octet-stream
 *   <binary SQLite file contents>
 *
 * Errors:
 *   500  { "error": "DB_PATH is not configured" }  — env var missing.
 *   500  { "error": "Backup failed" }               — file could not be read.
 */
router.get('/', (req, res) => {
  const dbPath = process.env.DB_PATH;

  if (!dbPath) {
    return res.status(500).json({ error: 'DB_PATH is not configured' });
  }

  // Build a date-stamped filename (YYYY-MM-DD) so the user can tell backups
  // apart without opening them.
  const today    = new Date().toISOString().slice(0, 10);
  const filename = `scheduler-backup-${today}.db`;

  res.download(dbPath, filename, (err) => {
    // res.download() calls the callback with an error both when the transfer
    // fails mid-stream and when the file cannot be opened at all. Only send
    // an error response if headers haven't been flushed yet — once streaming
    // has started it's too late to change the status code.
    if (err && !res.headersSent) {
      console.error('Backup download error:', err);
      res.status(500).json({ error: 'Backup failed' });
    }
  });
});

module.exports = router;
