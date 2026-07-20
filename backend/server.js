require('dotenv').config();
const express = require('express');
const cors = require('cors');

require('./db/database'); // opens the MongoDB connection before routes load

const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const voteRoutes = require('./routes/vote.routes');
const { startElectionScheduler } = require('./utils/electionScheduler');

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', voteRoutes); // exposes /api/elections/current and /api/vote

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`COSSA Vote backend running on http://localhost:${PORT}`));

// Periodically auto-close any election whose voting window has elapsed —
// see utils/electionScheduler.js for details.
startElectionScheduler();
