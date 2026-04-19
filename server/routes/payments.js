/**
 * payments.js
 *
 * Routes for recording and querying client payments, and for computing
 * outstanding balance summaries.
 *
 * The "balance owed" figure throughout this file is defined as:
 *   SUM(completed session revenue) − SUM(payments received)
 * where session revenue = duration (minutes) / 60 * rate.
 *
 * Endpoints:
 *   GET  /api/payments              — All payments, with optional filters.
 *   GET  /api/payments/owed         — Clients with a positive balance, plus debt details.
 *   GET  /api/payments/summary      — Balance summary for every client.
 *   POST /api/payments              — Record a new payment.
 *   PUT  /api/payments/:payment_id  — Update an existing payment.
 *   DELETE /api/payments/:payment_id — Delete a payment.
 */

const { Router } = require('express');
const { db, autoCompleteSessions } = require('../db/database');

const router = Router();

/**
 * Allowed payment method strings. Validated on POST and PUT.
 * NOTE: Keep in sync with METHODS in client/src/components/PaymentModal.js.
 */
const VALID_METHODS = ['PayBox', 'Bit', 'Transfer', 'Cash', 'Other'];

/**
 * GET /api/payments
 *
 * Returns payments joined with client name, with optional filters. Results are
 * ordered by payment date descending (most recent first).
 *
 * Query params (all optional, combinable):
 *   client_id  {integer}  — Filter to a specific client by ID.
 *   client     {string}   — Filter to a specific client by name (ignored if client_id is set).
 *   from       {string}   — Only return payments on or after this date (YYYY-MM-DD).
 *
 * Example request:
 *   GET /api/payments?from=2025-01-01
 *
 * Example response (200):
 *   [
 *     { "id": 5, "client_id": 1, "name": "Alice", "date": "2025-03-01",
 *       "amount": 300, "method": "Bit", "receipt_number": null }
 *   ]
 */
router.get('/', (req, res) => {
  autoCompleteSessions();
  const { client, client_id, from } = req.query;
  let sql = `
    SELECT p.id, p.client_id, c.name, p.date, p.amount, p.method, p.receipt_number
    FROM payments p
    JOIN clients c ON c.id = p.client_id
    WHERE 1=1
  `;
  const params = [];

  if (client_id) {
    sql += ' AND p.client_id = ?'; params.push(client_id);
  } else if (client) {
    sql += ' AND c.name = ?'; params.push(client);
  }
  if (from) { sql += ' AND p.date >= ?'; params.push(from); }

  sql += ' ORDER BY p.date DESC';
  res.json(db.prepare(sql).all(...params));
});

/**
 * GET /api/payments/owed
 *
 * Returns only clients who have a positive balance (revenue earned > payments
 * received), along with detailed debt breakdown:
 *   balance_owed     — Total ₪ outstanding.
 *   minutes_owed     — Total session minutes not yet covered by payments.
 *   earliest_unpaid  — Date and time of the first session not yet paid for,
 *                      determined by walking sessions chronologically and tracking
 *                      the running total against payments received.
 *
 * The earliest_unpaid calculation iterates completed sessions in chronological
 * order and finds the first session where the cumulative revenue exceeds total
 * payments. All sessions from that point onward contribute to minutes_owed.
 *
 * Example request:
 *   GET /api/payments/owed
 *
 * Example response (200):
 *   [
 *     {
 *       "client_id": 1, "name": "Alice", "balance_owed": 150,
 *       "minutes_owed": 60,
 *       "earliest_unpaid": { "date": "2025-02-15", "time": "16:00" }
 *     }
 *   ]
 */
