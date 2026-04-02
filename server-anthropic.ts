type AnthropicMessageBody = {
  model: string
  max_tokens: number
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

type AnthropicResponsePayload = {
  type?: string
  error?: { message?: string }
  content?: Array<{ text?: string }>
}

type AnthropicError = Error & {
  status?: number
  retryable?: boolean
  raw?: string
}

const RETRY_DELAYS_MS = [500, 1400]

function createError(message: string, status?: number, retryable = false, raw?: string): AnthropicError {
  const error = new Error(message) as AnthropicError
  error.status = status
  error.retryable = retryable
  error.raw = raw
  return error
}

function parseJsonText<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)

    const onAbort = () => {
      cleanup()
      const error = new Error('Aborted')
      error.name = 'AbortError'
      reject(error)
    }

    const cleanup = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    }

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function shouldRetry(status: number, detail: string): boolean {
  if ([429, 500, 502, 503, 504, 529].includes(status)) return true
  return /overload|overloaded|rate limit|capacity|temporar/i.test(detail)
}

export async function requestAnthropicMessage(input: {
  apiKey: string
  body: AnthropicMessageBody
  timeoutMs: number
  maxAttempts?: number
}): Promise<string> {
  const { apiKey, body, timeoutMs, maxAttempts = RETRY_DELAYS_MS.length + 1 } = input
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        const raw = await response.text()
        const data = parseJsonText<AnthropicResponsePayload>(raw)

        if (response.ok) {
          const reply = data?.content?.[0]?.text
          if (!reply) {
            throw createError('Anthropic returned an unexpected response', 500, false, raw)
          }
          return reply
        }

        const detail = data?.error?.message ?? (raw.slice(0, 300) || 'Anthropic request failed')
        const isAuthFailure = response.status === 401 || /invalid x-api-key|authentication_error/i.test(detail)
        const retryable = shouldRetry(response.status, detail)

        if (isAuthFailure) {
          throw createError('ANTHROPIC_API_KEY is invalid or expired in the active environment.', 401, false, raw)
        }

        if (retryable && attempt < maxAttempts) {
          await sleep(RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)] ?? 1500, controller.signal)
          continue
        }

        if (retryable) {
          throw createError('Anthropic is temporarily overloaded. Please try again in a moment.', 503, true, raw)
        }

        throw createError(detail, response.status, false, raw)
      } catch (error) {
        if (isAbortError(error)) throw error
        if (error instanceof Error && (error as AnthropicError).retryable && attempt < maxAttempts) {
          await sleep(RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)] ?? 1500, controller.signal)
          continue
        }
        throw error
      }
    }

    throw createError('Anthropic is temporarily unavailable. Please try again in a moment.', 503, true)
  } finally {
    clearTimeout(timeout)
  }
}
