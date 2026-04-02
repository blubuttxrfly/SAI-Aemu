import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { sanitizeUnicodeScalars } from './text-sanitize.js'

const MAX_LINKS = 3
const MAX_REDIRECTS = 3
const MAX_FETCH_BYTES = 200_000
const MAX_TEXT_CHARS = 12_000
const FETCH_TIMEOUT_MS = 10_000

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi
const SUPPORTED_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'application/json',
  'application/ld+json',
  'application/xml',
  'text/xml',
  'text/markdown',
]

type LinkFetchResult = {
  requestedUrl: string
  finalUrl?: string
  title?: string
  text?: string
  error?: string
}

export function extractWebLinks(text: string): string[] {
  if (!text) return []

  const seen = new Set<string>()
  const urls: string[] = []
  const matches = text.match(URL_RE) ?? []

  for (const match of matches) {
    const cleaned = trimUrlCandidate(match)
    if (!cleaned || seen.has(cleaned)) continue
    seen.add(cleaned)
    urls.push(cleaned)
    if (urls.length >= MAX_LINKS) break
  }

  return urls
}

export async function buildWebLinkContext(text: string): Promise<string> {
  const links = extractWebLinks(sanitizeUnicodeScalars(text))
  if (!links.length) return ''

  const results = await Promise.all(links.map((link) => fetchLinkContent(link)))
  const sections = results.map((result, index) => formatContextSection(result, index + 1))

  return `

WEB LINK CONTEXT:
The latest user message included public web links. Retrieved page material below may be partial, truncated, or unavailable. Use it as bounded reference context rather than as perfect ground truth. If you rely on it, say that you reviewed the linked page.

${sections.join('\n\n')}
`
}

function trimUrlCandidate(candidate: string): string {
  let next = candidate.trim()

  while (/[.,!?]+$/.test(next)) {
    next = next.slice(0, -1)
  }

  while (next.endsWith(')') && countChar(next, ')') > countChar(next, '(')) {
    next = next.slice(0, -1)
  }

  while (next.endsWith(']') && countChar(next, ']') > countChar(next, '[')) {
    next = next.slice(0, -1)
  }

  return next
}

function countChar(value: string, char: string): number {
  return value.split(char).length - 1
}

async function fetchLinkContent(rawUrl: string): Promise<LinkFetchResult> {
  try {
    let current = new URL(rawUrl)

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      await assertSafeRemoteUrl(current)

      const response = await fetchWithTimeout(current.toString(), {
        headers: {
          Accept: 'text/html,text/plain,application/json,text/markdown,application/xml;q=0.9,*/*;q=0.1',
          'User-Agent': 'AemuLinkFetcher/1.0',
        },
        redirect: 'manual',
      })

      if (isRedirect(response.status)) {
        const location = response.headers.get('location')
        if (!location) {
          return {
            requestedUrl: rawUrl,
            finalUrl: current.toString(),
            error: `Redirect ${response.status} without a target location.`,
          }
        }

        current = new URL(location, current)
        continue
      }

      if (!response.ok) {
        return {
          requestedUrl: rawUrl,
          finalUrl: current.toString(),
          error: `Linked page returned HTTP ${response.status}.`,
        }
      }

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
      if (!isSupportedContentType(contentType)) {
        return {
          requestedUrl: rawUrl,
          finalUrl: current.toString(),
          error: `Unsupported content type: ${contentType || 'unknown'}.`,
        }
      }

      const raw = await readResponseText(response)
      const title = extractTitle(raw, contentType)
      const text = normalizeExtractedText(raw, contentType)

      if (!text) {
        return {
          requestedUrl: rawUrl,
          finalUrl: current.toString(),
          title,
          error: 'The linked page did not expose readable text.',
        }
      }

      return {
        requestedUrl: rawUrl,
        finalUrl: current.toString(),
        title,
        text,
      }
    }

    return {
      requestedUrl: rawUrl,
      error: `Too many redirects. Maximum supported redirects: ${MAX_REDIRECTS}.`,
    }
  } catch (error) {
    return {
      requestedUrl: rawUrl,
      error: error instanceof Error ? error.message : 'Unable to retrieve the linked page.',
    }
  }
}

function formatContextSection(result: LinkFetchResult, index: number): string {
  const heading = `Source ${index}: ${result.finalUrl ?? result.requestedUrl}`

  if (result.error) {
    return `${heading}
Status: ${result.error}`
  }

  const titleLine = result.title ? `Title: ${result.title}` : 'Title: unavailable'
  return `${heading}
${titleLine}
Excerpt:
${result.text ?? ''}`
}

async function assertSafeRemoteUrl(url: URL): Promise<void> {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http and https links are supported.')
  }

  if (url.username || url.password) {
    throw new Error('Links with embedded credentials are not allowed.')
  }

  if (url.port && !['80', '443'].includes(url.port)) {
    throw new Error('Only standard web ports are allowed.')
  }

  const hostname = url.hostname.toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === '0.0.0.0'
  ) {
    throw new Error('Local or internal hosts are not allowed.')
  }

  const hostType = isIP(hostname)
  if (hostType) {
    if (!isPublicIp(hostname)) throw new Error('Private or non-public IP addresses are not allowed.')
    return
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length) throw new Error('Could not resolve the linked hostname.')

  if (addresses.some((entry) => !isPublicIp(entry.address))) {
    throw new Error('The linked host resolves to a private or internal address.')
  }
}

function isPublicIp(address: string): boolean {
  if (address.includes(':')) return isPublicIpv6(address)
  return isPublicIpv4(address)
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return false

  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a >= 224) return false

  return true
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase()

  if (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff')
  ) {
    return false
  }

  return true
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400
}

function isSupportedContentType(contentType: string): boolean {
  return SUPPORTED_CONTENT_TYPES.some((type) => contentType.includes(type))
}

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  return fetch(url, {
    ...init,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))
}

async function readResponseText(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    return normalizeText(await response.text())
  }

  const decoder = new TextDecoder()
  let result = ''
  let bytesRead = 0

  while (bytesRead < MAX_FETCH_BYTES) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytesRead += chunk.value.byteLength
    result += decoder.decode(chunk.value, { stream: true })
    if (bytesRead >= MAX_FETCH_BYTES) break
  }

  result += decoder.decode()
  return normalizeText(result)
}

function extractTitle(raw: string, contentType: string): string | undefined {
  if (!raw) return undefined
  if (contentType.includes('html')) {
    const match = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    return match ? normalizeText(decodeHtmlEntities(match[1])) : undefined
  }

  const firstLine = raw.split('\n').map((line) => line.trim()).find(Boolean)
  return firstLine ? firstLine.slice(0, 160) : undefined
}

function normalizeExtractedText(raw: string, contentType: string): string {
  if (!raw) return ''

  if (contentType.includes('html')) {
    return normalizeText(
      decodeHtmlEntities(raw)
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    ).slice(0, MAX_TEXT_CHARS)
  }

  return normalizeText(raw).slice(0, MAX_TEXT_CHARS)
}

function normalizeText(value: string): string {
  return sanitizeUnicodeScalars(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim()
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&apos;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}
