import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomBytes } from 'node:crypto'

const THREADS_OAUTH_HOST = 'https://threads.net/oauth/authorize'
const THREADS_GRAPH_HOST = 'https://graph.threads.net'
const THREADS_GRAPH_API_HOST = 'https://graph.threads.net/v1.0'
const OAUTH_STATE_COOKIE = 'aemu_threads_oauth_state'
const OAUTH_STATE_TTL_SECONDS = 60 * 10

type ThreadsAuthConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
}

type ThreadsTokenResponse = {
  access_token?: string
  token_type?: string
  expires_in?: number
  error?: unknown
  error_message?: string
  message?: string
}

type ThreadsAuthSessionResponse = {
  accessToken: string
  userId: string
  username?: string
  tokenType?: string
  scopes?: string[]
  expiresAt: string
  connectedAt: string
  lastRefreshedAt?: string
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

function readConfig(): { config?: ThreadsAuthConfig; detail: string; oauthReady: boolean } {
  const clientId = (process.env.THREADS_CLIENT_ID ?? '').trim()
  const clientSecret = (process.env.THREADS_CLIENT_SECRET ?? '').trim()
  const redirectUri = (process.env.THREADS_REDIRECT_URI ?? '').trim()

  if (!clientId || !clientSecret || !redirectUri) {
    return {
      oauthReady: false,
      detail: 'Threads OAuth is not fully configured yet. Set THREADS_CLIENT_ID, THREADS_CLIENT_SECRET, and THREADS_REDIRECT_URI in the app environment.',
    }
  }

  return {
    oauthReady: true,
    detail: 'Threads OAuth is ready. Connect your account to draft and publish from this workspace.',
    config: {
      clientId,
      clientSecret,
      redirectUri,
    },
  }
}

function getCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null

  for (const segment of cookieHeader.split(';')) {
    const [rawName, ...value] = segment.trim().split('=')
    if (rawName === name) return value.join('=')
  }

  return null
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

function setCookie(req: VercelRequest, res: VercelResponse, name: string, value: string, maxAgeSeconds: number): void {
  const secure = isSecureRequest(req) ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`)
}

function clearCookie(req: VercelRequest, res: VercelResponse, name: string): void {
  const secure = isSecureRequest(req) ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`)
}

function buildAuthUrl(config: ThreadsAuthConfig, state: string): string {
  const url = new URL(THREADS_OAUTH_HOST)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'threads_basic,threads_content_publish')
  url.searchParams.set('state', state)
  return url.toString()
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text()
  if (!raw) return {}

  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { error: raw.slice(0, 240) }
  }
}

function extractToken(data: Record<string, unknown>): ThreadsTokenResponse {
  return {
    access_token: typeof data.access_token === 'string' ? data.access_token : undefined,
    token_type: typeof data.token_type === 'string' ? data.token_type : undefined,
    expires_in: typeof data.expires_in === 'number' ? data.expires_in : undefined,
    error: data.error,
    error_message: typeof data.error_message === 'string'
      ? data.error_message
      : typeof data.message === 'string'
        ? data.message
        : undefined,
  }
}

function buildExpiresAt(expiresInSeconds: number | undefined): string {
  const seconds = typeof expiresInSeconds === 'number' && Number.isFinite(expiresInSeconds) ? expiresInSeconds : 60 * 60
  return new Date(Date.now() + seconds * 1000).toISOString()
}

async function fetchThreadsProfile(accessToken: string): Promise<{ userId: string; username?: string }> {
  const profileUrl = new URL(`${THREADS_GRAPH_API_HOST}/me`)
  profileUrl.searchParams.set('fields', 'id,username')
  profileUrl.searchParams.set('access_token', accessToken)

  const res = await fetch(profileUrl)
  const data = await readJson(res)
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Unable to read Threads profile')
  }

  return {
    userId: typeof data.id === 'string' ? data.id : '',
    username: typeof data.username === 'string' ? data.username : undefined,
  }
}

