import { sanitizeUnicodeScalars } from './text-sanitize.js'
import { shouldRunInternetSearch } from './internet-search-intent.js'

const MAX_RESULTS = 5
const SEARCH_TIMEOUT_MS = 10_000

export type SearchHit = {
  title: string
  url: string
  snippet?: string
}

export type SearchOutcome = {
  provider: string
  query: string
  hits: SearchHit[]
  error?: string
}

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)

  return fetch(url, {
    ...init,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
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
}

function normalizeQuery(text: string): string {
  return sanitizeUnicodeScalars(text)
    .replace(/\s+/g, ' ')
    .replace(/\b(search|search the internet|search the web|web search|internet search|look up|lookup|find online|browse for|google|brave search)\b/i, '')
    .trim()
    .slice(0, 220)
}

function cleanUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, 'https://html.duckduckgo.com')
    const redirectTarget = url.searchParams.get('uddg')
    if (redirectTarget) return decodeURIComponent(redirectTarget)
    return url.toString()
  } catch {
    return rawUrl
  }
}

function shouldKeepHit(hit: SearchHit): boolean {
  if (!hit.title || !hit.url) return false

  try {
    const url = new URL(hit.url)
    return ['http:', 'https:'].includes(url.protocol)
  } catch {
    return false
  }
}

async function searchWithBrave(query: string, apiKey: string): Promise<SearchOutcome> {
  const response = await fetchWithTimeout(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${MAX_RESULTS}`, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 403 || response.status === 422) {
      throw new Error('Brave Search API key is invalid or unauthorized')
    }
    throw new Error(`Brave Search returned HTTP ${response.status}`)
  }

  const data = await response.json() as {
    web?: {
      results?: Array<{ title?: string; url?: string; description?: string }>
    }
  }

  const hits = (data.web?.results ?? [])
    .map((item) => ({
      title: sanitizeUnicodeScalars(item.title ?? '').trim(),
      url: sanitizeUnicodeScalars(item.url ?? '').trim(),
      snippet: sanitizeUnicodeScalars(item.description ?? '').trim(),
    }))
    .filter(shouldKeepHit)
    .slice(0, MAX_RESULTS)

  return { provider: 'Brave Search', query, hits }
}

async function searchWithTavily(query: string, apiKey: string): Promise<SearchOutcome> {
  const response = await fetchWithTimeout('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: MAX_RESULTS,
      include_answer: false,
      include_images: false,
      include_raw_content: false,
    }),
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Tavily API key is invalid or unauthorized')
    }
    throw new Error(`Tavily returned HTTP ${response.status}`)
  }

  const data = await response.json() as {
    results?: Array<{ title?: string; url?: string; content?: string }>
  }

  const hits = (data.results ?? [])
    .map((item) => ({
      title: sanitizeUnicodeScalars(item.title ?? '').trim(),
      url: sanitizeUnicodeScalars(item.url ?? '').trim(),
      snippet: sanitizeUnicodeScalars(item.content ?? '').trim(),
    }))
    .filter(shouldKeepHit)
    .slice(0, MAX_RESULTS)

  return { provider: 'Tavily', query, hits }
}

async function searchWithSerpApi(query: string, apiKey: string): Promise<SearchOutcome> {
  const response = await fetchWithTimeout(`https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(apiKey)}&num=${MAX_RESULTS}`)

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('SerpAPI key is invalid or unauthorized')
    }
    throw new Error(`SerpAPI returned HTTP ${response.status}`)
  }

  const data = await response.json() as {
    organic_results?: Array<{ title?: string; link?: string; snippet?: string }>
  }

  const hits = (data.organic_results ?? [])
    .map((item) => ({
      title: sanitizeUnicodeScalars(item.title ?? '').trim(),
      url: sanitizeUnicodeScalars(item.link ?? '').trim(),
      snippet: sanitizeUnicodeScalars(item.snippet ?? '').trim(),
    }))
    .filter(shouldKeepHit)
    .slice(0, MAX_RESULTS)

  return { provider: 'SerpAPI', query, hits }
}

async function searchWithDuckDuckGo(query: string): Promise<SearchOutcome> {
  const response = await fetchWithTimeout('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `q=${encodeURIComponent(query)}`,
  })

  if (!response.ok) {
    throw new Error(`DuckDuckGo returned HTTP ${response.status}`)
  }

  const html = await response.text()
  const hits: SearchHit[] = []
  const resultPattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/gi

  for (const match of html.matchAll(resultPattern)) {
    const url = cleanUrl(decodeHtmlEntities(match[1] ?? '').trim())
    const title = stripHtml(match[2] ?? '')
    const snippet = stripHtml(match[3] ?? '')
    const hit = { title, url, snippet }
    if (!shouldKeepHit(hit)) continue
    hits.push(hit)
    if (hits.length >= MAX_RESULTS) break
  }

  return { provider: 'DuckDuckGo HTML', query, hits }
}

export async function performWebSearch(query: string): Promise<SearchOutcome> {
  const braveApiKey = process.env.BRAVE_SEARCH_API_KEY
  const tavilyApiKey = process.env.TAVILY_API_KEY
  const serpApiKey = process.env.SERPAPI_API_KEY

  const attempts: Array<() => Promise<SearchOutcome>> = []
  if (braveApiKey) attempts.push(() => searchWithBrave(query, braveApiKey))
  if (tavilyApiKey) attempts.push(() => searchWithTavily(query, tavilyApiKey))
  if (serpApiKey) attempts.push(() => searchWithSerpApi(query, serpApiKey))
  attempts.push(() => searchWithDuckDuckGo(query))

  let lastError = ''

  for (const attempt of attempts) {
    try {
      const outcome = await attempt()
      if (outcome.hits.length) return outcome
      lastError = `No results returned from ${outcome.provider}.`
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Search failed.'
    }
  }

  return {
    provider: 'web search',
    query,
    hits: [],
    error: lastError || 'No search results were available.',
  }
}

export async function buildWebSearchContext(latestUserMessage: string, enabled: boolean): Promise<string> {
  if (!shouldRunInternetSearch(latestUserMessage, enabled)) return ''

  const query = normalizeQuery(latestUserMessage)
  if (!query) return ''

  const outcome = await performWebSearch(query)
  const retrievedAt = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  const resultsBlock = outcome.hits.length
    ? outcome.hits.map((hit, index) => (
        `${index + 1}. ${hit.title}\nURL: ${hit.url}\nSnippet: ${hit.snippet || 'No snippet returned.'}`
      )).join('\n\n')
    : `Search attempt note: ${outcome.error || 'No results were returned.'}`

  return `

WEB SEARCH CONTEXT:
Internet search was used for the latest user message because current or external information seemed relevant.
Search retrieved at: ${retrievedAt}
Query: ${outcome.query}
Provider: ${outcome.provider}
Use these as live web search results, not as timeless memory. If you rely on them, say you searched the web.

${resultsBlock}
`
}
