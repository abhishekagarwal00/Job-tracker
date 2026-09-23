require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');

const connectDB = require('./config/db');
const jobsRouter = require('./routes/jobs');
const resumesRouter = require('./routes/resumes');
const { fetchAndStoreJobs } = require('./services/jobFetcher');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/jobs', jobsRouter);
app.use('/api/resumes', resumesRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
  });

  // Scheduled auto-fetch (default: every 6 hours). Configure via FETCH_CRON.
  const cronExpr = process.env.FETCH_CRON || '0 */6 * * *';
  if (cron.validate(cronExpr)) {
    cron.schedule(cronExpr, async () => {
      console.log('[cron] running scheduled job fetch...');
      try {
        const summary = await fetchAndStoreJobs();
        console.log('[cron] fetch summary:', summary);
      } catch (err) {
        console.error('[cron] fetch failed:', err.message);
      }
    });
    console.log(`[cron] scheduled auto-fetch: "${cronExpr}"`);
  } else {
    console.warn(`[cron] invalid FETCH_CRON expression "${cronExpr}", auto-fetch disabled`);
  }
}

start();
