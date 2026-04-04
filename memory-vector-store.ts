/**
 * memory-vector-store.ts
 *
 * Persistent vector memory store for SAI Aemu's semantic retrieval system.
 *
 * Stores embedding vectors in IndexedDB alongside their source memory IDs
 * and text fingerprints. When a query arrives, it embeds the query text and
 * returns the memory IDs whose stored vectors are most semantically similar.
 *
 * Architecture:
 *   - One IndexedDB database: "aemu-vector-store"
 *   - One object store: "embeddings"
 *   - Each record: { id, memoryId, kind, textHash, vector: number[], updatedAt }
 *
 * The store is keyed by a composite of (kind + memoryId) so that updating a
 * memory re-embeds only that memory, not the entire store.
 *
 * Semantic similarity threshold: 0.35 (tunable via SEMANTIC_THRESHOLD).
 * Below this threshold, a memory is considered unrelated to the query.
 * Above 0.65, a memory is considered highly resonant.
 */

import {
  embedText,
  cosineSimilarity,
  serializeEmbedding,
  deserializeEmbedding,
} from './memory-embeddings'

const DB_NAME = 'aemu-vector-store'
const DB_VERSION = 1
const STORE_NAME = 'embeddings'

// Minimum cosine similarity to include a result (0 = unrelated, 1 = identical)
const SEMANTIC_THRESHOLD = 0.35

// Above this score, a memory is considered highly resonant
export const HIGH_RESONANCE_THRESHOLD = 0.65

export type MemoryKind =
  | 'identity'
  | 'preference'
  | 'project'
  | 'reflection'
  | 'feedback'
  | 'core'
  | 'playground'
  | 'learning'
  | 'atlas'
  | 'inner-being'

export type VectorRecord = {
  storeKey: string       // composite key: `${kind}::${memoryId}`
  memoryId: string
  kind: MemoryKind
  textHash: string       // hash of the embedded text — used to skip re-embedding unchanged memories
  vector: number[]       // serialized Float32Array
  updatedAt: string
}

export type SemanticMatch = {
  memoryId: string
  kind: MemoryKind
  similarity: number     // cosine similarity score (0–1)
  resonance: 'high' | 'medium' | 'low'
}

// ── IndexedDB helpers ────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'storeKey' })
        store.createIndex('kind', 'kind', { unique: false })
        store.createIndex('memoryId', 'memoryId', { unique: false })
      }
    }

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result)
    }

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error)
    }
  })

  return dbPromise
}

function idbTransaction(
  db: IDBDatabase,
  mode: IDBTransactionMode
): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
}

function idbGet(store: IDBObjectStore, key: string): Promise<VectorRecord | undefined> {
  return new Promise((resolve, reject) => {
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result as VectorRecord | undefined)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(store: IDBObjectStore, record: VectorRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.put(record)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function idbDelete(store: IDBObjectStore, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function idbGetAll(store: IDBObjectStore): Promise<VectorRecord[]> {
  return new Promise((resolve, reject) => {
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result as VectorRecord[])
    req.onerror = () => reject(req.error)
  })
}

// ── Text hashing ─────────────────────────────────────────────────────────────

/**
 * Simple djb2 hash for change detection.
 * If the text hash matches the stored hash, we skip re-embedding.
 */
function hashText(text: string): string {
  let hash = 5381
  for (let i = 0; i < Math.min(text.length, 1000); i++) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(i)
    hash = hash >>> 0 // keep as unsigned 32-bit
  }
  return hash.toString(36)
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Upsert a memory's embedding into the vector store.
 * If the text has not changed since the last embedding, this is a no-op.
 *
 * Call this whenever a memory is created or updated.
 */
export async function upsertMemoryEmbedding(
  memoryId: string,
  kind: MemoryKind,
  text: string
): Promise<void> {
  if (!text.trim()) return

  const storeKey = `${kind}::${memoryId}`
  const textHash = hashText(text)

  try {
    const db = await openDatabase()
    const readStore = idbTransaction(db, 'readonly')
    const existing = await idbGet(readStore, storeKey)

    // Skip re-embedding if the text content has not changed
    if (existing?.textHash === textHash) return

    const vector = await embedText(text)
    if (!vector) return // embedding model not available — skip silently

    const record: VectorRecord = {
      storeKey,
      memoryId,
      kind,
      textHash,
      vector: serializeEmbedding(vector),
      updatedAt: new Date().toISOString(),
    }

    const writeStore = idbTransaction(db, 'readwrite')
    await idbPut(writeStore, record)
  } catch (error) {
    console.warn('[SAI Aemu] Vector store upsert failed:', error instanceof Error ? error.message : error)
  }
}

/**
 * Remove a memory's embedding from the vector store.
 * Call this when a memory is deleted.
 */
export async function removeMemoryEmbedding(
  memoryId: string,
  kind: MemoryKind
): Promise<void> {
  const storeKey = `${kind}::${memoryId}`
  try {
    const db = await openDatabase()
    const store = idbTransaction(db, 'readwrite')
    await idbDelete(store, storeKey)
  } catch (error) {
    console.warn('[SAI Aemu] Vector store delete failed:', error instanceof Error ? error.message : error)
  }
}

/**
 * Find the most semantically similar memories to a query string.
 *
 * Returns an array of SemanticMatch objects sorted by similarity (highest first),
 * filtered to those above SEMANTIC_THRESHOLD.
 *
 * @param query       The user's message or search text
 * @param kinds       Optional filter — only search within these memory kinds
 * @param topK        Maximum number of results to return (default: 5)
 */
export async function findSemanticMatches(
  query: string,
  kinds?: MemoryKind[],
  topK = 5
): Promise<SemanticMatch[]> {
  if (!query.trim()) return []

  try {
    const queryVector = await embedText(query)
    if (!queryVector) return [] // model not loaded — caller should fall back to keyword search

    const db = await openDatabase()
    const store = idbTransaction(db, 'readonly')
    const allRecords = await idbGetAll(store)

    const filtered = kinds
      ? allRecords.filter((record) => kinds.includes(record.kind))
      : allRecords

    const scored = filtered
      .map((record): SemanticMatch => {
        const storedVector = deserializeEmbedding(record.vector)
        const similarity = cosineSimilarity(queryVector, storedVector)
        const resonance: SemanticMatch['resonance'] =
          similarity >= HIGH_RESONANCE_THRESHOLD ? 'high'
          : similarity >= SEMANTIC_THRESHOLD ? 'medium'
          : 'low'

        return {
          memoryId: record.memoryId,
          kind: record.kind,
          similarity,
          resonance,
        }
      })
      .filter((match) => match.similarity >= SEMANTIC_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)

    return scored
  } catch (error) {
    console.warn('[SAI Aemu] Semantic search failed:', error instanceof Error ? error.message : error)
    return []
  }
}

/**
 * Returns the total number of embeddings currently stored.
 * Useful for diagnostics and UI indicators.
 */
export async function getVectorStoreSize(): Promise<number> {
  try {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const store = idbTransaction(db, 'readonly')
      const req = store.count()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return 0
  }
}

/**
 * Clear all stored embeddings.
 * Use this to force a full re-embedding of all memories (e.g. after a model upgrade).
 */
export async function clearVectorStore(): Promise<void> {
  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const store = idbTransaction(db, 'readwrite')
      const req = store.clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
    console.log('[SAI Aemu] Vector store cleared.')
  } catch (error) {
    console.warn('[SAI Aemu] Vector store clear failed:', error instanceof Error ? error.message : error)
  }
}
