const express = require('express');
const cors = require('cors');
const { initDb } = require('./db/database');

const app = express();

initDb();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/clients', require('./routes/clients'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/payments', require('./routes/payments'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
