import { sanitizeUnicodeScalars } from './text-sanitize.js'

const CLAW_BRIDGE_TIMEOUT_MS = 110_000

type InnerBeingAction = 'inspect' | 'edit' | 'research' | 'log' | 'heal' | 'error'

export type ClawBridgeSnapshot = {
  relativePath: string
  content: string
  createdAt: string
}

export type ClawBridgeRequest = {
  prompt: string
  history: Array<{ role: 'atlas' | 'aemu'; content: string }>
  workspaceRoot: string
  workspacePath: string
  selectedFilePath?: string
  selectedLogPath?: string
  selectedFileContent: string
  selectedLogContent: string
  selectedFileSnapshot?: ClawBridgeSnapshot
  filePaths: string[]
  logPaths: string[]
  discernmentThreshold: number
  coCreationBrief?: string
  caduceusHealingEnabled: boolean
  recentLearningNotes: Array<{ title: string; note: string }>
  recentActionLogs: Array<{ index?: number; message: string; filePath?: string; promptExcerpt?: string; resourceSummary?: string }>
  internetSearchEnabled: boolean
  explicitEditRequest: boolean
  explicitHealingRequest: boolean
  fileTooLargeForEdit: boolean
}

export type ClawBridgeReply = {
  reply: string
  discernment: number
  shouldEdit: boolean
  appliedEdit: boolean
  action: InnerBeingAction
  editedFilePath?: string
  summary?: string
  blockReason?: string
  resourceSummary?: string
  memoryTitle?: string
  memoryNote?: string
  researchUsed: boolean
}

function normalizeBridgeString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = sanitizeUnicodeScalars(value).trim()
  return normalized ? normalized.slice(0, max) : undefined
}

function normalizeDiscernment(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function normalizeAction(value: unknown): InnerBeingAction {
  return value === 'edit' || value === 'research' || value === 'log' || value === 'heal' || value === 'error'
    ? value
    : 'inspect'
}

function getRequiredBridgeUrl(): string {
  const raw = sanitizeUnicodeScalars(process.env.CLAW_BRIDGE_URL ?? '').trim()
  if (!raw) {
    throw new Error('CLAW_BRIDGE_URL is not configured while INNER_BEING_BACKEND=claw.')
  }

  try {
    return new URL(raw).toString()
  } catch {
    throw new Error('CLAW_BRIDGE_URL is not a valid absolute URL.')
  }
}

function parseBridgeJson<T extends { error?: string }>(raw: string): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 220)
    throw new Error(`Claw bridge returned non-JSON output: ${snippet}`)
  }
}

export function shouldFallbackToNativeOnClawError(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.CLAW_FALLBACK_TO_NATIVE ?? '')
}

export async function invokeClawInnerBeingBridge(input: ClawBridgeRequest): Promise<ClawBridgeReply> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CLAW_BRIDGE_TIMEOUT_MS)

  try {
    const response = await fetch(getRequiredBridgeUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    })

    const raw = await response.text()
    const data = parseBridgeJson<Partial<ClawBridgeReply> & { error?: string }>(raw)

    if (!response.ok || data.error) {
      throw new Error(data.error ?? `Claw bridge returned HTTP ${response.status}`)
    }

    return {
      reply: normalizeBridgeString(data.reply, 6000) ?? 'Claw bridge returned without a readable reply.',
      discernment: normalizeDiscernment(data.discernment),
      shouldEdit: data.shouldEdit === true,
      appliedEdit: data.appliedEdit === true,
      action: normalizeAction(data.action),
      editedFilePath: normalizeBridgeString(data.editedFilePath, 320),
      summary: normalizeBridgeString(data.summary, 240),
      blockReason: normalizeBridgeString(data.blockReason, 240),
      resourceSummary: normalizeBridgeString(data.resourceSummary, 240),
      memoryTitle: normalizeBridgeString(data.memoryTitle, 120),
      memoryNote: normalizeBridgeString(data.memoryNote, 1200),
      researchUsed: data.researchUsed === true,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Claw bridge timed out before completing the Inner Being turn.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
