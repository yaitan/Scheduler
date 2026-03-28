const { Router } = require('express');
const { db, autoCompleteSessions } = require('../db/database');

const router = Router();

const VALID_METHODS = ['PayBox', 'Bit', 'Transfer', 'Cash', 'Other'];

// GET /api/payments — all payments, optional ?client=name&from=YYYY-MM-DD
router.get('/', (req, res) => {
  autoCompleteSessions();
  const { client, from } = req.query;
  let sql = 'SELECT client_name AS name, date, amount, method, receipt_number FROM payments WHERE 1=1';
  const params = [];

  if (client) { sql += ' AND client_name = ?'; params.push(client); }
  if (from)   { sql += ' AND date >= ?';        params.push(from); }

  sql += ' ORDER BY date DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/payments/owed — clients with outstanding balance + earliest unpaid session
router.get('/owed', (_req, res) => {
  autoCompleteSessions();

  const clients = db.prepare(`
    SELECT
      c.name,
      c.rate,
      COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.duration * c.rate ELSE 0 END), 0)
        - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.client_name = c.name), 0)
        AS balance_owed
    FROM clients c
    LEFT JOIN sessions s ON s.client_name = c.name
    GROUP BY c.name
    HAVING balance_owed > 0
    ORDER BY balance_owed DESC
  `).all();

  const sessionStmt = db.prepare(`
    SELECT date, time, duration FROM sessions
    WHERE client_name = ? AND status = 'Completed'
    ORDER BY date ASC, time ASC
  `);
  const paidStmt = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE client_name = ?`
  );

  const result = clients.map(client => {
    const sessions = sessionStmt.all(client.name);
    const paid = paidStmt.get(client.name).total;

    let running = 0;
    let earliestUnpaid = null;
    let hoursOwed = 0;
    for (const s of sessions) {
      running += s.duration * client.rate;
      if (running > paid) {
        if (!earliestUnpaid) earliestUnpaid = { date: s.date, time: s.time };
        hoursOwed += s.duration;
      }
    }

    return {
      name: client.name,
      balance_owed: client.balance_owed,
      hours_owed: hoursOwed,
      earliest_unpaid: earliestUnpaid,
    };
  });

  res.json(result);
});

// GET /api/payments/summary — each client's balance (completed sessions - payments)
router.get('/summary', (_req, res) => {
  autoCompleteSessions();
  const rows = db.prepare(`
    SELECT
      c.name,
      c.rate,
      COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.duration * c.rate ELSE 0 END), 0) AS earned,
      COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.client_name = c.name), 0) AS paid,
      COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.duration * c.rate ELSE 0 END), 0)
        - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.client_name = c.name), 0)
        AS balance_owed
    FROM clients c
    LEFT JOIN sessions s ON s.client_name = c.name
    GROUP BY c.name
    ORDER BY c.name
  `).all();

  res.json(rows);
});

// GET /api/payments/:client — payment history for one client
router.get('/:client', (req, res) => {
  autoCompleteSessions();
  const payments = db.prepare(`
    SELECT client_name AS name, date, amount, method, receipt_number
    FROM payments WHERE client_name = ? ORDER BY date DESC
  `).all(req.params.client);

  res.json(payments);
});

// POST /api/payments — log a payment
router.post('/', (req, res) => {
  const { name, date, amount, method, receipt_number } = req.body;

  if (!name || !date || amount == null || !method)
    return res.status(400).json({ error: 'name, date, amount, and method are required' });

  if (!VALID_METHODS.includes(method))
    return res.status(400).json({ error: `method must be one of: ${VALID_METHODS.join(', ')}` });

  try {
    db.prepare(`
      INSERT INTO payments (client_name, date, amount, method, receipt_number)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, date, amount, method, receipt_number ?? null);

    res.status(201).json({ name, date, amount, method, receipt_number });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Payment for this client on this date already exists' });
    if (err.message.includes('FOREIGN KEY')) return res.status(400).json({ error: 'Client does not exist' });
    throw err;
  }
});

// PUT /api/payments/:client/:date — update a payment
router.put('/:client/:date', (req, res) => {
  const { amount, method, receipt_number } = req.body;

  if (method && !VALID_METHODS.includes(method))
    return res.status(400).json({ error: `method must be one of: ${VALID_METHODS.join(', ')}` });

  const result = db.prepare(`
    UPDATE payments SET amount = ?, method = ?, receipt_number = ?
    WHERE client_name = ? AND date = ?
  `).run(amount, method, receipt_number ?? null, req.params.client, req.params.date);

  if (result.changes === 0) return res.status(404).json({ error: 'Payment not found' });
  res.json({ client_name: req.params.client, date: req.params.date, amount, method, receipt_number });
});

// DELETE /api/payments/:client/:date — delete a payment
router.delete('/:client/:date', (req, res) => {
  const result = db.prepare(`
    DELETE FROM payments WHERE client_name = ? AND date = ?
  `).run(req.params.client, req.params.date);

  if (result.changes === 0) return res.status(404).json({ error: 'Payment not found' });
  res.status(204).send();
});

module.exports = router;