router.get('/owed', (_req, res) => {
  autoCompleteSessions();

  const clients = db.prepare(`
    SELECT
      c.id AS client_id,
      c.name,
      c.rate,
      COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.duration * s.rate / 60.0 ELSE 0 END), 0)
        - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.client_id = c.id), 0)
        AS balance_owed
    FROM clients c
    LEFT JOIN sessions s ON s.client_id = c.id
    GROUP BY c.id
    HAVING balance_owed > 0
    ORDER BY balance_owed DESC
  `).all();

  // Prepared once and reused for each client to avoid re-compiling the statement.
  const sessionStmt = db.prepare(`
    SELECT s.date, s.time, s.duration, s.rate
    FROM sessions s JOIN clients c ON c.id = s.client_id
    WHERE s.client_id = ? AND s.status = 'Completed'
    ORDER BY s.date ASC, s.time ASC
  `);
  const paidStmt = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE client_id = ?`
  );

  const result = clients.map(client => {
    const sessions = sessionStmt.all(client.client_id);
    const paid = paidStmt.get(client.client_id).total;

    // Walk sessions in chronological order. Once the running revenue total
    // exceeds what has been paid, every subsequent session is "unpaid".
    let running = 0;
    let earliestUnpaid = null;
    let minutesOwed = 0;
    for (const s of sessions) {
      running += s.duration * s.rate / 60.0;
      if (running > paid) {
        if (!earliestUnpaid) earliestUnpaid = { date: s.date, time: s.time };
        minutesOwed += s.duration;
      }
    }

    return {
      client_id:       client.client_id,
      name:            client.name,
      balance_owed:    client.balance_owed,
      minutes_owed:    minutesOwed,
      earliest_unpaid: earliestUnpaid,
    };
  });

  res.json(result);
});

/**
 * GET /api/payments/summary
 *
 * Returns a balance row for every client, including those with a zero or
 * negative (credit) balance. Used by CalendarView to compute the "Total Owed"
 * figure in the summary bar.
 *
 * Example request:
 *   GET /api/payments/summary
 *
 * Example response (200):
 *   [
 *     { "client_id": 1, "name": "Alice", "rate": 150,
 *       "earned": 450, "paid": 300, "balance_owed": 150 },
 *     { "client_id": 2, "name": "Bob",   "rate": 120,
 *       "earned": 240, "paid": 240, "balance_owed": 0 }
 *   ]
 */
router.get('/summary', (_req, res) => {
  autoCompleteSessions();
  const rows = db.prepare(`
    SELECT
      c.id AS client_id,
      c.name,
      c.rate,
      COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.duration * s.rate / 60.0 ELSE 0 END), 0) AS earned,
      COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.client_id = c.id), 0) AS paid,
      COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.duration * s.rate / 60.0 ELSE 0 END), 0)
        - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.client_id = c.id), 0)
        AS balance_owed
    FROM clients c
    LEFT JOIN sessions s ON s.client_id = c.id
    GROUP BY c.id
    ORDER BY c.name
  `).all();

  res.json(rows);
});

/**
 * POST /api/payments
 *
 * Records a new payment.
 *
 * Body:
 *   client_id       {integer}      — Client ID. Required.
 *   date            {string}       — Payment date in YYYY-MM-DD format. Required.
 *   amount          {number}       — Payment amount in ₪. Required.
 *   method          {string}       — One of: PayBox, Bit, Transfer, Cash, Other. Required.
 *   receipt_number  {string|null}  — Optional receipt or reference number.
 *
 * Example request:
 *   POST /api/payments
 *   { "client_id": 1, "date": "2025-03-01", "amount": 300, "method": "Bit", "receipt_number": null }
 *
 * Example response (201):
 *   { "id": 5, "client_id": 1, "name": "Alice", "date": "2025-03-01",
 *     "amount": 300, "method": "Bit", "receipt_number": null }
 *
 * Errors:
 *   400  { "error": "client_id, date, amount, and method are required" }
 *   400  { "error": "method must be one of: PayBox, Bit, Transfer, Cash, Other" }
 *   400  { "error": "Client does not exist" }  — Foreign key violation.
 */
router.post('/', (req, res) => {
  const { client_id, date, amount, method, receipt_number } = req.body;

  if (!client_id || !date || amount == null || !method)
    return res.status(400).json({ error: 'client_id, date, amount, and method are required' });

  if (!VALID_METHODS.includes(method))
    return res.status(400).json({ error: `method must be one of: ${VALID_METHODS.join(', ')}` });

  try {
    const result = db.prepare(`
      INSERT INTO payments (client_id, date, amount, method, receipt_number)
      VALUES (?, ?, ?, ?, ?)
    `).run(client_id, date, amount, method, receipt_number ?? null);

    // Re-fetch the inserted row joined with the client name so the response
    // matches the shape returned by GET /api/payments.
    const payment = db.prepare(`
      SELECT p.id, p.client_id, c.name, p.date, p.amount, p.method, p.receipt_number
      FROM payments p JOIN clients c ON c.id = p.client_id
      WHERE p.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(payment);
  } catch (err) {
    if (err.message.includes('FOREIGN KEY')) return res.status(400).json({ error: 'Client does not exist' });
    throw err;
  }
});

