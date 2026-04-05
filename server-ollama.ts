/**
 * server-ollama.ts
 *
 * Local LLM transport layer for SAI Aemu using Ollama.
 * Ollama exposes an OpenAI-compatible REST API at http://localhost:11434
 * (or a configurable OLLAMA_HOST), so this module mirrors the interface
 * of server-anthropic.ts exactly — the rest of the app sees no difference.
 *
 * Recommended models (set via OLLAMA_MODEL env var):
 *   phi3.5          — 3.8B, fast, excellent reasoning, ~2.2 GB RAM
 *   llama3.2:3b     — 3B, very fast, good for conversation, ~2 GB RAM
 *   llama3.1:8b     — 8B, higher quality, ~5 GB RAM (recommended if available)
 *   gemma2:2b       — 2B, extremely fast, ~1.5 GB RAM
 *
 * Pull a model first:  ollama pull phi3.5
 * Start Ollama:        ollama serve
 */

type OllamaMessageBody = {
  model: string
  max_tokens: number
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

type OpenAICompatibleResponse = {
  choices?: Array<{
    message?: { content?: string }
    finish_reason?: string
  }>
  error?: { message?: string }
}

type OllamaError = Error & {
  status?: number
  retryable?: boolean
}

const DEFAULT_OLLAMA_HOST = 'http://localhost:11434'
const DEFAULT_OLLAMA_MODEL = 'phi3.5'

function createError(message: string, status?: number, retryable = false): OllamaError {
  const error = new Error(message) as OllamaError
  error.status = status
  error.retryable = retryable
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

/**
 * Check whether an Ollama server is reachable at the given host.
 * Returns true if the /api/tags endpoint responds with HTTP 200.
 */
export async function isOllamaReachable(host: string = DEFAULT_OLLAMA_HOST): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const response = await fetch(`${host}/api/tags`, { signal: controller.signal })
    clearTimeout(timeout)
    return response.ok
  } catch {
    return false
  }
}

/**
 * Send a message to the local Ollama server using its OpenAI-compatible
 * /v1/chat/completions endpoint. Returns the assistant's text reply.
 *
 * This function is a drop-in replacement for requestAnthropicMessage —
 * it accepts the same body shape and returns the same Promise<string>.
 */
export async function requestOllamaMessage(input: {
  body: OllamaMessageBody
  timeoutMs: number
  host?: string
  model?: string
}): Promise<string> {
  const {
    body,
    timeoutMs,
    host = process.env.OLLAMA_HOST ?? DEFAULT_OLLAMA_HOST,
    model = process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL,
  } = input

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  // Build an OpenAI-compatible messages array.
  // Ollama's /v1/chat/completions accepts system as a top-level message
  // with role "system", which is the standard OpenAI format.
  const openAIMessages: Array<{ role: string; content: string }> = [
    { role: 'system', content: body.system },
    ...body.messages,
  ]

  const requestBody = {
    model,
    messages: openAIMessages,
    max_tokens: body.max_tokens,
    stream: false,
  }

  try {
    let response: Response
    try {
      response = await fetch(`${host}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })
    } catch (fetchError) {
      if (isAbortError(fetchError)) throw fetchError

      // Connection refused or network error — Ollama is not running
      throw createError(
        `Ollama is not reachable at ${host}. Make sure Ollama is installed and running: ollama serve`,
        503,
        false,
      )
    }

    const raw = await response.text()
    const data = parseJsonText<OpenAICompatibleResponse>(raw)

    if (response.ok) {
      const reply = data?.choices?.[0]?.message?.content
      if (!reply) {
        throw createError(
          `Ollama returned an unexpected response. Model "${model}" may not be pulled yet. Run: ollama pull ${model}`,
          500,
          false,
        )
      }
      return reply
    }

    // Handle error responses
    const detail = data?.error?.message ?? (raw.slice(0, 300) || 'Ollama request failed')

    if (response.status === 404) {
      throw createError(
        `Ollama model "${model}" not found. Pull it first: ollama pull ${model}`,
        404,
        false,
      )
    }

    throw createError(detail, response.status, false)
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Fetch list of available models from Ollama.
 * Returns array of model names or empty array if unreachable.
 */
export async function listOllamaModels(host: string = DEFAULT_OLLAMA_HOST): Promise<string[]> {
  try {
    const response = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return []
    const data = await response.json() as { models?: Array<{ name: string }> }
    return data.models?.map(m => m.name) ?? []
  } catch {
    return []
  }
}
