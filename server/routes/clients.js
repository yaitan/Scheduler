const { Router } = require('express');
const { db, autoCompleteSessions } = require('../db/database');

const router = Router();

// GET /api/clients — all clients with derived stats
router.get('/', (req, res) => {
  autoCompleteSessions();

  const clients = db.prepare(`
    SELECT
      c.name,
      c.rate,
      c.phone,
      c.parent_phone,
      COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.duration ELSE 0 END), 0) AS total_hours,
      COALESCE(SUM(CASE WHEN s.status = 'Scheduled' THEN s.duration ELSE 0 END), 0) AS scheduled_hours,
      COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.duration * c.rate ELSE 0 END), 0) AS total_revenue,
      COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.duration * c.rate ELSE 0 END), 0)
        - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.client_name = c.name), 0)
        AS balance_owed,
      MAX(CASE WHEN s.status = 'Completed' THEN s.date END) AS last_session_date
    FROM clients c
    LEFT JOIN sessions s ON s.client_name = c.name
    GROUP BY c.name
    ORDER BY last_session_date DESC NULLS LAST, c.name
  `).all();

  res.json(clients);
});

// GET /api/clients/:name — single client with upcoming sessions
router.get('/:name', (req, res) => {
  autoCompleteSessions();

  const client = db.prepare(`
    SELECT
      c.name,
      c.rate,
      c.phone,
      c.parent_phone,
      COUNT(DISTINCT CASE WHEN s.status = 'Completed' THEN s.date || s.time END) AS total_sessions,
      COUNT(DISTINCT CASE WHEN s.status = 'Scheduled' THEN s.date || s.time END) AS scheduled_sessions,
      COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.duration ELSE 0 END), 0) AS total_hours,
      COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.duration * c.rate ELSE 0 END), 0)
        - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.client_name = c.name), 0)
        AS balance_owed
    FROM clients c
    LEFT JOIN sessions s ON s.client_name = c.name
    WHERE c.name = ?
    GROUP BY c.name
  `).get(req.params.name);

  if (!client) return res.status(404).json({ error: 'Client not found' });

  const upcoming = db.prepare(`
    SELECT date, time, duration, status
    FROM sessions
    WHERE client_name = ? AND status = 'Scheduled'
    ORDER BY date, time
  `).all(req.params.name);

  res.json({ ...client, upcoming_sessions: upcoming });
});

// POST /api/clients — create client
router.post('/', (req, res) => {
  const { name, rate, phone, parent_phone } = req.body;
  if (!name || rate == null) return res.status(400).json({ error: 'name and rate are required' });

  try {
    db.prepare(`
      INSERT INTO clients (name, rate, phone, parent_phone)
      VALUES (?, ?, ?, ?)
    `).run(name, rate, phone ?? null, parent_phone ?? null);

    res.status(201).json({ name, rate, phone, parent_phone });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Client already exists' });
    throw err;
  }
});

// PUT /api/clients/:name — update client
router.put('/:name', (req, res) => {
  const { rate, phone, parent_phone } = req.body;

  const result = db.prepare(`
    UPDATE clients SET rate = ?, phone = ?, parent_phone = ?
    WHERE name = ?
  `).run(rate, phone ?? null, parent_phone ?? null, req.params.name);

  if (result.changes === 0) return res.status(404).json({ error: 'Client not found' });
  res.json({ name: req.params.name, rate, phone, parent_phone });
});

// DELETE /api/clients/:name — delete client and all associated sessions and payments
router.delete('/:name', (req, res) => {
  const { name } = req.params;

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM payments WHERE client_name = ?').run(name);
    db.prepare('DELETE FROM sessions WHERE client_name = ?').run(name);
    const result = db.prepare('DELETE FROM clients WHERE name = ?').run(name);
    db.exec('COMMIT');
    if (result.changes === 0) return res.status(404).json({ error: 'Client not found' });
    res.status(204).send();
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
});

module.exports = router;
