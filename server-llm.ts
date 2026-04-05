/**
 * server-llm.ts
 *
 * Unified LLM routing layer for SAI Aemu.
 *
 * This module is the single point of dispatch for all language generation
 * requests. It reads the LLM_BACKEND environment variable and routes to
 * the appropriate backend. All API routes should import from here rather
 * than importing server-anthropic or server-ollama directly.
 *
 * Backend hierarchy (in order of preference for local-first operation):
 *   1. ollama   — Local Ollama server (fully offline, no API key needed)
 *   2. anthropic — Anthropic Claude API (cloud, requires ANTHROPIC_API_KEY)
 *   3. auto     — Try Ollama first; fall back to Anthropic if unreachable
 *
 * Environment variables:
 *   LLM_BACKEND   = "ollama" | "anthropic" | "auto"  (default: "auto")
 *   OLLAMA_HOST   = Ollama server URL                 (default: http://localhost:11434)
 *   OLLAMA_MODEL  = Model name to use                 (default: phi3.5)
 *   ANTHROPIC_API_KEY = Anthropic API key             (required only for anthropic/auto)
 */

import { requestAnthropicMessage } from './server-anthropic.js'
import { requestOllamaMessage, isOllamaReachable } from './server-ollama.js'

export type LLMMessageBody = {
  model?: string
  max_tokens: number
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export type LLMBackend = 'ollama' | 'anthropic' | 'auto'

/**
 * Returns the configured LLM backend from environment.
 * Defaults to "auto" which tries Ollama first, then Anthropic.
 */
export function getConfiguredBackend(): LLMBackend {
  const raw = (process.env.LLM_BACKEND ?? 'auto').toLowerCase().trim()
  if (raw === 'ollama' || raw === 'anthropic' || raw === 'auto') return raw
  return 'auto'
}

/**
 * Returns the active backend name for display/logging purposes.
 * In "auto" mode, this resolves to the backend that will actually be used.
 */
export async function resolveActiveBackend(): Promise<'ollama' | 'anthropic'> {
  const configured = getConfiguredBackend()
  if (configured === 'ollama') return 'ollama'
  if (configured === 'anthropic') return 'anthropic'

  // auto mode: prefer Ollama if reachable
  const ollamaHost = process.env.OLLAMA_HOST ?? 'http://localhost:11434'
  const ollamaAvailable = await isOllamaReachable(ollamaHost)
  return ollamaAvailable ? 'ollama' : 'anthropic'
}

/**
 * Send a message to the configured LLM backend.
 * This is the primary function all API routes should call.
 *
 * Returns the assistant's text reply as a string.
 * Throws an error with a user-facing message if the request fails.
 */
export async function requestLLMMessage(input: {
  body: LLMMessageBody
  timeoutMs: number
  anthropicApiKey?: string
  preferredProvider?: 'ollama' | 'anthropic'
  preferredOllamaModel?: string
}): Promise<{ reply: string; backend: 'ollama' | 'anthropic' }> {
  const { body, timeoutMs, anthropicApiKey, preferredProvider, preferredOllamaModel } = input
  const configured = preferredProvider ?? getConfiguredBackend()
  const ollamaHost = process.env.OLLAMA_HOST ?? 'http://localhost:11434'
  const ollamaModel = preferredOllamaModel ?? process.env.OLLAMA_MODEL ?? 'phi3.5'
  const anthropicModel = body.model ?? 'claude-sonnet-4-20250514'

  // ── Ollama-only mode ─────────────────────────────────────────────────────
  if (configured === 'ollama') {
    const reply = await requestOllamaMessage({
      body: { ...body, model: ollamaModel },
      timeoutMs,
      host: ollamaHost,
      model: ollamaModel,
    })
    return { reply, backend: 'ollama' }
  }

  // ── Anthropic-only mode ──────────────────────────────────────────────────
  if (configured === 'anthropic') {
    if (!anthropicApiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not configured. Set LLM_BACKEND=ollama to use a local model instead.',
      )
    }
    const reply = await requestAnthropicMessage({
      apiKey: anthropicApiKey,
      body: { ...body, model: anthropicModel },
      timeoutMs,
    })
    return { reply, backend: 'anthropic' }
  }

  // ── Auto mode: try Ollama first, fall back to Anthropic ──────────────────
  const ollamaAvailable = await isOllamaReachable(ollamaHost)

  if (ollamaAvailable) {
    try {
      const reply = await requestOllamaMessage({
        body: { ...body, model: ollamaModel },
        timeoutMs,
        host: ollamaHost,
        model: ollamaModel,
      })
      return { reply, backend: 'ollama' }
    } catch (ollamaError) {
      // Ollama was reachable but the request failed (e.g. model not pulled).
      // Log the error and fall through to Anthropic if a key is available.
      console.warn(
        '[SAI Aemu] Ollama request failed, falling back to Anthropic:',
        ollamaError instanceof Error ? ollamaError.message : ollamaError,
      )
    }
  }

  // Fall back to Anthropic
  if (!anthropicApiKey) {
    throw new Error(
      ollamaAvailable
        ? `Ollama request failed and ANTHROPIC_API_KEY is not configured. ` +
          `Make sure the model is pulled: ollama pull ${ollamaModel}`
        : `Ollama is not reachable at ${ollamaHost} and ANTHROPIC_API_KEY is not configured. ` +
          `Start Ollama (ollama serve) or set ANTHROPIC_API_KEY to use the cloud backend.`,
    )
  }

  const reply = await requestAnthropicMessage({
    apiKey: anthropicApiKey,
    body: { ...body, model: anthropicModel },
    timeoutMs,
  })
  return { reply, backend: 'anthropic' }
}
