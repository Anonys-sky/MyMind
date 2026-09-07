// ═══════════════════════════════════════════════════════════
// Local Embedding Generator — @xenova/transformers
// ═══════════════════════════════════════════════════════════
//
// Generates 384-dimensional embeddings locally using the
// all-MiniLM-L6-v2 model via ONNX Runtime. No API calls,
// no rate limits, no cost. The model (~23MB) downloads on
// first use and is cached.
//
// If the model fails to load (e.g., ONNX Runtime issue),
// the system falls back to keyword-only search gracefully.

import { config } from '../config.js';

let pipeline: any = null;
let pipelinePromise: Promise<any> | null = null;
let loadFailed = false;

/**
 * Lazily load the embedding model. Downloads ~23MB on first use.
 */
async function getEmbeddingPipeline(): Promise<any | null> {
  if (pipeline) return pipeline;
  if (loadFailed) return null;
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = (async () => {
    try {
      console.log('[Embedder] Loading embedding model (first time may download ~23MB)...');
      const transformers = await import('@xenova/transformers');
      const createPipeline = transformers.pipeline;

      // Disable progress bars in production
      if (transformers.env) {
        transformers.env.allowLocalModels = true;
        transformers.env.useBrowserCache = false;
      }

      pipeline = await createPipeline('feature-extraction', config.embedding.model);
      console.log(`[Embedder] ✅ Model loaded (${config.embedding.dimensions}-dim vectors)`);
      return pipeline;
    } catch (error) {
      console.error('[Embedder] ❌ Failed to load embedding model:', error);
      console.warn('[Embedder] Semantic search disabled. Falling back to keyword search only.');
      loadFailed = true;
      pipeline = null;
      pipelinePromise = null;
      return null;
    }
  })();

  return pipelinePromise;
}

/**
 * Generate a 384-dimensional embedding vector for the given text.
 * Returns null if the embedding model couldn't be loaded.
 *
 * @param text - The text to embed (title + summary + tags combined)
 * @returns Array of 384 floats, or null if embedding is unavailable
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const extractor = await getEmbeddingPipeline();
  if (!extractor) return null;

  try {
    // Truncate very long text (model has a 512 token context window)
    const truncated = text.length > 2000 ? text.substring(0, 2000) : text;

    const output = await extractor(truncated, {
      pooling: 'mean',
      normalize: true,
    });

    // output.data is a Float32Array, convert to regular array for JSON storage
    return Array.from(output.data as Float32Array);
  } catch (error) {
    console.error('[Embedder] Error generating embedding:', error);
    return null;
  }
}

/**
 * Start loading the embedding model immediately on startup.
 * This runs in the background so the first capture doesn't wait.
 */
export function warmupEmbedder(): void {
  getEmbeddingPipeline().catch(() => {
    // Error already logged inside getEmbeddingPipeline
  });
}

/**
 * Check if the embedding model is loaded and ready.
 */
export function isEmbedderReady(): boolean {
  return pipeline !== null;
}
