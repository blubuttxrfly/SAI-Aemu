import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const AUTH_KEY = 'aemu:riley:auth:password'
const SESSION_COOKIE = 'aemu_session'
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30

type StoredAuthRecord = {
  salt: string
  hash: string
  hint: string
  updatedAt: string
}

type AuthBody = {
  action?: string
  password?: string
  hint?: string
  setupKey?: string
}

type AuthStatus = {
  configured: boolean
  authenticated: boolean
  hint?: string
  storageReady: boolean
  error?: string
}

type RuntimeConfig = {
  redisUrl: string
  redisToken: string
  sessionSecret: string
  pepper: string
}

type SetupRuntimeConfig = RuntimeConfig & {
  setupKey: string
}

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

function normalizeStoredAuthRecord(input: unknown): StoredAuthRecord | null {
  const record = parseStoredValue<unknown>(input)
  if (!record || typeof record !== 'object') return null

  const candidate = record as Partial<StoredAuthRecord>
  if (typeof candidate.salt !== 'string' || typeof candidate.hash !== 'string') return null

  return {
    salt: candidate.salt,
    hash: candidate.hash,
    hint: typeof candidate.hint === 'string' ? candidate.hint : '',
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
  }
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

function getRuntimeConfig(options?: { requireSetupKey?: boolean }): { config?: RuntimeConfig; error?: string } {
  const redisUrl = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? '').replace(/\/$/, '')
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
  const sessionSecret = process.env.AEMU_SESSION_SECRET
  const pepper = process.env.AEMU_PASSWORD_PEPPER ?? ''

  if (!redisUrl || !redisToken) {
    return { error: 'Upstash Redis is not configured.' }
  }

  if (!sessionSecret) {
    return { error: 'AEMU_SESSION_SECRET is missing.' }
  }

  if (options?.requireSetupKey && !process.env.AEMU_ADMIN_SETUP_KEY) {
    return { error: 'AEMU_ADMIN_SETUP_KEY is missing.' }
  }

  return {
    config: {
      redisUrl,
      redisToken,
      sessionSecret,
      pepper,
    },
  }
}

async function redisGet<T>(config: RuntimeConfig, key: string): Promise<T | null> {
  const response = await fetch(`${config.redisUrl}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${config.redisToken}` },
  })

  if (!response.ok) {
    throw new Error(`Redis get failed with ${response.status}`)
  }

  const data = await response.json() as { result?: unknown }
  const result = data.result
  if (result == null) return null
  return parseStoredValue<T>(result)
}

async function redisSet(config: RuntimeConfig, key: string, value: unknown): Promise<void> {
  const response = await fetch(`${config.redisUrl}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.redisToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  })

  if (!response.ok) {
    throw new Error(`Redis set failed with ${response.status}`)
  }
}

function getCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null

  const cookies = cookieHeader.split(';')
  for (const entry of cookies) {
    const [rawName, ...rawValue] = entry.trim().split('=')
    if (rawName === name) return rawValue.join('=')
  }

  return null
}

function hashPassword(password: string, salt: string, pepper: string): string {
  return scryptSync(`${password}:${pepper}`, salt, 64).toString('hex')
}

function passwordMatches(password: string, record: StoredAuthRecord, pepper: string): boolean {
  const variants = password === password.trim() ? [password] : [password, password.trim()]

  return variants.some((candidate) => safeEqualHex(hashPassword(candidate, record.salt, pepper), record.hash))
}

function safeEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')

  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function createSessionToken(secret: string): string {
  const payload = {
    sub: 'riley',
    exp: Date.now() + SESSION_DURATION_SECONDS * 1000,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url')
  return `${encodedPayload}.${signature}`
}

function isSessionValid(token: string | null, secret: string): boolean {
  if (!token) return false

  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return false

  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest('base64url')
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (signatureBuffer.length !== expectedBuffer.length) return false
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return false

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as { sub?: string; exp?: number }
    return payload.sub === 'riley' && typeof payload.exp === 'number' && payload.exp > Date.now()
  } catch {
    return false
  }
}

function isSecureRequest(req: VercelRequest): boolean {
  const forwardedProto = req.headers['x-forwarded-proto']

  if (Array.isArray(forwardedProto)) {
    return forwardedProto.some((value) => value.split(',').map((item) => item.trim()).includes('https'))
  }

  return typeof forwardedProto === 'string'
    ? forwardedProto.split(',').map((item) => item.trim()).includes('https')
    : false
}

function setSessionCookie(req: VercelRequest, res: VercelResponse, secret: string): void {
  const token = createSessionToken(secret)
  const secure = isSecureRequest(req) ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DURATION_SECONDS}${secure}`,
  )
}

