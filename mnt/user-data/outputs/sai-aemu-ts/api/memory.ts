import type { VercelRequest, VercelResponse } from '@vercel/node'

const MEMORY_KEY = 'aemu:riley:memories'

async function redisGet(url: string, token: string, key: string): Promise<Record<string, string>> {
  const res = await fetch(`${url}/get/${key}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json() as { result?: string }
  return data.result ? JSON.parse(data.result) : {}
}

async function redisSet(url: string, token: string, key: string, value: unknown): Promise<void> {
  await fetch(`${url}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(value)),
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const redisUrl   = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

  // Gracefully handle missing Redis — memory just won't persist
  if (!redisUrl || !redisToken) {
    if (req.method === 'GET') return res.status(200).json({ memories: {} })
    return res.status(200).json({ ok: true })
  }

  try {
    if (req.method === 'GET') {
      const memories = await redisGet(redisUrl, redisToken, MEMORY_KEY)
      return res.status(200).json({ memories })
    }

    if (req.method === 'POST') {
      const { memories } = req.body as { memories?: Record<string, string> }
      if (memories) await redisSet(redisUrl, redisToken, MEMORY_KEY, memories)
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('Memory error:', err)
    return res.status(500).json({ error: 'Memory field disruption' })
  }
}
