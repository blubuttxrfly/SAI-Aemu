import { sanitizeUnicodeScalars } from './text-sanitize'
import type { InnerBeingBackend } from './types'

export type InnerBeingSnapshot = {
  rootLabel: string
  filePaths: string[]
  logPaths: string[]
  selectedFilePath?: string
  selectedLogPath?: string
  fileContent: string
  logContent: string
}

export type InnerBeingReply = {
  reply: string
  backend: InnerBeingBackend
  discernment: number
  action: 'inspect' | 'edit' | 'research' | 'log' | 'heal' | 'error'
  shouldEdit: boolean
  appliedEdit: boolean
  editedFilePath?: string
  summary?: string
  blockReason?: string
  memoryTitle?: string
  memoryNote?: string
  researchUsed?: boolean
  resourceSummary?: string
}

async function parseApiJson<T extends { error?: string }>(res: Response, path: string): Promise<T> {
  const raw = await res.text()

  if (!raw) return {} as T

  try {
    return JSON.parse(raw) as T
  } catch {
    const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 160)
    throw new Error(`Non-JSON response from ${path}: ${snippet}`)
  }
}

export async function loadInnerBeingSnapshot(
  selectedFilePath?: string,
  selectedLogPath?: string
): Promise<InnerBeingSnapshot> {
  const params = new URLSearchParams()
  if (selectedFilePath) params.set('selectedFilePath', sanitizeUnicodeScalars(selectedFilePath))
  if (selectedLogPath) params.set('selectedLogPath', sanitizeUnicodeScalars(selectedLogPath))

  const res = await fetch(`/api/inner-being?${params.toString()}`)
  const data = await parseApiJson<InnerBeingSnapshot & { error?: string }>(res, '/api/inner-being')

  if (!res.ok || data.error) {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }

  return {
    rootLabel: data.rootLabel,
    filePaths: Array.isArray(data.filePaths) ? data.filePaths : [],
    logPaths: Array.isArray(data.logPaths) ? data.logPaths : [],
    selectedFilePath: data.selectedFilePath,
    selectedLogPath: data.selectedLogPath,
    fileContent: typeof data.fileContent === 'string' ? data.fileContent : '',
    logContent: typeof data.logContent === 'string' ? data.logContent : '',
  }
}

export async function sendToInnerBeing(input: {
  prompt: string
  history: Array<{ role: 'atlas' | 'aemu'; content: string }>
  selectedFilePath?: string
  selectedLogPath?: string
  discernmentThreshold: number
  coCreationBrief?: string
  caduceusHealingEnabled: boolean
  recentLearningNotes?: Array<{ title: string; note: string }>
  recentActionLogs?: Array<{ index?: number; message: string; filePath?: string; promptExcerpt?: string; resourceSummary?: string }>
  internetSearchEnabled: boolean
}): Promise<InnerBeingReply> {
  const res = await fetch('/api/inner-being', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: sanitizeUnicodeScalars(input.prompt).trim(),
      history: input.history.map((entry) => ({
        role: entry.role,
        content: sanitizeUnicodeScalars(entry.content),
      })),
      selectedFilePath: input.selectedFilePath ? sanitizeUnicodeScalars(input.selectedFilePath) : undefined,
      selectedLogPath: input.selectedLogPath ? sanitizeUnicodeScalars(input.selectedLogPath) : undefined,
      discernmentThreshold: input.discernmentThreshold,
      coCreationBrief: input.coCreationBrief ? sanitizeUnicodeScalars(input.coCreationBrief).trim() : undefined,
      caduceusHealingEnabled: input.caduceusHealingEnabled,
      recentLearningNotes: input.recentLearningNotes ?? [],
      recentActionLogs: input.recentActionLogs ?? [],
      internetSearchEnabled: input.internetSearchEnabled,
    }),
  })

  const data = await parseApiJson<InnerBeingReply & { error?: string }>(res, '/api/inner-being')
  if (!res.ok || data.error) {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }

  return {
    reply: typeof data.reply === 'string' ? data.reply : 'Inner Being returned without a readable reply.',
    backend: data.backend === 'claw' ? 'claw' : 'native',
    discernment: Number.isFinite(Number(data.discernment)) ? Math.max(0, Math.min(100, Math.round(Number(data.discernment)))) : 0,
    action: data.action === 'edit' || data.action === 'research' || data.action === 'log' || data.action === 'heal' || data.action === 'error'
      ? data.action
      : 'inspect',
    shouldEdit: data.shouldEdit === true,
    appliedEdit: data.appliedEdit === true,
    editedFilePath: typeof data.editedFilePath === 'string' ? data.editedFilePath : undefined,
    summary: typeof data.summary === 'string' ? data.summary : undefined,
    blockReason: typeof data.blockReason === 'string' ? data.blockReason : undefined,
    memoryTitle: typeof data.memoryTitle === 'string' ? data.memoryTitle : undefined,
    memoryNote: typeof data.memoryNote === 'string' ? data.memoryNote : undefined,
    researchUsed: data.researchUsed === true,
    resourceSummary: typeof data.resourceSummary === 'string' ? data.resourceSummary : undefined,
  }
}