function clearSessionCookie(req: VercelRequest, res: VercelResponse): void {
  const secure = isSecureRequest(req) ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`,
  )
}

async function readStatus(req: VercelRequest): Promise<AuthStatus> {
  const runtime = getRuntimeConfig()
  if (!runtime.config) {
    return {
      configured: false,
      authenticated: false,
      storageReady: false,
      error: runtime.error,
    }
  }

  const rawRecord = await redisGet<unknown>(runtime.config, AUTH_KEY)
  const record = normalizeStoredAuthRecord(rawRecord)
  const token = getCookie(req.headers.cookie, SESSION_COOKIE)

  return {
    configured: Boolean(record),
    authenticated: Boolean(record) && isSessionValid(token, runtime.config.sessionSecret),
    hint: record?.hint || undefined,
    storageReady: true,
  }
}

async function handleSetup(req: VercelRequest, res: VercelResponse, body: AuthBody): Promise<void> {
  const runtime = getRuntimeConfig({ requireSetupKey: true })
  if (!runtime.config) {
    res.status(503).json({ error: runtime.error })
    return
  }
  const setupConfig = runtime.config as SetupRuntimeConfig

  const existing = normalizeStoredAuthRecord(await redisGet<unknown>(setupConfig, AUTH_KEY))
  if (existing) {
    res.status(409).json({ error: 'Password already configured. Use the shared password to unlock Aemu.' })
    return
  }

  const password = body.password ?? ''
  const hint = body.hint?.trim() ?? ''
  const setupKey = body.setupKey?.trim() ?? ''

  if (password.length < 4 || !password.trim()) {
    res.status(400).json({ error: 'Use at least 4 characters for the password.' })
    return
  }

  if (setupKey !== process.env.AEMU_ADMIN_SETUP_KEY) {
    res.status(401).json({ error: 'The setup key does not match the Vercel configuration.' })
    return
  }

  const salt = randomBytes(16).toString('hex')
  const hash = hashPassword(password, salt, setupConfig.pepper)

  await redisSet(setupConfig, AUTH_KEY, {
    salt,
    hash,
    hint,
    updatedAt: new Date().toISOString(),
  } satisfies StoredAuthRecord)

  setSessionCookie(req, res, setupConfig.sessionSecret)
  res.status(200).json({ ok: true })
}

async function handleLogin(req: VercelRequest, res: VercelResponse, body: AuthBody): Promise<void> {
  const runtime = getRuntimeConfig()
  if (!runtime.config) {
    res.status(503).json({ error: runtime.error })
    return
  }

  const record = normalizeStoredAuthRecord(await redisGet<unknown>(runtime.config, AUTH_KEY))
  if (!record) {
    res.status(404).json({ error: 'Password has not been configured yet.' })
    return
  }

  const password = body.password ?? ''
  if (!password.trim()) {
    res.status(400).json({ error: 'Enter the password first.' })
    return
  }

  if (!passwordMatches(password, record, runtime.config.pepper)) {
    clearSessionCookie(req, res)
    res.status(401).json({ error: 'That password is not correct.' })
    return
  }

  setSessionCookie(req, res, runtime.config.sessionSecret)
  res.status(200).json({ ok: true })
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.setHeader('Vary', 'Cookie')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  try {
    if (req.method === 'GET') {
      if (req.query.action !== 'status') {
        res.status(400).json({ error: 'Unknown auth action.' })
        return
      }

      const status = await readStatus(req)
      res.status(200).json(status)
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' })
      return
    }

    const body = parseJsonBody<AuthBody>(req)
    const action = body?.action

    if (action === 'setup') {
      await handleSetup(req, res, body ?? {})
      return
    }

    if (action === 'login') {
      await handleLogin(req, res, body ?? {})
      return
    }

    res.status(400).json({ error: 'Unknown auth action.' })
  } catch (error) {
    console.error('Auth error:', error)
    res.status(500).json({ error: 'Aemu could not verify the password right now.' })
  }
}
