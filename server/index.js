const express = require('express');
const cors = require('cors');
// Database: uses Node's built-in node:sqlite (available since Node 22)
// Import and initialize in db/database.js when adding routes

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes (to be added in future steps)
// app.use('/api/clients', require('./routes/clients'));
// app.use('/api/sessions', require('./routes/sessions'));
// app.use('/api/payments', require('./routes/payments'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
