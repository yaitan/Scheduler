/**
 * requireAuth.js
 *
 * Express middleware that enforces JWT authentication on every route it is
 * applied to. Mounted globally in server.js for all /api/* routes except
 * POST /api/auth/verify (which issues the token in the first place).
 *
 * Expects the request to carry a Bearer token in the Authorization header:
 *   Authorization: Bearer <jwt>
 *
 * On success: calls next() and the request proceeds to the route handler.
 * On failure: responds 401 and the request is terminated — next() is not called.
 */

const jwt = require('jsonwebtoken');

/**
 * Validates the Bearer JWT in the Authorization header.
 * Rejects with 401 if the header is missing, malformed, or the token fails
 * verification against JWT_SECRET (expired, tampered, or signed with a
 * different secret).
 */
module.exports = function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    // auth.slice(7) strips the "Bearer " prefix to get the raw token string.
    jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
