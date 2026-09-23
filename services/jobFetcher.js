const axios = require('axios');
const Job = require('../models/Job');
const { scoreJobAgainstResume } = require('./matcher');
const { embedText } = require('./embeddings');
const { getActiveResume } = require('./activeResume');

const KEYWORDS = (process.env.JOB_KEYWORDS || 'software engineer')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/** Arbeitnow — free, no API key, supports tag/location filtering. */
async function fetchFromArbeitnow() {
  const res = await axios.get('https://www.arbeitnow.com/api/job-board-api', {
    timeout: 10000,
  });
  const jobs = res.data?.data || [];

  return jobs.map((j) => ({
    sourceId: `arbeitnow-${j.slug}`,
    source: 'arbeitnow',
    title: j.title,
    company: j.company_name || 'Unknown',
    location: j.location || (j.remote ? 'Remote' : 'Not specified'),
    remote: !!j.remote,
    url: j.url,
    description: j.description || '',
    tags: j.tags || [],
    postedAt: j.created_at ? new Date(j.created_at * 1000) : null,
  }));
}

/** RemoteOK — free, no API key. First array element is a metadata/legal notice, skip it. */
async function fetchFromRemoteOK() {
  const res = await axios.get('https://remoteok.com/api', {
    timeout: 10000,
    headers: { 'User-Agent': 'job-tracker-app (personal project)' },
  });
  const jobs = Array.isArray(res.data) ? res.data.slice(1) : [];

  return jobs
    .filter((j) => j.id && j.position)
    .map((j) => ({
      sourceId: `remoteok-${j.id}`,
      source: 'remoteok',
      title: j.position,
      company: j.company || 'Unknown',
      location: j.location || 'Remote',
      remote: true,
      url: j.url || `https://remoteok.com/remote-jobs/${j.id}`,
      description: j.description || '',
      tags: j.tags || [],
      postedAt: j.date ? new Date(j.date) : null,
    }));
}

function matchesKeywords(job) {
  if (KEYWORDS.length === 0) return true;
  const haystack = `${job.title} ${job.tags.join(' ')}`.toLowerCase();
  return KEYWORDS.some((kw) => haystack.includes(kw));
}

/**
 * Fetches from all sources, filters by configured keywords, upserts into
 * MongoDB (deduped by sourceId), and scores each job against the active
 * resume if one has been uploaded.
 */
async function fetchAndStoreJobs() {
  const results = await Promise.allSettled([fetchFromArbeitnow(), fetchFromRemoteOK()]);

  let allJobs = [];
  results.forEach((r, i) => {
    const sourceName = i === 0 ? 'arbeitnow' : 'remoteok';
    if (r.status === 'fulfilled') {
      allJobs = allJobs.concat(r.value);
    } else {
      console.warn(`[jobFetcher] ${sourceName} fetch failed:`, r.reason?.message);
    }
  });

  const filtered = allJobs.filter(matchesKeywords);

  const resume = await getActiveResume();
  const resumeText = resume?.rawText || '';
  const resumeEmbedding = resume?.embedding || [];

  let inserted = 0;
  let updated = 0;

  for (const job of filtered) {
    const jobText = `${job.title} ${job.description} ${job.tags.join(' ')}`;
    const existing = await Job.findOne({ sourceId: job.sourceId });

    // Embed once per job, on first sight — reused on every future rescore so
    // resume updates never need to re-embed the whole job history.
    const jobEmbedding = existing?.embedding?.length ? existing.embedding : await embedText(jobText);

    const { score, matchedKeywords, method } = scoreJobAgainstResume({
      resumeText,
      resumeEmbedding,
      jobText,
      jobEmbedding,
    });

    if (existing) {
      existing.matchScore = score;
      existing.matchedKeywords = matchedKeywords;
      existing.matchMethod = method;
      existing.embedding = jobEmbedding;
      // Don't overwrite tracking fields (status/notes) on re-fetch
      existing.description = job.description || existing.description;
      await existing.save();
      updated += 1;
    } else {
      await Job.create({ ...job, matchScore: score, matchedKeywords, matchMethod: method, embedding: jobEmbedding });
      inserted += 1;
    }
  }

  return { fetched: allJobs.length, keptAfterFilter: filtered.length, inserted, updated };
}

/**
 * Re-scores every stored job against the current resume — call after resume
 * upload. Job embeddings are already cached on each document, so this is
 * pure vector math (no model inference), even for a large job history.
 */
async function rescoreAllJobs() {
  const resume = await getActiveResume();
  const resumeText = resume?.rawText || '';
  const resumeEmbedding = resume?.embedding || [];
  const jobs = await Job.find({});

  let updated = 0;
  for (const job of jobs) {
    const jobText = `${job.title} ${job.description} ${job.tags.join(' ')}`;
    const { score, matchedKeywords, method } = scoreJobAgainstResume({
      resumeText,
      resumeEmbedding,
      jobText,
      jobEmbedding: job.embedding,
    });
    job.matchScore = score;
    job.matchedKeywords = matchedKeywords;
    job.matchMethod = method;
    await job.save();
    updated += 1;
  }
  return { updated };
}

module.exports = { fetchAndStoreJobs, rescoreAllJobs };
