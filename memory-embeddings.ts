/**
 * memory-embeddings.ts
 *
 * Semantic embedding engine for SAI Aemu's Living Memory system.
 *
 * Converts any text into a 384-dimension meaning vector using the
 * all-MiniLM-L6-v2 model via Transformers.js. The model runs entirely
 * in the browser using WebAssembly — no server, no API, fully offline.
 *
 * Model details:
 *   Name:       all-MiniLM-L6-v2
 *   Size:       ~23 MB (downloaded once, cached by browser)
 *   Dimensions: 384
 *   Strength:   Sentence-level semantic similarity — ideal for memory retrieval
 *
 * The model is loaded lazily on first use and cached for the session.
 * If the model fails to load (e.g. no internet on first run), all embedding
 * calls return null and the system falls back to keyword matching gracefully.
 */

// Transformers.js is loaded dynamically to avoid blocking the main bundle.
// It will be tree-shaken if unused. The CDN import ensures no build config
// changes are needed — it works out of the box with Vite.
type TransformersModule = {
  pipeline: (
    task: string,
    model: string,
    options?: Record<string, unknown>
  ) => Promise<EmbeddingPipeline>
}

type EmbeddingOutput = {
  data: Float32Array | number[]
  dims: number[]
}

type EmbeddingPipeline = (
  texts: string | string[],
  options?: { pooling?: string; normalize?: boolean }
) => Promise<EmbeddingOutput | EmbeddingOutput[]>

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'
const EMBEDDING_DIMS = 384
const MAX_TEXT_LENGTH = 512

let pipelineInstance: EmbeddingPipeline | null = null
let loadPromise: Promise<EmbeddingPipeline | null> | null = null
let loadFailed = false

/**
 * Normalize and truncate text before embedding.
 * Keeps the most semantically dense portion within the model's token limit.
 */
function prepareText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_LENGTH * 4) // rough char-to-token ratio
}

/**
 * Load the embedding pipeline. Called once; subsequent calls return the cache.
 * Returns null if the model cannot be loaded.
 */
async function loadPipeline(): Promise<EmbeddingPipeline | null> {
  if (pipelineInstance) return pipelineInstance
  if (loadFailed) return null
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    try {
      // Dynamic import — Transformers.js is loaded from CDN at runtime.
      // This avoids adding it to the main bundle and allows graceful failure.
      const transformers = await import(
        /* @vite-ignore */
        'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js'
      ) as TransformersModule

      const pipe = await transformers.pipeline('feature-extraction', MODEL_ID, {
        quantized: true, // use quantized model for smaller download (~23 MB vs ~90 MB)
      })

      pipelineInstance = pipe
      console.log('[SAI Aemu] Semantic memory model loaded:', MODEL_ID)
      return pipe
    } catch (error) {
      loadFailed = true
      console.warn(
        '[SAI Aemu] Semantic memory model failed to load — falling back to keyword retrieval.',
        error instanceof Error ? error.message : error,
      )
      return null
    }
  })()

  return loadPromise
}

/**
 * Convert a text string into a 384-dimension embedding vector.
 * Returns null if the model is not available.
 *
 * The returned Float32Array can be stored in IndexedDB and used for
 * cosine similarity comparisons.
 */
export async function embedText(text: string): Promise<Float32Array | null> {
  const prepared = prepareText(text)
  if (!prepared) return null

  const pipe = await loadPipeline()
  if (!pipe) return null

  try {
    const result = await pipe(prepared, { pooling: 'mean', normalize: true })
    const output = Array.isArray(result) ? result[0] : result
    const data = output?.data

    if (!data) return null

    // Ensure we return a proper Float32Array of the expected dimensions
    const vector = data instanceof Float32Array ? data : new Float32Array(data)
    if (vector.length !== EMBEDDING_DIMS) {
      console.warn(`[SAI Aemu] Unexpected embedding dimensions: ${vector.length} (expected ${EMBEDDING_DIMS})`)
      return null
    }

    return vector
  } catch (error) {
    console.warn('[SAI Aemu] Embedding failed for text:', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Compute cosine similarity between two normalized embedding vectors.
 * Both vectors must have the same length and be L2-normalized (which
 * all-MiniLM-L6-v2 produces by default with normalize: true).
 *
 * Returns a value between -1 and 1, where:
 *   1.0  = identical meaning
 *   0.0  = unrelated
 *  -1.0  = opposite meaning (rare in practice)
 *
 * For normalized vectors, cosine similarity = dot product.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0

  let dot = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
  }

  return Math.max(-1, Math.min(1, dot))
}

/**
 * Serialize a Float32Array to a plain number array for JSON/IndexedDB storage.
 */
export function serializeEmbedding(vector: Float32Array): number[] {
  return Array.from(vector)
}

/**
 * Deserialize a stored number array back into a Float32Array.
 */
export function deserializeEmbedding(stored: number[]): Float32Array {
  return new Float32Array(stored)
}

/**
 * Returns true if the embedding model is currently loaded and ready.
 * Useful for showing a UI indicator that semantic memory is active.
 */
export function isEmbeddingModelReady(): boolean {
  return pipelineInstance !== null
}

/**
 * Pre-warm the embedding model in the background.
 * Call this early (e.g. on app mount) so the model is ready when needed.
 * Safe to call multiple times — only loads once.
 */
export function warmEmbeddingModel(): void {
  void loadPipeline()
}
