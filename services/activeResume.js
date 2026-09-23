const Settings = require('../models/Settings');
const Resume = require('../models/Resume');

/** Returns the currently active Resume document, or null if none is set / it was deleted. */
async function getActiveResume() {
  const settings = await Settings.findById('app-settings');
  if (!settings?.activeResumeId) return null;

  const resume = await Resume.findById(settings.activeResumeId);
  return resume || null; // handles a stale pointer to a deleted resume
}

/** Marks the given resume id as active (upserts the settings doc). */
async function setActiveResume(resumeId) {
  await Settings.findByIdAndUpdate(
    'app-settings',
    { activeResumeId: resumeId },
    { upsert: true, new: true }
  );
}

/** Returns just the id of the active resume, or null. Cheap check, no populate. */
async function getActiveResumeId() {
  const settings = await Settings.findById('app-settings');
  return settings?.activeResumeId ? String(settings.activeResumeId) : null;
}

/** Clears the active pointer if it currently points at the given id (call this on delete). */
async function clearActiveIfMatches(resumeId) {
  await Settings.findOneAndUpdate(
    { _id: 'app-settings', activeResumeId: resumeId },
    { activeResumeId: null }
  );
}

module.exports = { getActiveResume, setActiveResume, getActiveResumeId, clearActiveIfMatches };
