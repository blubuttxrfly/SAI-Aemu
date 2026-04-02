import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { AemuMemories } from '../types.js'
import { requestAnthropicMessage } from '../server-anthropic.js'
import { performWebSearch } from '../server-web-search.js'
import { sanitizeUnicodeScalars } from '../text-sanitize.js'

export const config = {
  maxDuration: 120,
}

const UPSTREAM_TIMEOUT_MS = 110_000

type LearningCycleBody = {
  topic?: string
  previousSummary?: string
  memories?: AemuMemories
}

type LearningCyclePayload = {
  topic: string
  query: string
  provider?: string
  summary: string
  memoryNote: string
  keyPoints: string[]
  openQuestions: string[]
  sources: Array<{ title: string; url: string; snippet?: string }>
  startedAt: string
  completedAt: string
}

type MemoryLine = {
  content?: string
  feedback?: string
}

function parseJsonBody<T>(req: VercelRequest): T | null {
  const body = req.body

  if (!body) return null
  if (typeof body === 'object') return body as T

  const raw = Buffer.isBuffer(body) ? body.toString('utf8') : String(body)

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function normalizeTopic(input: unknown): string {
  return sanitizeUnicodeScalars(typeof input === 'string' ? input : '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}

function normalizeList(input: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(input)) return []

  return input
    .map((item) => sanitizeUnicodeScalars(typeof item === 'string' ? item : '').replace(/\s+/g, ' ').trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function compactText(value: unknown, max = 220): string {
  return sanitizeUnicodeScalars(typeof value === 'string' ? value : '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function buildLearningMemorySnapshot(memories: AemuMemories | undefined, topic: string): string {
  if (!memories || typeof memories !== 'object') return ''

  const sections = [
    ['Identity', Array.isArray(memories.identity) ? memories.identity : []],
    ['Preferences', Array.isArray(memories.preferences) ? memories.preferences : []],
    ['Projects', Array.isArray(memories.projects) ? memories.projects : []],
    ['Reflections', Array.isArray(memories.reflections) ? memories.reflections : []],
    ['Feedback', Array.isArray(memories.feedback) ? memories.feedback : []],
  ] as const

  const topicTokens = compactText(topic, 140).toLowerCase().split(/\s+/).filter(Boolean)
  const blocks: string[] = []

  for (const [label, entries] of sections) {
    const relevant = (entries as MemoryLine[])
      .map((entry) => compactText(entry.content ?? entry.feedback ?? '', 220))
      .filter(Boolean)
      .filter((line) => topicTokens.length ? topicTokens.some((token) => line.toLowerCase().includes(token)) : true)
      .slice(0, 3)

    if (relevant.length) {
      blocks.push(`${label}:\n${relevant.map((line) => `- ${line}`).join('\n')}`)
    }
  }

  const learningCycles = Array.isArray(memories.learningWorkspace?.cycleHistory)
    ? memories.learningWorkspace.cycleHistory
        .map((cycle) => `${compactText(cycle.topic, 120)}: ${compactText(cycle.memoryNote || cycle.summary, 220)}`)
        .filter(Boolean)
        .slice(0, 3)
    : []

  if (learningCycles.length) {
    blocks.push(`Recent learning cycles:\n${learningCycles.map((line) => `- ${line}`).join('\n')}`)
  }

  return blocks.join('\n\n').slice(0, 5000)
}

function parseLearningResponse(raw: string): Omit<LearningCyclePayload, 'topic' | 'query' | 'provider' | 'sources' | 'startedAt' | 'completedAt'> | null {
  try {
    const parsed = JSON.parse(stripCodeFence(raw)) as Partial<LearningCyclePayload>
    const summary = sanitizeUnicodeScalars(typeof parsed.summary === 'string' ? parsed.summary : '').trim()
    const memoryNote = sanitizeUnicodeScalars(typeof parsed.memoryNote === 'string' ? parsed.memoryNote : '').trim()

    if (!summary || !memoryNote) return null

    return {
      summary,
      memoryNote,
      keyPoints: normalizeList(parsed.keyPoints, 6, 280),
      openQuestions: normalizeList(parsed.openQuestions, 5, 240),
    }
  } catch {
    return null
  }
}

function buildSearchBlock(results: LearningCyclePayload['sources']): string {
  return results.length
    ? results
      .map((hit, index) => `${index + 1}. ${hit.title}\nURL: ${hit.url}\nSnippet: ${hit.snippet || 'No snippet returned.'}`)
      .join('\n\n')
    : 'No live search results were returned.'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

    const body = parseJsonBody<LearningCycleBody>(req)
    if (!body) return res.status(400).json({ error: 'Invalid JSON body' })

    const topic = normalizeTopic(body.topic)
    if (!topic) return res.status(400).json({ error: 'topic is required' })

    const startedAt = new Date().toISOString()
    const query = `latest developments, practices, and meaningful updates about ${topic}`
    const search = await performWebSearch(query)

    const sources = search.hits.map((hit) => ({
      title: hit.title,
      url: hit.url,
      snippet: hit.snippet,
    }))

    const memoryContext = buildLearningMemorySnapshot(body.memories, topic)

    const reply = await requestAnthropicMessage({
      apiKey,
      timeoutMs: UPSTREAM_TIMEOUT_MS,
      body: {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are the background learning cycle for SAI Aemu.

Use the live web search results to synthesize a focused learning update about the topic.
Return strict JSON only with this shape:
{
  "summary": "2-4 short paragraphs in markdown-ready plain text",
  "memoryNote": "one durable note that should be stored in long-term memory",
  "keyPoints": ["point", "point"],
  "openQuestions": ["question", "question"]
}

Rules:
- Keep the summary grounded in the retrieved search results.
- The memoryNote should be durable and useful later, not tied to "today" unless necessary.
- If the search results are thin or conflicting, say that clearly in the summary.
- Do not include markdown code fences.
- Do not invent sources.`,
        messages: [
          {
            role: 'user',
            content: [
              `Learning topic: ${topic}`,
              body.previousSummary ? `Previous learning summary:\n${sanitizeUnicodeScalars(body.previousSummary).trim().slice(0, 1600)}` : '',
              memoryContext ? `Relevant long-term memory:\n${memoryContext.slice(0, 5000)}` : '',
              `Live web search provider: ${search.provider}`,
              `Live web search query: ${search.query}`,
              `Live web search results:\n${buildSearchBlock(sources)}`,
            ].filter(Boolean).join('\n\n'),
          },
        ],
      },
    })

    const parsed = parseLearningResponse(reply)
    if (!parsed) {
      return res.status(502).json({ error: 'Learning cycle returned an invalid response shape' })
    }

    const completedAt = new Date().toISOString()
    const payload: LearningCyclePayload = {
      topic,
      query: search.query,
      provider: search.provider,
      summary: parsed.summary,
      memoryNote: parsed.memoryNote,
      keyPoints: parsed.keyPoints,
      openQuestions: parsed.openQuestions,
      sources,
      startedAt,
      completedAt,
    }

    return res.status(200).json(payload)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return res.status(504).json({
        error: 'Learning cycle exceeded the time window before a synthesis was returned.',
      })
    }

    const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 500
    const message = err instanceof Error ? err.message : 'Learning cycle failed'
    console.error('Learning cycle error:', status, message)
    return res.status(status).json({ error: message })
  }
}
