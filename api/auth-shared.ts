import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'aemu_session'
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30

function readHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

function safeDecode(value: string): string {
  if (!value) return ''

  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function getCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null

  const cookies = cookieHeader.split(';')
  for (const entry of cookies) {
    const [rawName, ...rawValue] = entry.trim().split('=')
    if (rawName === name) return rawValue.join('=')
  }

  return null
}

export function isSecureRequest(req: VercelRequest): boolean {
  const forwardedProto = req.headers['x-forwarded-proto']

  if (Array.isArray(forwardedProto)) {
    return forwardedProto.some((value) => value.split(',').map((item) => item.trim()).includes('https'))
  }

  return typeof forwardedProto === 'string'
    ? forwardedProto.split(',').map((item) => item.trim()).includes('https')
    : false
}

function safeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function createSessionToken(secret: string): string {
  const payload = {
    sub: 'riley',
    exp: Date.now() + SESSION_DURATION_SECONDS * 1000,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url')
  return `${encodedPayload}.${signature}`
}

export function isSessionValid(token: string | null, secret: string): boolean {
  if (!token) return false

  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return false

  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest('base64url')
  if (!safeEqualText(signature, expectedSignature)) return false

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as { sub?: string; exp?: number }
    return payload.sub === 'riley' && typeof payload.exp === 'number' && payload.exp > Date.now()
  } catch {
    return false
  }
}

export function setSessionCookie(req: VercelRequest, res: VercelResponse, secret: string): void {
  const token = createSessionToken(secret)
  const secure = isSecureRequest(req) ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DURATION_SECONDS}; Priority=High${secure}`,
  )
}

export function clearSessionCookie(req: VercelRequest, res: VercelResponse): void {
  const secure = isSecureRequest(req) ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Priority=High${secure}`,
  )
}

export function applySecurityHeaders(res: VercelResponse): void {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.setHeader('Vary', 'Cookie')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(self), payment=(), usb=()')
}

export function getClientIp(req: VercelRequest): string {
  const forwardedFor = readHeaderValue(req.headers['x-forwarded-for'])
  const vercelForwardedFor = readHeaderValue(req.headers['x-vercel-forwarded-for'])
  const realIp = readHeaderValue(req.headers['x-real-ip'])
  const direct = forwardedFor || vercelForwardedFor || realIp

  const first = direct
    .split(',')
    .map((item) => item.trim())
    .find(Boolean)

  return (first || 'unknown').slice(0, 120)
}

export function getGeoLocationSummary(req: VercelRequest): string {
  const city = safeDecode(readHeaderValue(req.headers['x-vercel-ip-city'])).trim()
  const region = safeDecode(readHeaderValue(req.headers['x-vercel-ip-country-region'])).trim()
  const country = safeDecode(readHeaderValue(req.headers['x-vercel-ip-country'])).trim()
  const latitude = safeDecode(readHeaderValue(req.headers['x-vercel-ip-latitude'])).trim()
  const longitude = safeDecode(readHeaderValue(req.headers['x-vercel-ip-longitude'])).trim()

  const parts = [city, region, country].filter(Boolean)
  if (!parts.length && (!latitude || !longitude)) return 'Unknown location'

  const coordinates = latitude && longitude ? ` (${latitude}, ${longitude})` : ''
  return `${parts.join(', ') || 'Approximate location'}${coordinates}`.slice(0, 240)
}

export function getUserAgent(req: VercelRequest): string | undefined {
  const userAgent = readHeaderValue(req.headers['user-agent']).trim()
  return userAgent ? userAgent.slice(0, 240) : undefined
}

export function getInternalApiSecret(): string {
  return (process.env.AEMU_INTERNAL_API_SECRET ?? process.env.AEMU_SESSION_SECRET ?? '').trim()
}

export async function requireAuthenticatedRequest(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const sessionSecret = (process.env.AEMU_SESSION_SECRET ?? '').trim()
  if (!sessionSecret) {
    res.status(503).json({ error: 'AEMU_SESSION_SECRET is missing.' })
    return false
  }

  const token = getCookie(req.headers.cookie, SESSION_COOKIE)
  if (!isSessionValid(token, sessionSecret)) {
    clearSessionCookie(req, res)
    res.status(401).json({ error: 'Authentication required.' })
    return false
  }

  return true
}
