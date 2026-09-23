// Generates sentence embeddings locally using a small ONNX transformer model
// (all-MiniLM-L6-v2, 384 dimensions, ~25MB quantized) via @xenova/transformers.
// No API key, no per-request cost, no network call after the model has been
// downloaded once (it's cached on disk automatically).
//
// @xenova/transformers ships as an ES module, so it's loaded with a dynamic
// import() — this keeps the rest of the codebase plain CommonJS.

let extractorPromise = null;
let modelLoadFailed = false;

async function getExtractor() {
  if (modelLoadFailed) return null;
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline } = await import('@xenova/transformers');
      console.log('[embeddings] loading all-MiniLM-L6-v2 (first run downloads ~25MB, then it is cached)...');
      const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        quantized: true,
      });
      console.log('[embeddings] model ready.');
      return extractor;
    })().catch((err) => {
      modelLoadFailed = true;
      console.warn(
        '[embeddings] could not load local embedding model, falling back to keyword matching. Reason:',
        err.message
      );
      return null;
    });
  }
  return extractorPromise;
}

/**
 * Embeds a piece of text into a normalized 384-dim vector.
 * Returns [] if the model isn't available (caller should fall back to a
 * simpler matching method in that case) or the input is empty.
 */
async function embedText(text) {
  const clean = (text || '').trim();
  if (!clean) return [];

  const extractor = await getExtractor();
  if (!extractor) return [];

  try {
    // Mean-pool token embeddings into one sentence vector, L2-normalized so
    // dot product == cosine similarity. Long text is truncated to keep
    // inference fast; a job description's first ~2000 chars carry the signal.
    const output = await extractor(clean.slice(0, 2000), { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (err) {
    console.warn('[embeddings] embedding failed for one document:', err.message);
    return [];
  }
}

/** Cosine similarity between two equal-length vectors, in [0, 1] range (vectors are non-negative-normalized in practice). */
function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

module.exports = { embedText, cosineSimilarity };
