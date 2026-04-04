/**
 * memory-semantic-retrieval.ts
 *
 * Integration bridge between SAI Aemu's semantic vector store and the
 * existing Living Memory retrieval pipeline in memory.ts.
 *
 * This module provides:
 *   1. indexMemoriesForSemanticSearch() — indexes all current memories into
 *      the vector store, called on app load and after memory changes.
 *
 *   2. semanticPickRelevantEntries() — a drop-in replacement for the
 *      pickRelevantEntries() pattern in memory.ts. Uses semantic similarity
 *      when the model is ready, falls back to keyword scoring otherwise.
 *
 *   3. syncMemoryEmbeddings() — incrementally syncs only changed memories,
 *      keeping the vector store up to date without re-embedding everything.
 *
 * Graceful degradation:
 *   If the embedding model is not loaded (first run, no internet, or slow
 *   device), all functions fall back silently to the existing keyword system.
 *   The user never sees an error — semantic search activates automatically
 *   once the model is ready.
 */

import type {
  AemuMemories,
  CoreMemoryItem,
  FeedbackItem,
  MemoryItem,
  PlaygroundSession,
  LearningCycleSession,
  AtlasOrganizerItem,
  InnerBeingLearningNote,
} from './types'
import {
  upsertMemoryEmbedding,
  removeMemoryEmbedding,
  findSemanticMatches,
  type MemoryKind,
  type SemanticMatch,
} from './memory-vector-store'
import { isEmbeddingModelReady } from './memory-embeddings'

// ── Text extraction helpers ──────────────────────────────────────────────────
// These build the text that gets embedded for each memory type.
// Richer text = better semantic matching.

function extractMemoryItemText(item: MemoryItem): string {
  return item.content ?? ''
}

function extractFeedbackText(item: FeedbackItem): string {
  return [item.feedback, item.targetExcerpt].filter(Boolean).join(' ')
}

function extractCoreMemoryText(item: CoreMemoryItem): string {
  const subTexts = item.subMemories
    .map((sub) => `${sub.title} ${sub.details}`)
    .join(' ')
  return [item.title, item.details, item.sourceExcerpt, subTexts]
    .filter(Boolean)
    .join(' ')
}

function extractPlaygroundText(item: PlaygroundSession): string {
  return [item.suggestedSkill, item.rationale, item.coreAwareness]
    .filter(Boolean)
    .join(' ')
}

function extractLearningCycleText(item: LearningCycleSession): string {
  return [item.topic, item.memoryNote, item.summary]
    .filter(Boolean)
    .join(' ')
}

function extractAtlasItemText(item: AtlasOrganizerItem): string {
  const sectionText = (item.documentSections ?? [])
    .map((section) => `${section.label} ${section.content}`)
    .join(' ')
  return [item.title, item.summary, item.content?.slice(0, 800), sectionText]
    .filter(Boolean)
    .join(' ')
}

function extractInnerBeingNoteText(item: InnerBeingLearningNote): string {
  return [item.title, item.note].filter(Boolean).join(' ')
}

// ── Incremental sync ─────────────────────────────────────────────────────────

type SyncEntry = {
  id: string
  kind: MemoryKind
  text: string
}

function collectSyncEntries(memories: AemuMemories): SyncEntry[] {
  const entries: SyncEntry[] = []

  for (const item of memories.identity) {
    const text = extractMemoryItemText(item)
    if (text) entries.push({ id: item.id, kind: 'identity', text })
  }
  for (const item of memories.preferences) {
    const text = extractMemoryItemText(item)
    if (text) entries.push({ id: item.id, kind: 'preference', text })
  }
  for (const item of memories.projects) {
    const text = extractMemoryItemText(item)
    if (text) entries.push({ id: item.id, kind: 'project', text })
  }
  for (const item of memories.reflections) {
    const text = extractMemoryItemText(item)
    if (text) entries.push({ id: item.id, kind: 'reflection', text })
  }
  for (const item of memories.feedback) {
    const text = extractFeedbackText(item)
    if (text) entries.push({ id: item.id, kind: 'feedback', text })
  }
  for (const item of memories.coreMemories) {
    const text = extractCoreMemoryText(item)
    if (text) entries.push({ id: item.id, kind: 'core', text })
  }
  for (const item of memories.playgroundSessions) {
    const text = extractPlaygroundText(item)
    if (text) entries.push({ id: item.id, kind: 'playground', text })
  }
  for (const item of memories.learningWorkspace.cycleHistory) {
    const text = extractLearningCycleText(item)
    if (text) entries.push({ id: item.id, kind: 'learning', text })
  }
  for (const item of memories.atlasOrganizer.items) {
    const text = extractAtlasItemText(item)
    if (text) entries.push({ id: item.id, kind: 'atlas', text })
  }
  for (const item of memories.innerBeing.learningNotes) {
    const text = extractInnerBeingNoteText(item)
    if (text) entries.push({ id: item.id, kind: 'inner-being', text })
  }

  return entries
}