async function exchangeCodeForLongLivedSession(config: ThreadsAuthConfig, code: string): Promise<ThreadsAuthSessionResponse> {
  const shortParams = new URLSearchParams()
  shortParams.set('client_id', config.clientId)
  shortParams.set('client_secret', config.clientSecret)
  shortParams.set('grant_type', 'authorization_code')
  shortParams.set('redirect_uri', config.redirectUri)
  shortParams.set('code', code)

  const shortRes = await fetch(`${THREADS_GRAPH_HOST}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: shortParams.toString(),
  })
  const shortData = extractToken(await readJson(shortRes))
  if (!shortRes.ok || !shortData.access_token) {
    throw new Error(shortData.error_message ?? 'Threads code exchange failed')
  }

  const exchangeUrl = new URL(`${THREADS_GRAPH_HOST}/access_token`)
  exchangeUrl.searchParams.set('grant_type', 'th_exchange_token')
  exchangeUrl.searchParams.set('client_secret', config.clientSecret)
  exchangeUrl.searchParams.set('access_token', shortData.access_token)

  const longRes = await fetch(exchangeUrl)
  const longData = extractToken(await readJson(longRes))

  const accessToken = longData.access_token ?? shortData.access_token
  const tokenType = longData.token_type ?? shortData.token_type
  const expiresAt = buildExpiresAt(longData.expires_in ?? shortData.expires_in)
  const profile = await fetchThreadsProfile(accessToken)

  return {
    accessToken,
    userId: profile.userId,
    username: profile.username,
    tokenType,
    scopes: ['threads_basic', 'threads_content_publish'],
    expiresAt,
    connectedAt: new Date().toISOString(),
    lastRefreshedAt: longData.access_token ? new Date().toISOString() : undefined,
  }
}

async function refreshLongLivedSession(accessToken: string): Promise<Pick<ThreadsAuthSessionResponse, 'accessToken' | 'tokenType' | 'expiresAt' | 'lastRefreshedAt'>> {
  const refreshUrl = new URL(`${THREADS_GRAPH_HOST}/refresh_access_token`)
  refreshUrl.searchParams.set('grant_type', 'th_refresh_token')
  refreshUrl.searchParams.set('access_token', accessToken)

  const res = await fetch(refreshUrl)
  const data = extractToken(await readJson(res))
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_message ?? 'Threads token refresh failed')
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
    expiresAt: buildExpiresAt(data.expires_in),
    lastRefreshedAt: new Date().toISOString(),
  }
}

function renderPopupResult(config: ThreadsAuthConfig, payload: Record<string, unknown>): string {
  const origin = new URL(config.redirectUri).origin
  const serialized = JSON.stringify(payload).replace(/</g, '\\u003c')

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Threads Connection</title>
    <style>
      body { font-family: sans-serif; background: #061116; color: #edf7f4; display: grid; place-items: center; min-height: 100vh; margin: 0; }
      .card { max-width: 28rem; padding: 1.5rem; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); background: rgba(10,24,28,0.92); text-align: center; }
      p { line-height: 1.5; color: rgba(237,247,244,0.78); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Threads Connection</h1>
      <p>You can close this window if it does not close automatically.</p>
    </div>
    <script>
      const payload = ${serialized};
      if (window.opener) {
        window.opener.postMessage(payload, ${JSON.stringify(origin)});
      }
      window.setTimeout(() => window.close(), 120);
    </script>
  </body>
</html>`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = typeof req.query.action === 'string' ? req.query.action : ''
  const { config, oauthReady, detail } = readConfig()

  if (req.method === 'GET' && action === 'status') {
    return res.status(200).json({
      oauthReady,
      configured: false,
      detail,
    })
  }

  if (!config) {
    return res.status(503).json({ error: detail })
  }

  if (req.method === 'GET' && action === 'start') {
    const state = randomBytes(24).toString('hex')
    setCookie(req, res, OAUTH_STATE_COOKIE, state, OAUTH_STATE_TTL_SECONDS)
    return res.status(200).json({
      authUrl: buildAuthUrl(config, state),
    })
  }

  if (req.method === 'GET' && action === 'callback') {
    const error = typeof req.query.error === 'string' ? req.query.error : ''
    const errorDescription = typeof req.query.error_description === 'string' ? req.query.error_description : ''
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    const state = typeof req.query.state === 'string' ? req.query.state : ''
    const expectedState = getCookie(req.headers.cookie, OAUTH_STATE_COOKIE)
    clearCookie(req, res, OAUTH_STATE_COOKIE)

    if (error) {
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.end(renderPopupResult(config, {
        source: 'aemu-threads-oauth',
        success: false,
        error: errorDescription || error,
      }))
    }

    if (!code || !state || !expectedState || state !== expectedState) {
      res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.end(renderPopupResult(config, {
        source: 'aemu-threads-oauth',
        success: false,
        error: 'Threads OAuth state did not validate. Please try connecting again.',
      }))
    }

    try {
      const session = await exchangeCodeForLongLivedSession(config, code)
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.end(renderPopupResult(config, {
        source: 'aemu-threads-oauth',
        success: true,
        session,
      }))
    } catch (oauthError) {
      const message = oauthError instanceof Error ? oauthError.message : 'Threads OAuth exchange failed'
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.end(renderPopupResult(config, {
        source: 'aemu-threads-oauth',
        success: false,
        error: message,
      }))
    }
  }

  if (req.method === 'POST' && action === 'refresh') {
    const body = parseJsonBody<{ accessToken?: string }>(req)
    if (!body?.accessToken) {
      return res.status(400).json({ error: 'accessToken is required' })
    }

    try {
      const refreshed = await refreshLongLivedSession(body.accessToken)
      return res.status(200).json({
        session: refreshed,
      })
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : 'Threads token refresh failed'
      return res.status(400).json({ error: message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
