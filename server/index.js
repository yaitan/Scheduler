/**
 * index.js
 *
 * Express server entry point. Initialises the database, registers middleware
 * and routes, serves the React client build, and starts listening.
 *
 * Middleware / route order matters here:
 *   1. cors + express.json  — applied to every request.
 *   2. POST /api/auth/verify — mounted before requireAuth so the login
 *      endpoint itself is reachable without a token.
 *   3. GET /api/health      — unauthenticated health-check for uptime monitors.
 *   4. requireAuth          — all /api/* routes below this point require a
 *      valid JWT.
 *   5. /api/clients, /api/sessions, /api/payments — protected API routes.
 *   6. express.static       — serves the compiled React app from client/build.
 *   7. Catch-all SPA route  — returns index.html for any non-API path so that
 *      React Router (client-side navigation) works on direct URL loads and
 *      browser refreshes.
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const { initDb } = require('./db/database');
const requireAuth = require('./middleware/requireAuth');

const app  = express();
const PORT = process.env.PORT || 3001;

// Initialise the database schema on startup. Safe to call on every boot
// because schema.sql uses CREATE TABLE IF NOT EXISTS throughout.
initDb();

app.use(cors());
app.use(express.json());

// ── Unauthenticated routes ────────────────────────────────────────────────────

app.use('/api/auth', require('./routes/auth'));

// Simple health-check endpoint — useful for Railway / uptime monitors.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ── Auth wall — all routes below require a valid Bearer JWT ───────────────────

app.use('/api', requireAuth);

app.use('/api/clients',  require('./routes/clients'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/payments', require('./routes/payments'));

// ── React client (production) ─────────────────────────────────────────────────

// Serve static assets from the React build output.
app.use(express.static(path.join(__dirname, '../client/build')));

// Return index.html for every non-API path so that client-side routing works
// on direct URL loads and page refreshes. The negative lookahead (?!\/api)
// ensures API 404s are not swallowed by this catch-all.
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Allow the process to exit cleanly when the host sends SIGTERM
// (e.g. Railway scaling down a dyno).
process.on('SIGTERM', () => {
  process.exit(0);
});
