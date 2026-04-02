import { sanitizeUnicodeScalars } from './text-sanitize'

const ATLAS_THREADS_AUTH_STORAGE_KEY = 'aemu:atlas-threads-auth'

export interface AtlasThreadsAuthSession {
  accessToken: string
  userId: string
  username?: string
  tokenType?: string
  scopes?: string[]
  expiresAt: string
  connectedAt: string
  lastRefreshedAt?: string
}

export interface AtlasThreadsAuthRefresh {
  accessToken: string
  tokenType?: string
  expiresAt: string
  lastRefreshedAt?: string
}

export interface AtlasThreadsConnectionStatus {
  oauthReady: boolean
  configured: boolean
  detail: string
}

export interface AtlasThreadsDraftResponse {
  title: string
  content: string
  angle?: string
  rationale?: string
}

export interface AtlasThreadsPublishResponse {
  id?: string
  permalink?: string
  message?: string
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

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function normalizeAtlasThreadsAuthSession(input: unknown): AtlasThreadsAuthSession | null {
  if (!input || typeof input !== 'object') return null

  const candidate = input as Partial<AtlasThreadsAuthSession>
  if (typeof candidate.accessToken !== 'string' || typeof candidate.userId !== 'string' || typeof candidate.expiresAt !== 'string') {
    return null
  }

  return {
    accessToken: candidate.accessToken,
    userId: candidate.userId,
    username: typeof candidate.username === 'string' ? candidate.username : undefined,
    tokenType: typeof candidate.tokenType === 'string' ? candidate.tokenType : undefined,
    scopes: Array.isArray(candidate.scopes) ? candidate.scopes.filter((scope): scope is string => typeof scope === 'string') : undefined,
    expiresAt: candidate.expiresAt,
    connectedAt: typeof candidate.connectedAt === 'string' ? candidate.connectedAt : new Date().toISOString(),
    lastRefreshedAt: typeof candidate.lastRefreshedAt === 'string' ? candidate.lastRefreshedAt : undefined,
  }
}

export async function fetchAtlasThreadsStatus(): Promise<AtlasThreadsConnectionStatus> {
  const res = await fetch('/api/threads-auth?action=status')
  const data = await parseApiJson<{ oauthReady?: boolean; configured?: boolean; detail?: string; error?: string }>(res, '/api/threads-auth?action=status')

  if (!res.ok || data.error) {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }

  return {
    oauthReady: data.oauthReady === true,
    configured: data.configured === true,
    detail: typeof data.detail === 'string' ? data.detail : 'Threads publishing status unavailable.',
  }
}

export function loadAtlasThreadsAuthSession(): AtlasThreadsAuthSession | null {
  const storage = getStorage()
  if (!storage) return null

  try {
    const raw = storage.getItem(ATLAS_THREADS_AUTH_STORAGE_KEY)
    if (!raw) return null
    return normalizeAtlasThreadsAuthSession(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveAtlasThreadsAuthSession(session: AtlasThreadsAuthSession): void {
  const storage = getStorage()
  if (!storage) return

  try {
    storage.setItem(ATLAS_THREADS_AUTH_STORAGE_KEY, JSON.stringify(session))
  } catch {
    console.warn('Unable to persist Threads auth session')
  }
}

export function clearAtlasThreadsAuthSession(): void {
  const storage = getStorage()
  if (!storage) return

  try {
    storage.removeItem(ATLAS_THREADS_AUTH_STORAGE_KEY)
  } catch {
    console.warn('Unable to clear Threads auth session')
  }
}

export async function startAtlasThreadsOAuth(): Promise<{ authUrl: string }> {
  const res = await fetch('/api/threads-auth?action=start')
  const data = await parseApiJson<{ authUrl?: string; error?: string }>(res, '/api/threads-auth?action=start')

  if (!res.ok || data.error || typeof data.authUrl !== 'string') {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }

  return {
    authUrl: data.authUrl,
  }
}

export async function refreshAtlasThreadsAuthSession(auth: AtlasThreadsAuthSession): Promise<AtlasThreadsAuthRefresh> {
  const res = await fetch('/api/threads-auth?action=refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessToken: auth.accessToken,
    }),
  })
  const data = await parseApiJson<{ session?: AtlasThreadsAuthRefresh; error?: string }>(res, '/api/threads-auth?action=refresh')

  if (!res.ok || data.error || !data.session) {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }

  return data.session
}

export async function draftAtlasThreadsPost(input: {
  folderName: string
  folderDescription: string
  sourceTitle: string
  sourceSummary: string
  sourceContent: string
  prompt: string
  angle: string
  existingContent?: string
}): Promise<AtlasThreadsDraftResponse> {
  const res = await fetch('/api/atlas-threads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'draft',
      folderName: sanitizeUnicodeScalars(input.folderName),
      folderDescription: sanitizeUnicodeScalars(input.folderDescription),
      sourceTitle: sanitizeUnicodeScalars(input.sourceTitle),
      sourceSummary: sanitizeUnicodeScalars(input.sourceSummary),
      sourceContent: sanitizeUnicodeScalars(input.sourceContent),
      prompt: sanitizeUnicodeScalars(input.prompt),
      angle: sanitizeUnicodeScalars(input.angle),
      existingContent: sanitizeUnicodeScalars(input.existingContent ?? ''),
    }),
  })

  const data = await parseApiJson<AtlasThreadsDraftResponse & { error?: string }>(res, '/api/atlas-threads')

  if (!res.ok || data.error) {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }

  return {
    title: typeof data.title === 'string' ? data.title : 'Threads draft',
    content: typeof data.content === 'string' ? data.content : '',
    angle: typeof data.angle === 'string' ? data.angle : undefined,
    rationale: typeof data.rationale === 'string' ? data.rationale : undefined,
  }
}

export async function publishAtlasThreadsPost(content: string, accessToken?: string): Promise<AtlasThreadsPublishResponse> {
  const res = await fetch('/api/atlas-threads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'publish',
      content: sanitizeUnicodeScalars(content),
      accessToken: sanitizeUnicodeScalars(accessToken ?? ''),
    }),
  })

  const data = await parseApiJson<AtlasThreadsPublishResponse & { error?: string }>(res, '/api/atlas-threads')

  if (!res.ok || data.error) {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }

  return data
}
