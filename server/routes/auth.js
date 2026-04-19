/**
 * auth.js
 *
 * Authentication route. Validates the shared app password and issues a JWT
 * used to authorise all subsequent API requests.
 *
 * The app uses a single password (set via the APP_PASSWORD environment variable)
 * rather than per-user accounts. The issued JWT has no expiry — the user stays
 * logged in until they clear their browser storage or the JWT_SECRET changes.
 *
 * Endpoints:
 *   POST  /api/auth/verify  — Validate password and return a signed JWT.
 */

const express = require('express');
const jwt     = require('jsonwebtoken');
const router  = express.Router();

/**
 * POST /api/auth/verify
 *
 * Validates the submitted password against APP_PASSWORD. On success, signs and
 * returns a JWT using JWT_SECRET. The client stores this token in localStorage
 * and sends it as a Bearer Authorization header on every subsequent request.
 *
 * Body:
 *   password  {string}  — The app password.
 *
 * Example request:
 *   POST /api/auth/verify
 *   { "password": "mysecret" }
 *
 * Example response (200):
 *   { "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
 *
 * Errors:
 *   401  { "error": "Invalid password" }  — Password missing or incorrect.
 */
router.post('/verify', (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = jwt.sign({ ok: true }, process.env.JWT_SECRET);
  res.json({ token });
});

module.exports = router;
