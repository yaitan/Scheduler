/**
 * clients.js
 *
 * CRUD routes for client records. All GET endpoints call autoCompleteSessions()
 * before querying so that session statuses are current when computing derived
 * fields (balance_owed, total_minutes, etc.).
 *
 * Derived fields are computed in SQL via LEFT JOINs on the sessions and payments
 * tables — no separate aggregation step is needed in JavaScript.
 *
 * Endpoints:
 *   GET     /api/clients              — All clients with aggregate stats.
 *   GET     /api/clients/:client_id   — One client with stats and upcoming sessions.
 *   POST    /api/clients              — Create a new client.
 *   PUT     /api/clients/:client_id   — Update an existing client.
 *   DELETE  /api/clients/:client_id   — Delete a client and all their data.
 */

const { Router } = require('express');
const { db, autoCompleteSessions } = require('../db/database');

const router = Router();

/**
 * GET /api/clients
 *
 * Returns all clients ordered by most-recent completed session date descending
 * (clients seen recently appear first), with nulls sorted last, then by name.
 *
 * Each row includes computed aggregate fields joined from the sessions and
 * payments tables:
 *   total_minutes      — Sum of duration for all Completed sessions.
 *   scheduled_minutes  — Sum of duration for all Scheduled sessions.
 *   total_revenue      — Sum of (duration / 60 * rate) for Completed sessions.
 *   balance_owed       — total_revenue minus total payments received.
 *
 * Example request:
 *   GET /api/clients
 *
 * Example response (200):
 *   [
 *     {
 *       "id": 1, "name": "Alice", "rate": 150,
 *       "phone": "050-0000000", "parent_phone": null,
 *       "total_minutes": 180, "scheduled_minutes": 60,
 *       "total_revenue": 450, "balance_owed": 150,
 *       "last_session_date": "2025-03-10"
 *     }
 *   ]
 *
 * Errors:
 *   401  (no token / invalid token — handled by auth middleware)
 */
router.get('/', (req, res) => {
  autoCompleteSessions();

  const clients = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.rate,
      c.phone,
      c.parent_phone,
      COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.duration ELSE 0 END), 0) AS total_minutes,
      COALESCE(SUM(CASE WHEN s.status = 'Scheduled' THEN s.duration ELSE 0 END), 0) AS scheduled_minutes,
      COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.duration * s.rate / 60.0 ELSE 0 END), 0) AS total_revenue,
      COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.duration * s.rate / 60.0 ELSE 0 END), 0)
        - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.client_id = c.id), 0)
        AS balance_owed,
      MAX(CASE WHEN s.status = 'Completed' THEN s.date END) AS last_session_date
    FROM clients c
    LEFT JOIN sessions s ON s.client_id = c.id
    GROUP BY c.id
    ORDER BY last_session_date DESC NULLS LAST, c.name
  `).all();

  res.json(clients);
});

/**
 * GET /api/clients/:client_id
 *
 * Returns a single client with aggregate stats and a list of all their upcoming
 * (Scheduled) sessions, ordered by date and time.
 *
 * Path params:
 *   client_id  {integer}  — The client's database ID.
 *
 * Example request:
 *   GET /api/clients/1
 *
 * Example response (200):
 *   {
 *     "id": 1, "name": "Alice", "rate": 150,
 *     "phone": "050-0000000", "parent_phone": null,
 *     "total_sessions": 6, "scheduled_sessions": 1,
 *     "total_minutes": 360, "balance_owed": 150,
 *     "upcoming_sessions": [
 *       { "id": 12, "date": "2025-04-01", "time": "16:00", "duration": 60, "rate": 150, "status": "Scheduled" }
 *     ]
 *   }
 *
 * Errors:
 *   404  { "error": "Client not found" }
 */
router.get('/:client_id', (req, res) => {
  autoCompleteSessions();

  const client = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.rate,
      c.phone,
      c.parent_phone,
      COUNT(DISTINCT CASE WHEN s.status = 'Completed' THEN s.id END) AS total_sessions,
      COUNT(DISTINCT CASE WHEN s.status = 'Scheduled' THEN s.id END) AS scheduled_sessions,
      COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.duration ELSE 0 END), 0) AS total_minutes,
      COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.duration * s.rate / 60.0 ELSE 0 END), 0)
        - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.client_id = c.id), 0)
        AS balance_owed
    FROM clients c
    LEFT JOIN sessions s ON s.client_id = c.id
    WHERE c.id = ?
    GROUP BY c.id
  `).get(req.params.client_id);

  if (!client) return res.status(404).json({ error: 'Client not found' });

  const upcoming = db.prepare(`
    SELECT id, date, time, duration, rate, status
    FROM sessions
    WHERE client_id = ? AND status = 'Scheduled'
    ORDER BY date, time
  `).all(client.id);

  res.json({ ...client, upcoming_sessions: upcoming });
});

