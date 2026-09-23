const mongoose = require('mongoose');

// Singleton settings document (fixed _id) — right now it only tracks which
// resume is active, but it's a natural place for future app-wide settings.
const settingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'app-settings' },
  activeResumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', default: null },
});

module.exports = mongoose.model('Settings', settingsSchema);
