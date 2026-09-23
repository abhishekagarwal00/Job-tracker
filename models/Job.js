const mongoose = require('mongoose');

const STATUSES = ['saved', 'applied', 'interview', 'offer', 'rejected'];

const jobSchema = new mongoose.Schema(
  {
    // Identity from the source API — used to dedupe on re-fetch
    sourceId: { type: String, required: true, unique: true },
    source: { type: String, required: true }, // e.g. 'arbeitnow', 'remoteok'

    title: { type: String, required: true },
    company: { type: String, default: 'Unknown' },
    location: { type: String, default: 'Not specified' },
    remote: { type: Boolean, default: false },
    url: { type: String, required: true },
    description: { type: String, default: '' },
    tags: { type: [String], default: [] },
    postedAt: { type: Date },

    // Resume-match scoring (0-100), recomputed whenever the resume changes
    matchScore: { type: Number, default: null },
    matchedKeywords: { type: [String], default: [] },
    matchMethod: { type: String, enum: ['embeddings', 'keywords', 'none'], default: 'none' },

    // Cached sentence embedding (384-dim, from all-MiniLM-L6-v2), computed
    // once at fetch time so resume rescoring never needs to re-embed jobs.
    embedding: { type: [Number], default: [] },

    // Tracking
    status: { type: String, enum: STATUSES, default: 'saved' },
    notes: { type: String, default: '' },
    appliedAt: { type: Date, default: null },
    followUpAt: { type: Date, default: null },
  },
  { timestamps: true }
);

jobSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('Job', jobSchema);