/**
 * POST /api/clients
 *
 * Creates a new client record. Phone fields are optional and stored as NULL
 * if omitted. Client names must be unique (enforced by a UNIQUE index in the schema).
 *
 * Body:
 *   name          {string}       — Client's full name. Required.
 *   rate          {number}       — Hourly rate in ₪. Required.
 *   phone         {string|null}  — Client's phone number. Optional.
 *   parent_phone  {string|null}  — Parent's phone number. Optional.
 *
 * Example request:
 *   POST /api/clients
 *   { "name": "Alice", "rate": 150, "phone": "050-0000000", "parent_phone": null }
 *
 * Example response (201):
 *   { "id": 1, "name": "Alice", "rate": 150, "phone": "050-0000000", "parent_phone": null }
 *
 * Errors:
 *   400  { "error": "name and rate are required" }
 *   409  { "error": "Client already exists" }  — Duplicate name.
 */
router.post('/', (req, res) => {
  const { name, rate, phone, parent_phone } = req.body;
  if (!name || rate == null) return res.status(400).json({ error: 'name and rate are required' });

  try {
    const result = db.prepare(`
      INSERT INTO clients (name, rate, phone, parent_phone)
      VALUES (?, ?, ?, ?)
    `).run(name, rate, phone ?? null, parent_phone ?? null);

    res.status(201).json({ id: result.lastInsertRowid, name, rate, phone, parent_phone });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Client already exists' });
    throw err;
  }
});

/**
 * PUT /api/clients/:client_id
 *
 * Replaces all editable fields on an existing client. All four fields must be
 * supplied; omitting phone/parent_phone sets them to NULL.
 *
 * Path params:
 *   client_id  {integer}  — The client's database ID.
 *
 * Body:
 *   name          {string}       — Updated name. Required.
 *   rate          {number}       — Updated hourly rate. Required.
 *   phone         {string|null}  — Updated phone. Pass null to clear.
 *   parent_phone  {string|null}  — Updated parent phone. Pass null to clear.
 *
 * Example request:
 *   PUT /api/clients/1
 *   { "name": "Alice", "rate": 160, "phone": "050-1111111", "parent_phone": null }
 *
 * Example response (200):
 *   { "id": 1, "name": "Alice", "rate": 160, "phone": "050-1111111", "parent_phone": null }
 *
 * Errors:
 *   404  { "error": "Client not found" }
 *   409  { "error": "A client with that name already exists" }  — Duplicate name.
 */
router.put('/:client_id', (req, res) => {
  const { name, rate, phone, parent_phone } = req.body;

  try {
    const result = db.prepare(`
      UPDATE clients SET name = ?, rate = ?, phone = ?, parent_phone = ?
      WHERE id = ?
    `).run(name, rate, phone ?? null, parent_phone ?? null, req.params.client_id);

    if (result.changes === 0) return res.status(404).json({ error: 'Client not found' });

    const updated = db.prepare('SELECT id, name, rate, phone, parent_phone FROM clients WHERE id = ?').get(req.params.client_id);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'A client with that name already exists' });
    throw err;
  }
});

/**
 * DELETE /api/clients/:client_id
 *
 * Deletes a client and ALL their associated sessions and payments in a single
 * transaction. The cascade is handled manually here (not via ON DELETE CASCADE)
 * so that the deletion order is explicit: payments → sessions → client.
 *
 * Path params:
 *   client_id  {integer}  — The client's database ID.
 *
 * Example request:
 *   DELETE /api/clients/1
 *
 * Example response (204): (no body)
 *
 * Errors:
 *   404  { "error": "Client not found" }
 *   On any DB error during the transaction, a ROLLBACK is issued and the error
 *   is re-thrown for the global error handler.
 */
router.delete('/:client_id', (req, res) => {
  const { client_id } = req.params;

  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(client_id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  // Wrap in a transaction so a partial failure doesn't leave orphaned rows.
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM payments WHERE client_id = ?').run(client_id);
    db.prepare('DELETE FROM sessions WHERE client_id = ?').run(client_id);
    db.prepare('DELETE FROM clients WHERE id = ?').run(client_id);
    db.exec('COMMIT');
    res.status(204).send();
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
});

module.exports = router;
