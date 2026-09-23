const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const router = express.Router();

const Resume = require('../models/Resume');
const { embedText } = require('../services/embeddings');
const { rescoreAllJobs } = require('../services/jobFetcher');
const {
  getActiveResumeId,
  setActiveResume,
  clearActiveIfMatches,
} = require('../services/activeResume');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/resumes — list all saved resumes (without the full text, to keep it light)
// plus which one is currently active.
router.get('/', async (req, res) => {
  try {
    const [resumes, activeId] = await Promise.all([
      Resume.find({}, { rawText: 0, embedding: 0 }).sort({ createdAt: -1 }),
      getActiveResumeId(),
    ]);
    res.json({ resumes, activeResumeId: activeId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/resumes/:id — full resume including text (e.g. to show/edit it)
router.get('/:id', async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found' });
    res.json(resume);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/resumes/text — add a new resume from pasted text. It becomes
// active immediately (that's almost always what you want right after adding one).
router.post('/text', async (req, res) => {
  try {
    const { name, text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'text field is required' });
    if (!name || !name.trim()) return res.status(400).json({ error: 'name field is required' });

    const embedding = await embedText(text);
    const resume = await Resume.create({ name: name.trim(), rawText: text, embedding });

    await setActiveResume(resume._id);
    const rescoreSummary = await rescoreAllJobs();

    res.json({ resume, rescored: rescoreSummary.updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/resumes/upload — add a new resume from an uploaded PDF. Also becomes active.
router.post('/upload', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: resume)' });
    const name = (req.body.name || req.file.originalname || 'Resume').trim();

    const parsed = await pdfParse(req.file.buffer);
    const text = parsed.text;
    const embedding = await embedText(text);

    const resume = await Resume.create({ name, rawText: text, embedding });

    await setActiveResume(resume._id);
    const rescoreSummary = await rescoreAllJobs();

    res.json({ resume, rescored: rescoreSummary.updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/resumes/:id/activate — switch which resume scores your jobs.
// Fast: job embeddings are already cached, so this is just vector math.
router.post('/:id/activate', async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found' });

    await setActiveResume(resume._id);
    const rescoreSummary = await rescoreAllJobs();

    res.json({ activeResumeId: String(resume._id), rescored: rescoreSummary.updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/resumes/:id
router.delete('/:id', async (req, res) => {
  try {
    const resume = await Resume.findByIdAndDelete(req.params.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found' });

    // If the deleted resume was active, clear the pointer — jobs keep their
    // last scores until another resume is activated (avoids surprise wipes).
    await clearActiveIfMatches(resume._id);

    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
