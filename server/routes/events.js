/**
 * events.js
 *
 * CRUD routes for event records. Events are purely visual — they do not
 * participate in any session calculations (overlap checks, revenue totals, etc.).
 *
 * Endpoints:
 *   GET     /api/events              — All events, filtered by month or date.
 *   GET     /api/events/:event_id    — Single event by ID.
 *   POST    /api/events              — Create a new event.
 *   PUT     /api/events/:event_id    — Update an existing event.
 *   DELETE  /api/events/:event_id    — Delete an event.
 */

const { Router } = require('express');
const { db } = require('../db/database');

const router = Router();

/**
 * GET /api/events
 *
 * Returns all events, ordered by date then time (nulls last within each date).
 * Supports optional filtering by month or specific date.
 *
 * Query params (all optional):
 *   month  {string}  — Return events whose date starts with "YYYY-MM".
 *   date   {string}  — Return events for a specific "YYYY-MM-DD" date.
 *                      Ignored if `month` is also provided.
 *
 * Example request:
 *   GET /api/events?month=2025-05
 *
 * Example response (200):
 *   [
 *     { "id": 1, "name": "Team meeting", "date": "2025-05-10",
 *       "time": "10:00", "duration": 60, "location": "Zoom" },
 *     { "id": 2, "name": "Holiday",      "date": "2025-05-14",
 *       "time": null, "duration": null, "location": "" }
 *   ]
 */
router.get('/', (req, res) => {
  const { month, date } = req.query;
  let sql = 'SELECT * FROM events WHERE 1=1';
  const params = [];

  if (month) {
    sql += ' AND date LIKE ?';
    params.push(`${month}%`);
  } else if (date) {
    sql += ' AND date = ?';
    params.push(date);
  }

  // Sort: date ascending, then all-day events (time IS NULL) before timed ones,
  // then timed events in chronological order within the day.
  sql += ' ORDER BY date, time IS NULL DESC, time';

  res.json(db.prepare(sql).all(...params));
});

/**
 * GET /api/events/:event_id
 *
 * Returns a single event by its database ID.
 *
 * Path params:
 *   event_id  {integer}  — The event's database ID.
 *
 * Example request:
 *   GET /api/events/1
 *
 * Example response (200):
 *   { "id": 1, "name": "Team meeting", "date": "2025-05-10",
 *     "time": "10:00", "duration": 60, "location": "Zoom" }
 *
 * Errors:
 *   404  { "error": "Event not found" }
 */
router.get('/:event_id', (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.event_id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});

/**
 * POST /api/events
 *
 * Creates a new event. Returns 409 if another event already exists at the
 * same date+time (only applies when `time` is provided — all-day events
 * with no time do not conflict with each other).
 *
 * Body:
 *   name      {string}   — Event name. Required, must not be blank.
 *   date      {string}   — Event date in YYYY-MM-DD format. Required.
 *   time      {string}   — Start time in HH:MM format. Optional.
 *   duration  {number}   — Duration in minutes. Optional.
 *   location  {string}   — Event location. Optional, defaults to ''.
 *
 * Example request:
 *   POST /api/events
 *   { "name": "Team meeting", "date": "2025-05-10", "time": "10:00", "duration": 60 }
 *
 * Example response (201):
 *   { "id": 1, "name": "Team meeting", "date": "2025-05-10",
 *     "time": "10:00", "duration": 60, "location": "" }
 *
 * Errors:
 *   400  { "error": "name and date are required" }
 *   400  { "error": "name must not be blank" }
 *   409  { "error": "An event already exists at this date and time" }
 */
router.post('/', (req, res) => {
  const { name, date, time, duration, location = '' } = req.body;

  if (!name || !date)
    return res.status(400).json({ error: 'name and date are required' });
  if (!name.trim())
    return res.status(400).json({ error: 'name must not be blank' });

  try {
    const result = db.prepare(
      'INSERT INTO events (name, date, time, duration, location) VALUES (?, ?, ?, ?, ?)'
    ).run(name.trim(), date, time || null, duration || null, location);

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(event);
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'An event already exists at this date and time' });
    throw err;
  }
});

/**
 * PUT /api/events/:event_id
 *
 * Updates an existing event. All body fields are optional — omitted fields
 * retain their current values.
 *
 * Path params:
 *   event_id  {integer}  — The event's database ID.
 *
 * Body (all optional):
 *   name      {string}  — Updated event name. Must not be blank if provided.
 *   date      {string}  — Updated date (YYYY-MM-DD).
 *   time      {string}  — Updated start time (HH:MM). Pass empty string to clear.
 *   duration  {number}  — Updated duration in minutes. Pass 0 to clear.
 *   location  {string}  — Updated location.
 *
 * Example request:
 *   PUT /api/events/1
 *   { "name": "Rescheduled meeting", "time": "14:00" }
 *
 * Example response (200):
 *   { "id": 1, "name": "Rescheduled meeting", "date": "2025-05-10",
 *     "time": "14:00", "duration": 60, "location": "" }
 *
 * Errors:
 *   400  { "error": "name must not be blank" }
 *   404  { "error": "Event not found" }
 *   409  { "error": "An event already exists at this date and time" }
 */
router.put('/:event_id', (req, res) => {
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.event_id);
  if (!existing) return res.status(404).json({ error: 'Event not found' });

  const { name, date, time, duration, location } = req.body;

  const targetName     = name     !== undefined ? name.trim()       : existing.name;
  const targetDate     = date     !== undefined ? date              : existing.date;
  const targetTime     = time     !== undefined ? (time || null)    : existing.time;
  const targetDuration = duration !== undefined ? (duration || null) : existing.duration;
  const targetLocation = location !== undefined ? location          : existing.location;

  if (!targetName) return res.status(400).json({ error: 'name must not be blank' });

  try {
    db.prepare(
      'UPDATE events SET name = ?, date = ?, time = ?, duration = ?, location = ? WHERE id = ?'
    ).run(targetName, targetDate, targetTime, targetDuration, targetLocation, req.params.event_id);

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.event_id);
    res.json(event);
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'An event already exists at this date and time' });
    throw err;
  }
});

/**
 * DELETE /api/events/:event_id
 *
 * Permanently deletes an event record.
 *
 * Path params:
 *   event_id  {integer}  — The event's database ID.
 *
 * Example request:
 *   DELETE /api/events/1
 *
 * Example response (204): (no body)
 *
 * Errors:
 *   404  { "error": "Event not found" }
 */
router.delete('/:event_id', (req, res) => {
  const result = db.prepare('DELETE FROM events WHERE id = ?').run(req.params.event_id);
  if (result.changes === 0) return res.status(404).json({ error: 'Event not found' });
  res.status(204).send();
});

module.exports = router;
