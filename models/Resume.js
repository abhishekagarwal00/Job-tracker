const mongoose = require('mongoose');

// Each saved resume is its own document now (auto ObjectId), so a user can
// keep several — e.g. one tailored for backend roles, one for frontend —
// and switch which one is "active" for scoring. See models/Settings.js for
// which resume is currently active.
const resumeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Backend resume"
    rawText: { type: String, default: '' },
    skills: { type: [String], default: [] }, // extracted / user-confirmed keywords

    // Cached sentence embedding (384-dim, from all-MiniLM-L6-v2), recomputed
    // whenever this resume's text changes.
    embedding: { type: [Number], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Resume', resumeSchema);
