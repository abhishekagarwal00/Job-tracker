// Resume <-> job description scoring.
//
// Primary signal: cosine similarity between precomputed sentence embeddings
// (see services/embeddings.js) — this captures genuine semantic overlap, so
// "led a team of engineers" and "managed a software team" score as similar
// even with no shared keywords.
//
// Secondary signal: overlap on a curated list of recognizable tech/skill
// keywords — kept because it's precise and gives the user an interpretable
// "why did this score well" list, which pure embeddings can't provide.
//
// Fallback: if embeddings aren't available for either document (model failed
// to load, or a legacy record predates this feature), scoring degrades
// gracefully to plain TF-based cosine similarity so the app still works.

const { cosineSimilarity: embeddingCosine } = require('./embeddings');

const STOPWORDS = new Set(
  (
    'a an the and or but if then else for while with without of to in on at ' +
    'by from as is are was were be been being this that these those it its ' +
    'you your we our they their he she his her i me my will would can could ' +
    'should must shall may might have has had do does did not no yes about ' +
    'into over under again further out up down job role team work years ' +
    'experience required requirements responsibilities skills strong good ' +
    'plus etc using use used per most also company looking ideal candidate'
  ).split(/\s+/)
);

const SKILL_DICTIONARY = [
  'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'golang',
  'rust', 'ruby', 'php', 'kotlin', 'swift', 'scala', 'sql', 'nosql',
  'react', 'reactjs', 'angular', 'vue', 'nextjs', 'node', 'nodejs', 'express',
  'django', 'flask', 'fastapi', 'spring', 'springboot', 'rails',
  'mongodb', 'postgresql', 'postgres', 'mysql', 'redis', 'elasticsearch',
  'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'terraform', 'ansible',
  'ci/cd', 'jenkins', 'github actions', 'git', 'linux',
  'machine learning', 'deep learning', 'nlp', 'tensorflow', 'pytorch',
  'data structures', 'algorithms', 'system design', 'microservices',
  'rest', 'graphql', 'grpc', 'kafka', 'rabbitmq', 'websocket',
  'html', 'css', 'tailwind', 'sass', 'webpack', 'vite',
  'agile', 'scrum', 'testing', 'jest', 'pytest', 'selenium', 'playwright',
];

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function termFrequency(tokens) {
  const tf = {};
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  return tf;
}

function tfCosineSimilarity(resumeText, jobText) {
  const tfA = termFrequency(tokenize(resumeText));
  const tfB = termFrequency(tokenize(jobText));
  const keys = new Set([...Object.keys(tfA), ...Object.keys(tfB)]);

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const k of keys) {
    const a = tfA[k] || 0;
    const b = tfB[k] || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word-boundary match so short tokens like "go" or "r" don't false-positive
// inside unrelated words (e.g. "go" inside "MongoDB").
function containsSkill(lowerText, skill) {
  const pattern = new RegExp(`(?<![a-z0-9])${escapeRegex(skill)}(?![a-z0-9])`, 'i');
  return pattern.test(lowerText);
}

function findSkillOverlap(resumeText, jobText) {
  const rLower = resumeText.toLowerCase();
  const jLower = jobText.toLowerCase();
  return SKILL_DICTIONARY.filter(
    (skill) => containsSkill(rLower, skill) && containsSkill(jLower, skill)
  );
}

/**
 * Score a job description against a resume.
 *
 * @param {object} params
 * @param {string} params.resumeText
 * @param {number[]} [params.resumeEmbedding] - precomputed, from services/embeddings.js
 * @param {string} params.jobText
 * @param {number[]} [params.jobEmbedding] - precomputed, from services/embeddings.js
 * @returns {{ score: number|null, matchedKeywords: string[], method: 'embeddings'|'keywords'|'none' }}
 */
function scoreJobAgainstResume({ resumeText, resumeEmbedding = [], jobText, jobEmbedding = [] }) {
  if (!resumeText || !resumeText.trim()) {
    return { score: null, matchedKeywords: [], method: 'none' };
  }
  if (!jobText || !jobText.trim()) {
    return { score: 0, matchedKeywords: [], method: 'none' };
  }

  const skillOverlap = findSkillOverlap(resumeText, jobText);
  const skillRatio = skillOverlap.length === 0 ? 0 : skillOverlap.length / Math.max(6, skillOverlap.length);

  const haveEmbeddings = resumeEmbedding.length > 0 && jobEmbedding.length > 0;

  let topicalSim;
  let method;
  if (haveEmbeddings) {
    topicalSim = Math.max(0, embeddingCosine(resumeEmbedding, jobEmbedding));
    method = 'embeddings';
  } else {
    topicalSim = tfCosineSimilarity(resumeText, jobText);
    method = 'keywords';
  }

  // Embeddings are trusted more heavily (70/30) since they capture meaning,
  // not just shared words; the TF fallback is weighted evenly with the skill
  // list (50/50) since plain word-overlap alone is a weaker signal.
  const topicalWeight = haveEmbeddings ? 0.7 : 0.5;
  const skillWeight = 1 - topicalWeight;

  const blended = topicalSim * topicalWeight + Math.min(skillRatio, 1) * skillWeight;
  const score = Math.round(Math.min(Math.max(blended, 0), 1) * 100);

  return { score, matchedKeywords: skillOverlap, method };
}

module.exports = { scoreJobAgainstResume, tokenize, findSkillOverlap, tfCosineSimilarity };
