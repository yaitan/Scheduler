const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

router.post('/verify', (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = jwt.sign({ ok: true }, process.env.JWT_SECRET);
  res.json({ token });
});

module.exports = router;