/**
 * PUT /api/payments/:payment_id
 *
 * Updates an existing payment. All body fields are optional — omitted fields
 * retain their current values. receipt_number is the only field that can be
 * explicitly set to null (to clear it); omitting it leaves the existing value.
 *
 * Path params:
 *   payment_id  {integer}  — The payment's database ID.
 *
 * Body (all optional):
 *   client_id       {integer}      — Reassign to a different client.
 *   date            {string}       — Updated date (YYYY-MM-DD).
 *   amount          {number}       — Updated amount.
 *   method          {string}       — Updated method. Must be a valid VALID_METHODS value.
 *   receipt_number  {string|null}  — Updated receipt number. Pass null to clear.
 *
 * Example request:
 *   PUT /api/payments/5
 *   { "amount": 350 }
 *
 * Example response (200):
 *   { "id": 5, "client_id": 1, "name": "Alice", "date": "2025-03-01",
 *     "amount": 350, "method": "Bit", "receipt_number": null }
 *
 * Errors:
 *   400  { "error": "method must be one of: ..." }  — Invalid method value.
 *   404  { "error": "Payment not found" }
 */
router.put('/:payment_id', (req, res) => {
  const { client_id, date, amount, method, receipt_number } = req.body;

  if (method && !VALID_METHODS.includes(method))
    return res.status(400).json({ error: `method must be one of: ${VALID_METHODS.join(', ')}` });

  const existing = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.payment_id);
  if (!existing) return res.status(404).json({ error: 'Payment not found' });

  db.prepare(`
    UPDATE payments SET client_id = ?, date = ?, amount = ?, method = ?, receipt_number = ?
    WHERE id = ?
  `).run(
    client_id ?? existing.client_id,
    date      ?? existing.date,
    amount    ?? existing.amount,
    method    ?? existing.method,
    // Distinguish "field omitted" (keep existing) from "field set to null" (clear it).
    receipt_number !== undefined ? (receipt_number ?? null) : existing.receipt_number,
    req.params.payment_id
  );

  const payment = db.prepare(`
    SELECT p.id, p.client_id, c.name, p.date, p.amount, p.method, p.receipt_number
    FROM payments p JOIN clients c ON c.id = p.client_id
    WHERE p.id = ?
  `).get(req.params.payment_id);

  res.json(payment);
});

/**
 * DELETE /api/payments/:payment_id
 *
 * Permanently deletes a payment record.
 *
 * Path params:
 *   payment_id  {integer}  — The payment's database ID.
 *
 * Example request:
 *   DELETE /api/payments/5
 *
 * Example response (204): (no body)
 *
 * Errors:
 *   404  { "error": "Payment not found" }
 */
router.delete('/:payment_id', (req, res) => {
  const result = db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.payment_id);
  if (result.changes === 0) return res.status(404).json({ error: 'Payment not found' });
  res.status(204).send();
});

module.exports = router;
