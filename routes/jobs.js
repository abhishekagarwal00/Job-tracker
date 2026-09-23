const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const { fetchAndStoreJobs } = require('../services/jobFetcher');

// GET /api/jobs?status=applied&minScore=50&sort=score
router.get('/', async (req, res) => {
  try {
    const { status, minScore, sort } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (minScore) filter.matchScore = { $gte: Number(minScore) };

    let sortSpec = { createdAt: -1 };
    if (sort === 'score') sortSpec = { matchScore: -1 };
    if (sort === 'posted') sortSpec = { postedAt: -1 };

    const jobs = await Job.find(filter).sort(sortSpec).limit(500);
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/stats — counts per status, for dashboard summary cards
router.get('/stats', async (req, res) => {
  try {
    const counts = await Job.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    const stats = Object.fromEntries(Job.STATUSES.map((s) => [s, 0]));
    counts.forEach((c) => {
      stats[c._id] = c.count;
    });
    stats.total = await Job.countDocuments();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/fetch — manually trigger an ingestion run (also runs on a schedule)
router.post('/fetch', async (req, res) => {
  try {
    const summary = await fetchAndStoreJobs();
    res.json({ message: 'Fetch complete', ...summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/jobs/:id — update tracking fields (status, notes, follow-up date)
router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['status', 'notes', 'followUpAt'];
    const updates = {};
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key];
    }
    if (updates.status === 'applied') updates.appliedAt = new Date();

    const job = await Job.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/jobs/:id
router.delete('/:id', async (req, res) => {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
