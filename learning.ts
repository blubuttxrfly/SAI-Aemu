import type { AemuMemories, LearningCycleSession } from './types'
import { sanitizeUnicodeScalars } from './text-sanitize'

type LearningCycleApiResponse = {
  topic: string
  query: string
  provider?: string
  summary: string
  memoryNote: string
  keyPoints?: string[]
  openQuestions?: string[]
  sources?: Array<{ title: string; url: string; snippet?: string }>
  startedAt: string
  completedAt: string
  error?: string
}

async function parseApiJson<T extends { error?: string }>(res: Response, path: string): Promise<T> {
  const raw = await res.text()

  if (!raw) return {} as T

  try {
    return JSON.parse(raw) as T
  } catch {
    const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 120)
    throw new Error(`Non-JSON response from ${path}: ${snippet}`)
  }
}

export async function requestLearningCycle(
  topic: string,
  memories: AemuMemories,
  previousSummary?: string
): Promise<Omit<LearningCycleSession, 'id' | 'status' | 'updatedAt' | 'createdAt'>> {
  const res = await fetch('/api/learning-cycle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: sanitizeUnicodeScalars(topic).trim(),
      previousSummary: previousSummary ? sanitizeUnicodeScalars(previousSummary).trim() : undefined,
      memories,
    }),
  })

  const data = await parseApiJson<LearningCycleApiResponse>(res, '/api/learning-cycle')
  if (!res.ok || data.error) {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }

  return {
    topic: data.topic,
    query: data.query,
    provider: data.provider,
    summary: data.summary,
    memoryNote: data.memoryNote,
    keyPoints: data.keyPoints ?? [],
    openQuestions: data.openQuestions ?? [],
    sources: data.sources ?? [],
    completedAt: data.completedAt,
    error: undefined,
  }
}

export function buildLearningChatPrompt(topic: string, input: string, autoSearchEnabled: boolean): string {
  const normalizedTopic = sanitizeUnicodeScalars(topic).replace(/\s+/g, ' ').trim()
  const normalizedInput = sanitizeUnicodeScalars(input).trim()

  if (!normalizedTopic) return normalizedInput

  if (autoSearchEnabled) {
    return `Search the web with Brave and help me learn about "${normalizedTopic}". Riley asks: ${normalizedInput}`
  }

  return `Help me learn about "${normalizedTopic}" using our current memory and local context. Riley asks: ${normalizedInput}`
}
