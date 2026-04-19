/**
 * sessions.js
 *
 * CRUD routes for session records. All write operations check for scheduling
 * conflicts before persisting. All GET operations call autoCompleteSessions()
 * so status values are current before they are returned.
 *
 * Session status lifecycle:
 *   Scheduled  →  Completed  (automatic, via autoCompleteSessions when the end time passes)
 *   Scheduled  →  Cancelled  (manual, via PUT with status: 'Cancelled')
 *
 * Endpoints:
 *   GET     /api/sessions               — All sessions, with optional filters.
 *   GET     /api/sessions/:session_id   — Single session by ID.
 *   POST    /api/sessions               — Create a new session.
 *   PUT     /api/sessions/:session_id   — Update an existing session.
 *   DELETE  /api/sessions/:session_id   — Delete a session.
 */

const { Router } = require('express');
const { db, autoCompleteSessions } = require('../db/database');

const router = Router();

/**
 * Converts a "HH:MM" time string to total minutes since midnight.
 * Used by hasOverlap() to compare session start/end times arithmetically.
 *
 * @param {string} hhmm - Time string in "HH:MM" format.
 * @returns {number} Total minutes since midnight (e.g. "14:30" → 870).
 */
function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Checks whether a proposed session time range overlaps with any existing
 * non-cancelled session on the same date.
 *
 * Two sessions overlap when neither ends before the other starts:
 *   newStart < existingEnd  AND  existingStart < newEnd
 *
 * When updating an existing session (PUT), the session being edited is excluded
 * from the check via `excludeId` so it doesn't conflict with itself.
 *
 * Note: excludeId is interpolated directly into the SQL string rather than
 * passed as a parameter because the WHERE clause structure changes based on
 * its presence. The value is always a server-validated integer, never user input.
 *
 * @param {string}      date       - The session date in YYYY-MM-DD format.
 * @param {string}      time       - The proposed start time in HH:MM format.
 * @param {number}      duration   - The proposed duration in minutes.
 * @param {number|null} excludeId  - Session ID to exclude from the check (for updates).
 * @returns {boolean} True if an overlap exists.
 */
function hasOverlap(date, time, duration, excludeId = null) {
  const newStart = timeToMinutes(time);
  const newEnd   = newStart + duration;

  const existing = db.prepare(`
    SELECT time, duration FROM sessions
    WHERE date = ? AND status != 'Cancelled'
      ${excludeId != null ? `AND id != ${excludeId}` : ''}
  `).all(date);

  return existing.some(s => {
    const start = timeToMinutes(s.time);
    const end   = start + s.duration;
    return newStart < end && start < newEnd;
  });
}

/**
 * GET /api/sessions
 *
 * Returns all sessions joined with client name, filtered by any combination
 * of query parameters. Results are ordered by date and time ascending.
 *
 * Query params (all optional, combinable):
 *   month      {string}   — Return sessions whose date starts with "YYYY-MM"
 *                           (e.g. "2025-03" returns all of March 2025).
 *   year       {string}   — Return sessions whose date starts with "YYYY"
 *                           (e.g. "2025"). Ignored if `month` is also provided.
 *   client_id  {integer}  — Filter to a specific client by ID.
 *   client     {string}   — Filter to a specific client by name
 *                           (ignored if client_id is also provided).
 *
 * Example request:
 *   GET /api/sessions?month=2025-03
 *
 * Example response (200):
 *   [
 *     { "id": 10, "client_id": 1, "name": "Alice", "date": "2025-03-05",
 *       "time": "16:00", "duration": 60, "rate": 150, "status": "Completed" },
 *     { "id": 11, "client_id": 2, "name": "Bob",   "date": "2025-03-07",
 *       "time": "17:00", "duration": 90, "rate": 120, "status": "Scheduled" }
 *   ]
 */
router.get('/', (req, res) => {
  autoCompleteSessions();

  const { month, year, client, client_id } = req.query;
  let sql = `
    SELECT s.id, s.client_id, c.name, s.date, s.time, s.duration, s.rate, s.status
    FROM sessions s
    JOIN clients c ON c.id = s.client_id
    WHERE 1=1
  `;
  const params = [];

  if (month) {
    // LIKE 'YYYY-MM%' matches all days in the month.
    sql += ' AND s.date LIKE ?';
    params.push(`${month}%`);
  } else if (year) {
    // LIKE 'YYYY%' matches all months in the year.
    sql += ' AND s.date LIKE ?';
    params.push(`${year}%`);
  }
  if (client_id) {
    sql += ' AND s.client_id = ?';
    params.push(client_id);
  } else if (client) {
    sql += ' AND c.name = ?';
    params.push(client);
  }

  sql += ' ORDER BY s.date, s.time';
  res.json(db.prepare(sql).all(...params));
});

/**
 * GET /api/sessions/:session_id
 *
 * Returns a single session by its database ID, joined with the client name.
 *
 * Path params:
 *   session_id  {integer}  — The session's database ID.
 *
 * Example request:
 *   GET /api/sessions/10
 *
 * Example response (200):
 *   { "id": 10, "client_id": 1, "name": "Alice", "date": "2025-03-05",
 *     "time": "16:00", "duration": 60, "rate": 150, "status": "Completed" }
 *
 * Errors:
 *   404  { "error": "Session not found" }
 */
