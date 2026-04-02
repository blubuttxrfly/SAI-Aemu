import type { VercelRequest, VercelResponse } from '@vercel/node'

const MEMORY_KEY = 'aemu:riley:memories'

function parseStoredValue<T>(input: unknown, maxDepth = 3): T | null {
  let current = input

  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (typeof current !== 'string') return current as T

    try {
      current = JSON.parse(current)
    } catch {
      break
    }
  }

  return current as T
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

async function redisGet<T>(url: string, token: string, key: string): Promise<T | null> {
  const res = await fetch(`${url}/get/${key}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json() as { result?: unknown }
  return data.result == null ? null : parseStoredValue<T>(data.result)
}

async function redisSet(url: string, token: string, key: string, value: unknown): Promise<void> {
  await fetch(`${url}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!redisUrl || !redisToken) {
    if (req.method === 'GET') return res.status(200).json({ memories: null, storage: 'browser' })
    return res.status(200).json({ ok: true })
  }

  try {
    if (req.method === 'GET') {
      const memories = await redisGet<unknown>(redisUrl, redisToken, MEMORY_KEY)
      return res.status(200).json({ memories, storage: 'upstash' })
    }

    if (req.method === 'POST') {
      const body = parseJsonBody<{ memories?: unknown }>(req)
      const { memories } = body ?? {}
      if (memories) await redisSet(redisUrl, redisToken, MEMORY_KEY, memories)
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('Memory error:', err)
    return res.status(500).json({ error: 'Memory field disruption' })
  }
}
