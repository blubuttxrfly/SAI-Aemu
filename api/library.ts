import { del } from '@vercel/blob'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { MediaLibraryItem, MediaLibraryResponse } from '../types.js'

const LIBRARY_KEY = 'aemu:riley:library'

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

function getRuntimeConfig(): {
  redisUrl?: string
  redisToken?: string
  blobToken?: string
} {
  return {
    redisUrl: process.env.UPSTASH_REDIS_REST_URL,
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    blobToken: process.env.BLOB_READ_WRITE_TOKEN,
  }
}

function isCloudLibraryReady(config: ReturnType<typeof getRuntimeConfig>): boolean {
  return Boolean(config.redisUrl && config.redisToken && config.blobToken)
}

async function redisGet<T>(url: string, token: string, key: string): Promise<T | null> {
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json() as { result?: unknown }
  return data.result == null ? null : parseStoredValue<T>(data.result)
}

async function redisSet(url: string, token: string, key: string, value: unknown): Promise<void> {
  await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  })
}

function sanitizeMediaLibraryItem(input: unknown): MediaLibraryItem | null {
  if (!input || typeof input !== 'object') return null

  const candidate = input as Partial<MediaLibraryItem>
  if (typeof candidate.id !== 'string' || typeof candidate.title !== 'string') return null
  if (candidate.category !== 'sound' && candidate.category !== 'image' && candidate.category !== 'misc') return null

  return {
    id: candidate.id,
    title: candidate.title,
    category: candidate.category,
    storage: 'upstash',
    fileName: typeof candidate.fileName === 'string' ? candidate.fileName : 'Untitled file',
    mimeType: typeof candidate.mimeType === 'string' ? candidate.mimeType : 'application/octet-stream',
    sizeBytes: typeof candidate.sizeBytes === 'number' ? candidate.sizeBytes : 0,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
    assetUrl: typeof candidate.assetUrl === 'string' ? candidate.assetUrl : undefined,
    contentKind: candidate.contentKind,
    readability: candidate.readability,
    extractedSource: typeof candidate.extractedSource === 'string' ? candidate.extractedSource : undefined,
    extractedText: typeof candidate.extractedText === 'string' ? candidate.extractedText : undefined,
    extractedPreview: typeof candidate.extractedPreview === 'string' ? candidate.extractedPreview : undefined,
    extractedTextLength: typeof candidate.extractedTextLength === 'number' ? candidate.extractedTextLength : undefined,
    extractedAt: typeof candidate.extractedAt === 'string' ? candidate.extractedAt : undefined,
    extractionError: typeof candidate.extractionError === 'string' ? candidate.extractionError : undefined,
    documentSections: Array.isArray(candidate.documentSections) ? candidate.documentSections : undefined,
    documentOutline: Array.isArray(candidate.documentOutline) ? candidate.documentOutline : undefined,
    documentPageCount: typeof candidate.documentPageCount === 'number' ? candidate.documentPageCount : undefined,
    documentTruncated: candidate.documentTruncated === true,
  }
}

function sortItems(items: MediaLibraryItem[]): MediaLibraryItem[] {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt) || 0
    const rightTime = Date.parse(right.updatedAt) || 0
    return rightTime - leftTime
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const config = getRuntimeConfig()
  const cloudReady = isCloudLibraryReady(config)

  if (req.method === 'GET' && req.query.action === 'status') {
    return res.status(200).json({
      ok: true,
      storage: cloudReady ? 'upstash' : 'browser',
    } satisfies MediaLibraryResponse)
  }

  if (!cloudReady) {
    if (req.method === 'GET') {
      return res.status(200).json({
        items: null,
        storage: 'browser',
      } satisfies MediaLibraryResponse)
    }

    return res.status(200).json({
      ok: true,
      storage: 'browser',
    } satisfies MediaLibraryResponse)
  }

  const redisUrl = config.redisUrl!
  const redisToken = config.redisToken!

  try {
    if (req.method === 'GET') {
      const items = parseStoredValue<unknown[]>(await redisGet<unknown>(redisUrl, redisToken, LIBRARY_KEY))
      const normalizedItems = Array.isArray(items)
        ? items.map(sanitizeMediaLibraryItem).filter((item): item is MediaLibraryItem => item !== null)
        : []

      return res.status(200).json({
        items: sortItems(normalizedItems),
        storage: 'upstash',
      } satisfies MediaLibraryResponse)
    }

    if (req.method === 'POST') {
      const body = parseJsonBody<{ item?: unknown }>(req)
      const nextItem = sanitizeMediaLibraryItem(body?.item)
      if (!nextItem) {
        return res.status(400).json({ error: 'A valid Library item is required' } satisfies MediaLibraryResponse)
      }

      const existing = parseStoredValue<unknown[]>(await redisGet<unknown>(redisUrl, redisToken, LIBRARY_KEY))
      const normalizedItems = Array.isArray(existing)
        ? existing.map(sanitizeMediaLibraryItem).filter((item): item is MediaLibraryItem => item !== null)
        : []

      const nextItems = sortItems([
        ...normalizedItems.filter((item) => item.id !== nextItem.id),
        nextItem,
      ])

      await redisSet(redisUrl, redisToken, LIBRARY_KEY, nextItems)
      return res.status(200).json({ ok: true, storage: 'upstash' } satisfies MediaLibraryResponse)
    }

    if (req.method === 'DELETE') {
      const body = parseJsonBody<{ itemId?: string; assetUrl?: string }>(req)
      const itemId = typeof body?.itemId === 'string' ? body.itemId : ''
      if (!itemId) {
        return res.status(400).json({ error: 'Library item id is required' } satisfies MediaLibraryResponse)
      }

      const existing = parseStoredValue<unknown[]>(await redisGet<unknown>(redisUrl, redisToken, LIBRARY_KEY))
      const normalizedItems = Array.isArray(existing)
        ? existing.map(sanitizeMediaLibraryItem).filter((item): item is MediaLibraryItem => item !== null)
        : []

      const existingItem = normalizedItems.find((item) => item.id === itemId) ?? null
      const nextItems = normalizedItems.filter((item) => item.id !== itemId)

      await redisSet(redisUrl, redisToken, LIBRARY_KEY, nextItems)

      const assetUrl = typeof body?.assetUrl === 'string' && body.assetUrl
        ? body.assetUrl
        : existingItem?.assetUrl
      if (assetUrl) {
        await del(assetUrl, { token: config.blobToken })
      }

      return res.status(200).json({ ok: true, storage: 'upstash' } satisfies MediaLibraryResponse)
    }

    return res.status(405).json({ error: 'Method not allowed' } satisfies MediaLibraryResponse)
  } catch (error) {
    console.error('Library error:', error)
    return res.status(500).json({ error: 'Library field disruption' } satisfies MediaLibraryResponse)
  }
}