router.get('/:session_id', (req, res) => {
  autoCompleteSessions();

  const session = db.prepare(`
    SELECT s.id, s.client_id, c.name, s.date, s.time, s.duration, s.rate, s.status
    FROM sessions s
    JOIN clients c ON c.id = s.client_id
    WHERE s.id = ?
  `).get(req.params.session_id);

  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

/**
 * POST /api/sessions
 *
 * Creates a new session. Rejects if the proposed time slot overlaps with any
 * existing non-cancelled session on the same date (any client).
 * Status defaults to 'Scheduled' if not provided.
 *
 * Body:
 *   client_id  {integer}  — The client's database ID. Required.
 *   date       {string}   — Session date in YYYY-MM-DD format. Required.
 *   time       {string}   — Start time in HH:MM format. Required.
 *   duration   {number}   — Duration in minutes. Required.
 *   rate       {number}   — Hourly rate in ₪ for this session. Required.
 *   status     {string}   — Initial status. Optional, defaults to 'Scheduled'.
 *
 * Example request:
 *   POST /api/sessions
 *   { "client_id": 1, "date": "2025-04-10", "time": "16:00", "duration": 60, "rate": 150 }
 *
 * Example response (201):
 *   { "id": 14, "client_id": 1, "name": "Alice", "date": "2025-04-10",
 *     "time": "16:00", "duration": 60, "rate": 150, "status": "Scheduled" }
 *
 * Errors:
 *   400  { "error": "client_id, date, time, duration, and rate are required" }
 *   400  { "error": "Client does not exist" }  — Foreign key violation.
 *   409  { "error": "Session overlaps with an existing session" }
 */
router.post('/', (req, res) => {
  const { client_id, date, time, duration, rate, status = 'Scheduled' } = req.body;
  if (!client_id || !date || !time || duration == null || rate == null)
    return res.status(400).json({ error: 'client_id, date, time, duration, and rate are required' });

  if (hasOverlap(date, time, duration))
    return res.status(409).json({ error: 'Session overlaps with an existing session' });

  try {
    const result = db.prepare(`
      INSERT INTO sessions (client_id, date, time, duration, rate, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(client_id, date, time, duration, rate, status);

    // Re-fetch joined with client name so the response matches GET shape.
    const session = db.prepare(`
      SELECT s.id, s.client_id, c.name, s.date, s.time, s.duration, s.rate, s.status
      FROM sessions s JOIN clients c ON c.id = s.client_id
      WHERE s.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(session);
  } catch (err) {
    if (err.message.includes('FOREIGN KEY')) return res.status(400).json({ error: 'Client does not exist' });
    throw err;
  }
});

/**
 * PUT /api/sessions/:session_id
 *
 * Updates an existing session. All body fields are optional — omitted fields
 * retain their current values.
 *
 * Status resolution: if the updated date/time is in the future, the status is
 * forced to 'Scheduled' regardless of what was submitted. This prevents a
 * rescheduled session from being left in a 'Completed' state. If the time is
 * in the past, the submitted status (or the existing status) is preserved.
 *
 * Overlap check: the session being updated is excluded from the conflict check
 * so that saving without changing the time does not fail.
 *
 * Path params:
 *   session_id  {integer}  — The session's database ID.
 *
 * Body (all optional):
 *   client_id  {integer}  — Reassign to a different client.
 *   date       {string}   — Updated date (YYYY-MM-DD).
 *   time       {string}   — Updated start time (HH:MM).
 *   duration   {number}   — Updated duration in minutes.
 *   rate       {number}   — Updated rate in ₪.
 *   status     {string}   — Updated status (used only if the session time is in the past).
 *
 * Example request:
 *   PUT /api/sessions/14
 *   { "time": "17:00", "duration": 90 }
 *
 * Example response (200):
 *   { "id": 14, "client_id": 1, "name": "Alice", "date": "2025-04-10",
 *     "time": "17:00", "duration": 90, "rate": 150, "status": "Scheduled" }
 *
 * Errors:
 *   404  { "error": "Session not found" }
 *   409  { "error": "Session overlaps with an existing session" }
 */
router.put('/:session_id', (req, res) => {
  const { session_id } = req.params;
  const { client_id, duration, rate, status, date: newDate, time: newTime } = req.body;

  const existing = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session_id);
  if (!existing) return res.status(404).json({ error: 'Session not found' });

  // Resolve final values — fall back to existing fields for any omitted param.
  const targetClientId = client_id  ?? existing.client_id;
  const targetDate     = newDate    ?? existing.date;
  const targetTime     = newTime    ?? existing.time;
  const targetDuration = duration   ?? existing.duration;

  if (hasOverlap(targetDate, targetTime, targetDuration, Number(session_id)))
    return res.status(409).json({ error: 'Session overlaps with an existing session' });

  // If the new date/time is in the future, force status back to 'Scheduled'
  // so a rescheduled session is not left marked as Completed.
  const sessionDateTime = new Date(`${targetDate}T${targetTime}`);
  const resolvedStatus  = sessionDateTime > new Date() ? 'Scheduled' : (status ?? existing.status);

  db.prepare(`
    UPDATE sessions SET client_id = ?, date = ?, time = ?, duration = ?, rate = ?, status = ?
    WHERE id = ?
  `).run(targetClientId, targetDate, targetTime, targetDuration, rate !== undefined ? rate : existing.rate, resolvedStatus, session_id);

  const session = db.prepare(`
    SELECT s.id, s.client_id, c.name, s.date, s.time, s.duration, s.rate, s.status
    FROM sessions s JOIN clients c ON c.id = s.client_id
    WHERE s.id = ?
  `).get(session_id);

  res.json(session);
});

/**
 * DELETE /api/sessions/:session_id
 *
 * Permanently deletes a session record.
 *
 * Path params:
 *   session_id  {integer}  — The session's database ID.
 *
 * Example request:
 *   DELETE /api/sessions/14
 *
 * Example response (204): (no body)
 *
 * Errors:
 *   404  { "error": "Session not found" }
 */
router.delete('/:session_id', (req, res) => {
  const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.session_id);
  if (result.changes === 0) return res.status(404).json({ error: 'Session not found' });
  res.status(204).send();
});

module.exports = router;
