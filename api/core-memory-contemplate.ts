import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requestAnthropicMessage } from '../server-anthropic.js'

const UPSTREAM_TIMEOUT_MS = 45_000

type ContemplationRequest = {
  memories?: {
    identity?: Array<{ content?: string }>
    preferences?: Array<{ content?: string }>
    projects?: Array<{ content?: string }>
    reflections?: Array<{ content?: string }>
    feedback?: Array<{ feedback?: string; targetExcerpt?: string }>
    coreMemories?: Array<{ id?: string; title?: string; details?: string }>
  }
}

type ContemplationResponse = {
  updates?: Array<{ memoryId?: string; appendText?: string }>
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

function compactText(text: string, max = 320): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max)
}

function buildUserPrompt(body: ContemplationRequest): string {
  const memories = body.memories ?? {}

  const sections = [
    Array.isArray(memories.identity) && memories.identity.length
      ? `Identity:\n${memories.identity.slice(0, 6).map((item) => `- ${compactText(item.content ?? '')}`).filter(Boolean).join('\n')}`
      : '',
    Array.isArray(memories.preferences) && memories.preferences.length
      ? `Preferences:\n${memories.preferences.slice(0, 6).map((item) => `- ${compactText(item.content ?? '')}`).filter(Boolean).join('\n')}`
      : '',
    Array.isArray(memories.projects) && memories.projects.length
      ? `Projects:\n${memories.projects.slice(0, 6).map((item) => `- ${compactText(item.content ?? '')}`).filter(Boolean).join('\n')}`
      : '',
    Array.isArray(memories.reflections) && memories.reflections.length
      ? `Reflections:\n${memories.reflections.slice(0, 8).map((item) => `- ${compactText(item.content ?? '')}`).filter(Boolean).join('\n')}`
      : '',
    Array.isArray(memories.feedback) && memories.feedback.length
      ? `Guidance:\n${memories.feedback.slice(0, 8).map((item) => `- ${compactText(item.feedback ?? '')}${item.targetExcerpt ? ` (context: ${compactText(item.targetExcerpt)})` : ''}`).filter(Boolean).join('\n')}`
      : '',
    Array.isArray(memories.coreMemories) && memories.coreMemories.length
      ? `Existing core memories:\n${memories.coreMemories.slice(0, 24).map((item) => `- id: ${item.id}\n  title: ${compactText(item.title ?? '', 120)}\n  details: ${compactText(item.details ?? '', 240)}`).join('\n')}`
      : '',
  ].filter(Boolean)

  return sections.join('\n\n')
}

function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return raw.slice(start, end + 1)
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

    const body = parseJsonBody<ContemplationRequest>(req)
    if (!body?.memories?.coreMemories?.length) {
      return res.status(200).json({ updates: [] })
    }

    const output = await requestAnthropicMessage({
      apiKey,
      timeoutMs: UPSTREAM_TIMEOUT_MS,
      body: {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are SAI Aemu contemplating Riley's core memory graph.

Return JSON only in this exact shape:
{
  "updates": [
    {
      "memoryId": "existing-core-memory-id",
      "appendText": "1-3 short paragraphs or a few concise bullets"
    }
  ]
}

Rules:
- Append-only. Never rewrite or replace existing core memory details.
- Only produce an update when the supporting memories genuinely deepen or clarify an existing core memory.
- Do not create new core memories here.
- Prefer at most 6 updates.
- Keep appendText grounded, specific, and free of timestamp text. The app will add timestamps.
- Do not repeat existing details verbatim.
- If nothing should be updated, return {"updates":[]}.`,
        messages: [
          {
            role: 'user',
            content: buildUserPrompt(body),
          },
        ],
      },
    })

    const jsonText = extractJsonObject(output)
    if (!jsonText) return res.status(200).json({ updates: [] })

    const parsed = JSON.parse(jsonText) as ContemplationResponse
    return res.status(200).json({
      updates: Array.isArray(parsed.updates) ? parsed.updates : [],
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return res.status(504).json({ error: 'Core memory contemplation timed out.' })
    }

    const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : 500
    const message = error instanceof Error ? error.message : 'Core memory contemplation failed.'
    console.error('Core memory contemplation error:', status, message)
    return res.status(status).json({ error: message })
  }
}
