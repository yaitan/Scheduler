const { Router } = require('express');
const { db, autoCompleteSessions } = require('../db/database');

const router = Router();

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Check if a new session overlaps with any existing session on that date (any client)
// Excludes a specific (client, time) row when updating
function hasOverlap(name, date, time, duration, excludeTime = null) {
  const newStart = timeToMinutes(time);
  const newEnd = newStart + Math.round(duration * 60);

  const existing = db.prepare(`
    SELECT time, duration FROM sessions
    WHERE date = ? AND status != 'Cancelled'
      ${excludeTime ? `AND NOT (client_name = '${name}' AND time = '${excludeTime}')` : ''}
  `).all(date);

  return existing.some(s => {
    const start = timeToMinutes(s.time);
    const end = start + Math.round(s.duration * 60);
    return newStart < end && start < newEnd;
  });
}

// GET /api/sessions — all sessions, optional ?month=YYYY-MM or ?client=name
router.get('/', (req, res) => {
  autoCompleteSessions();

  const { month, client } = req.query;
  let sql = 'SELECT client_name AS name, date, time, duration, status FROM sessions WHERE 1=1';
  const params = [];

  if (month) {
    sql += ' AND date LIKE ?';
    params.push(`${month}%`);
  }
  if (client) {
    sql += ' AND client_name = ?';
    params.push(client);
  }

  sql += ' ORDER BY date, time';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/sessions/:client/:date/:time — single session
router.get('/:client/:date/:time', (req, res) => {
  autoCompleteSessions();

  const session = db.prepare(`
    SELECT client_name AS name, date, time, duration, status
    FROM sessions WHERE client_name = ? AND date = ? AND time = ?
  `).get(req.params.client, req.params.date, req.params.time);

  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// POST /api/sessions — create session
router.post('/', (req, res) => {
  const { name, date, time, duration, status = 'Scheduled' } = req.body;
  if (!name || !date || !time || duration == null)
    return res.status(400).json({ error: 'name, date, time, and duration are required' });

  if (hasOverlap(name, date, time, duration))
    return res.status(409).json({ error: 'Session overlaps with an existing session' });

  try {
    db.prepare(`
      INSERT INTO sessions (client_name, date, time, duration, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, date, time, duration, status);

    res.status(201).json({ name, date, time, duration, status });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Session already exists' });
    if (err.message.includes('FOREIGN KEY')) return res.status(400).json({ error: 'Client does not exist' });
    throw err;
  }
});

// PUT /api/sessions/:client/:date/:time — update session
router.put('/:client/:date/:time', (req, res) => {
  const { client: name, date, time } = req.params;
  const { duration, status, date: newDate, time: newTime } = req.body;

  const targetDate = newDate ?? date;
  const targetTime = newTime ?? time;

  if (hasOverlap(name, targetDate, targetTime, duration, time))
    return res.status(409).json({ error: 'Session overlaps with an existing session' });

  const result = db.prepare(`
    UPDATE sessions SET date = ?, time = ?, duration = ?, status = ?
    WHERE client_name = ? AND date = ? AND time = ?
  `).run(targetDate, targetTime, duration, status, name, date, time);

  if (result.changes === 0) return res.status(404).json({ error: 'Session not found' });
  res.json({ name, date: targetDate, time: targetTime, duration, status });
});

// DELETE /api/sessions/:client/:date/:time — delete session
router.delete('/:client/:date/:time', (req, res) => {
  const result = db.prepare(`
    DELETE FROM sessions WHERE client_name = ? AND date = ? AND time = ?
  `).run(req.params.client, req.params.date, req.params.time);

  if (result.changes === 0) return res.status(404).json({ error: 'Session not found' });
  res.status(204).send();
});

module.exports = router;
