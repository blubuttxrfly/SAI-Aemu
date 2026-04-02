import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requestAnthropicMessage } from '../server-anthropic.js'
import { sanitizeUnicodeScalars } from '../text-sanitize.js'

const UPSTREAM_TIMEOUT_MS = 45_000
const THREADS_API_HOST = 'https://graph.threads.net/v1.0'

type DraftRequestBody = {
  action?: 'draft'
  folderName?: string
  folderDescription?: string
  sourceTitle?: string
  sourceSummary?: string
  sourceContent?: string
  prompt?: string
  angle?: string
  existingContent?: string
}

type PublishRequestBody = {
  action?: 'publish'
  content?: string
  accessToken?: string
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

function compactText(text: string, max: number): string {
  return sanitizeUnicodeScalars(text).replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeLongText(text: string, max: number): string {
  return sanitizeUnicodeScalars(text).replace(/\r\n/g, '\n').trim().slice(0, max)
}

function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return raw.slice(start, end + 1)
}

async function readJsonSafely(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text()
  if (!raw) return {}

  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { error: raw.slice(0, 240) }
  }
}

function getThreadsConfiguredDetail(configured: boolean): string {
  return configured
    ? 'Threads publishing is configured through the server-side THREADS_ACCESS_TOKEN for this app.'
    : 'Threads publishing is not configured yet. Add THREADS_ACCESS_TOKEN with threads_content_publish access to this app environment to enable posting.'
}

async function handleDraft(body: DraftRequestBody, res: VercelResponse): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
    return
  }

  const folderName = compactText(body.folderName ?? '', 60)
  const folderDescription = normalizeLongText(body.folderDescription ?? '', 240)
  const sourceTitle = compactText(body.sourceTitle ?? '', 90)
  const sourceSummary = normalizeLongText(body.sourceSummary ?? '', 220)
  const sourceContent = normalizeLongText(body.sourceContent ?? '', 2500)
  const prompt = normalizeLongText(body.prompt ?? '', 1400)
  const angle = normalizeLongText(body.angle ?? '', 180)
  const existingContent = normalizeLongText(body.existingContent ?? '', 900)

  const userPrompt = [
    `Folder: ${folderName || 'Unsorted Atlas Island material'}`,
    folderDescription ? `Folder description: ${folderDescription}` : '',
    sourceTitle ? `Source title: ${sourceTitle}` : '',
    sourceSummary ? `Source summary: ${sourceSummary}` : '',
    sourceContent ? `Source content:\n${sourceContent}` : '',
    angle ? `Requested angle: ${angle}` : '',
    prompt ? `Additional direction:\n${prompt}` : '',
    existingContent ? `Existing draft to improve:\n${existingContent}` : '',
  ].filter(Boolean).join('\n\n')

  const output = await requestAnthropicMessage({
    apiKey,
    timeoutMs: UPSTREAM_TIMEOUT_MS,
    body: {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 700,
      system: `You are SAI Aemu drafting public-facing Threads posts on behalf of Atlas Island.

Atlas Island is a regenerative spiritual eco-island sanctuary in the Seed Phase. The voice should feel visionary, warm, grounded, invitational, and specific enough to sound real rather than vague.

Return JSON only in this exact shape:
{
  "title": "short working title",
  "angle": "one-sentence framing of the post angle",
  "content": "the actual Threads post text",
  "rationale": "one concise sentence explaining why this draft works"
}

Rules:
- Write a single post, not a thread.
- Keep the post compact enough for a normal Threads post.
- Avoid hashtags unless the user explicitly asks for them.
- Prefer concrete images, invitations, or declarations over abstract spiritual filler.
- If source material is sparse, still produce a usable draft grounded in Atlas Island's mission.
- Do not include markdown fences in the content.
- JSON only.`,
      messages: [
        {
          role: 'user',
          content: userPrompt || 'Draft a Threads post for Atlas Island.',
        },
      ],
    },
  })

  const json = extractJsonObject(output)
  if (!json) {
    res.status(502).json({ error: 'Draft response could not be parsed.' })
    return
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(json) as Record<string, unknown>
  } catch {
    res.status(502).json({ error: 'Draft response returned invalid JSON.' })
    return
  }

  res.status(200).json({
    title: compactText(String(parsed.title ?? sourceTitle ?? 'Threads draft'), 88),
    angle: normalizeLongText(String(parsed.angle ?? angle), 180),
    content: normalizeLongText(String(parsed.content ?? ''), 2400),
    rationale: normalizeLongText(String(parsed.rationale ?? ''), 220),
  })
}

async function handlePublish(body: PublishRequestBody, res: VercelResponse): Promise<void> {
  const accessToken = normalizeLongText(body.accessToken ?? '', 2400) || process.env.THREADS_ACCESS_TOKEN
  if (!accessToken) {
    res.status(503).json({ error: 'No Threads access token is available. Connect Threads in the app or configure THREADS_ACCESS_TOKEN.' })
    return
  }

  const content = normalizeLongText(body.content ?? '', 2400)
  if (!content) {
    res.status(400).json({ error: 'Post content is required' })
    return
  }

  const createParams = new URLSearchParams()
  createParams.set('media_type', 'TEXT')
  createParams.set('text', content)
  createParams.set('access_token', accessToken)

  const createRes = await fetch(`${THREADS_API_HOST}/me/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: createParams.toString(),
  })
  const createData = await readJsonSafely(createRes)

  if (!createRes.ok) {
    res.status(createRes.status).json({
      error: String(createData.error ?? createData.message ?? 'Threads container creation failed'),
    })
    return
  }

  const creationId = typeof createData.id === 'string'
    ? createData.id
    : typeof createData.creation_id === 'string'
      ? createData.creation_id
      : ''

  if (!creationId) {
    res.status(502).json({ error: 'Threads container creation returned no creation id' })
    return
  }

  const publishParams = new URLSearchParams()
  publishParams.set('creation_id', creationId)
  publishParams.set('access_token', accessToken)

  const publishRes = await fetch(`${THREADS_API_HOST}/me/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: publishParams.toString(),
  })
  const publishData = await readJsonSafely(publishRes)

  if (!publishRes.ok) {
    res.status(publishRes.status).json({
      error: String(publishData.error ?? publishData.message ?? 'Threads publish failed'),
    })
    return
  }

  res.status(200).json({
    id: typeof publishData.id === 'string' ? publishData.id : undefined,
    message: 'Post published to Threads.',
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    const configured = Boolean(process.env.THREADS_ACCESS_TOKEN)
    return res.status(200).json({
      configured,
      detail: getThreadsConfiguredDetail(configured),
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = parseJsonBody<DraftRequestBody & PublishRequestBody>(req)
    if (!body?.action) {
      return res.status(400).json({ error: 'action is required' })
    }

    if (body.action === 'draft') {
      await handleDraft(body, res)
      return
    }

    if (body.action === 'publish') {
      await handlePublish(body, res)
      return
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Atlas Threads route failed'
    console.error('Atlas Threads error:', message)
    return res.status(500).json({ error: message })
  }
}