/**
 * Incrementally sync all memories into the vector store.
 * Only re-embeds memories whose text has changed since the last sync.
 * Safe to call frequently — unchanged memories are skipped instantly.
 *
 * Call this:
 *   - On app mount (after loading memories from localStorage)
 *   - After any memory is created, updated, or deleted
 */
export async function syncMemoryEmbeddings(memories: AemuMemories): Promise<void> {
  const entries = collectSyncEntries(memories)

  // Process in small batches to avoid blocking the UI thread
  const BATCH_SIZE = 8
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map((entry) => upsertMemoryEmbedding(entry.id, entry.kind, entry.text))
    )
    // Yield to the browser between batches
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

/**
 * Remove a single memory's embedding when it is deleted.
 */
export async function removeEmbeddingForMemory(
  memoryId: string,
  kind: MemoryKind
): Promise<void> {
  await removeMemoryEmbedding(memoryId, kind)
}

// ── Semantic retrieval ───────────────────────────────────────────────────────

/**
 * Build a lookup map from semantic matches for fast ID-based access.
 */
function buildMatchLookup(matches: SemanticMatch[]): Map<string, SemanticMatch> {
  return new Map(matches.map((match) => [match.memoryId, match]))
}

/**
 * Semantic-aware version of pickRelevantEntries.
 *
 * When the embedding model is ready:
 *   - Finds semantically similar memories using cosine similarity
 *   - Returns items sorted by semantic resonance score
 *   - Falls back to keyword scoring for items not yet embedded
 *
 * When the embedding model is not ready:
 *   - Returns an empty array (caller should use keyword fallback)
 *
 * @param items           All items of a given memory type
 * @param query           The user's latest message
 * @param kind            The memory kind (for vector store lookup)
 * @param getId           Function to extract the item's ID
 * @param keywordScore    Fallback keyword score function (from existing system)
 * @param topK            Maximum results to return
 */
export async function semanticPickRelevantEntries<T>(input: {
  items: T[]
  query: string
  kind: MemoryKind
  getId: (item: T) => string
  keywordScore: (item: T) => number
  topK?: number
}): Promise<T[]> {
  const { items, query, kind, getId, keywordScore, topK = 3 } = input

  if (!items.length || !query.trim()) return []

  // If the model is not ready, signal to the caller to use keyword fallback
  if (!isEmbeddingModelReady()) return []

  try {
    const matches = await findSemanticMatches(query, [kind], topK * 2)
    const matchLookup = buildMatchLookup(matches)

    // Score each item: semantic similarity if available, keyword score otherwise
    const scored = items.map((item) => {
      const id = getId(item)
      const semanticMatch = matchLookup.get(id)

      if (semanticMatch) {
        // Convert cosine similarity (0–1) to a comparable score
        return { item, score: semanticMatch.similarity * 20 }
      }

      // Fall back to keyword score for items not yet in the vector store
      const kwScore = keywordScore(item)
      return { item, score: kwScore > 0 ? kwScore * 0.5 : 0 }
    })

    return scored
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((entry) => entry.item)
  } catch (error) {
    console.warn('[SAI Aemu] Semantic retrieval failed, falling back to keyword:', error instanceof Error ? error.message : error)
    return []
  }
}

/**
 * Returns the resonance label for a given cosine similarity score.
 * Used for logging and future UI indicators.
 */
export function getResonanceLabel(similarity: number): string {
  if (similarity >= 0.65) return 'high resonance'
  if (similarity >= 0.35) return 'resonant'
  return 'low resonance'
}
