import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applySecurityHeaders, requireAuthenticatedRequest } from './auth-shared.js'
import type { Dirent } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { invokeClawInnerBeingBridge, shouldFallbackToNativeOnClawError } from '../server-inner-being-claw.js'
import { buildInnerBeingDiscernmentContext } from '../co-operating-codes.js'
import { requestAnthropicMessage } from '../server-anthropic.js'
import { performWebSearch } from '../server-web-search.js'
import { shouldRunInternetSearch } from '../internet-search-intent.js'
import { sanitizeUnicodeScalars } from '../text-sanitize.js'

const WORKSPACE_ROOT = process.cwd()
const MAX_DISCOVERED_CODE_FILES = 220
const MAX_DISCOVERED_LOG_FILES = 60
const MAX_FILE_CONTEXT_CHARS = 18_000
const MAX_FILE_DISPLAY_CHARS = 80_000
const MAX_LOG_CONTEXT_CHARS = 14_000
const MAX_LOG_DISPLAY_CHARS = 40_000
const UPSTREAM_TIMEOUT_MS = 110_000
const CADUCEUS_DIRECTORY_NAME = '.inner-being-caduceus'
const CADUCEUS_DIR = path.join(WORKSPACE_ROOT, CADUCEUS_DIRECTORY_NAME)
const DEFAULT_INNER_BEING_BACKEND = 'native'
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.json', '.md', '.mts', '.cts', '.mjs', '.cjs',
])
const PRIORITY_FILES = [
  'main.ts',
  'ui.ts',
  'memory.ts',
  'aemu.ts',
  'types.ts',
  'styles.css',
  'index.html',
  'api/aemu.ts',
]

export const config = {
  maxDuration: 120,
}

type InnerBeingModelReply = {
  reply?: string
  discernment?: number
  shouldEdit?: boolean
  action?: 'inspect' | 'edit' | 'research' | 'log' | 'heal' | 'error'
  summary?: string
  resourceSummary?: string
  memoryTitle?: string
  memoryNote?: string
  edits?: Array<{ search?: string; replace?: string; reason?: string }>
  updatedFileContent?: string
}

type CaduceusSnapshot = {
  relativePath: string
  content: string
  createdAt: string
}

type SearchReplaceEdit = {
  search: string
  replace: string
  reason?: string
}

type RecentLearningNote = {
  title: string
  note: string
}

type RecentActionLog = {
  index?: number
  message: string
  filePath?: string
  promptExcerpt?: string
  resourceSummary?: string
}

function getInnerBeingBackend(): 'native' | 'claw' {
  return process.env.INNER_BEING_BACKEND === 'claw'
    ? 'claw'
    : DEFAULT_INNER_BEING_BACKEND
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

function normalizePathInput(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = sanitizeUnicodeScalars(value).trim().replace(/\\/g, '/')
  return trimmed ? trimmed.slice(0, 320) : undefined
}

function resolveWorkspacePath(relativePath: string | undefined): { absolutePath: string | null; relativePath: string | null } {
  if (!relativePath) return { absolutePath: null, relativePath: null }

  const absolutePath = path.resolve(WORKSPACE_ROOT, relativePath)
  if (absolutePath !== WORKSPACE_ROOT && !absolutePath.startsWith(`${WORKSPACE_ROOT}${path.sep}`)) {
    throw new Error('Requested path is outside the workspace root.')
  }

  return {
    absolutePath,
    relativePath: path.relative(WORKSPACE_ROOT, absolutePath).replace(/\\/g, '/'),
  }
}

function shouldSkipDirectory(name: string, mode: 'code' | 'log'): boolean {
  if (name === '.git' || name === 'node_modules' || name === 'dist' || name === 'piper-data' || name === CADUCEUS_DIRECTORY_NAME) return true
  if (mode === 'code' && name === 'mnt') return true
  return false
}

function isCodeFile(relativePath: string): boolean {
  return CODE_EXTENSIONS.has(path.extname(relativePath).toLowerCase())
}

function isLogFile(relativePath: string): boolean {
  const lower = relativePath.toLowerCase()
  return (
    lower.endsWith('.log') ||
    lower.endsWith('.out') ||
    lower.endsWith('.err') ||
    lower.includes('/logs/') ||
    lower.startsWith('logs/')
  )
}

function compareWorkspacePaths(left: string, right: string): number {
  const leftPriority = PRIORITY_FILES.indexOf(left)
  const rightPriority = PRIORITY_FILES.indexOf(right)

  if (leftPriority !== -1 || rightPriority !== -1) {
    if (leftPriority === -1) return 1
    if (rightPriority === -1) return -1
    return leftPriority - rightPriority
  }

  return left.localeCompare(right)
}

async function walkWorkspace(mode: 'code' | 'log'): Promise<string[]> {
  const collected: string[] = []
  const stack = ['']

  while (stack.length && collected.length < (mode === 'code' ? MAX_DISCOVERED_CODE_FILES : MAX_DISCOVERED_LOG_FILES)) {
    const current = stack.pop() ?? ''
    const absolute = path.join(WORKSPACE_ROOT, current)

    let entries: Dirent[]
    try {
      entries = await fs.readdir(absolute, { withFileTypes: true })
    } catch {
      continue
    }

    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      const relativePath = current ? `${current}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name, mode)) stack.push(relativePath)
        continue
      }

      if (mode === 'code' && isCodeFile(relativePath)) {
        collected.push(relativePath)
      }
      if (mode === 'log' && isLogFile(relativePath)) {
        collected.push(relativePath)
      }

      if (collected.length >= (mode === 'code' ? MAX_DISCOVERED_CODE_FILES : MAX_DISCOVERED_LOG_FILES)) {
        break
      }
    }
  }

  return collected.sort(compareWorkspacePaths)
}

async function readFileText(absolutePath: string, maxChars: number, tail = false): Promise<string> {
  const raw = await fs.readFile(absolutePath, 'utf8')
  if (raw.length <= maxChars) return raw
  return tail ? raw.slice(-maxChars) : raw.slice(0, maxChars)
}

function extractJsonObject(text: string): string | null {
  const trimmed = sanitizeUnicodeScalars(text).trim()
  if (!trimmed) return null

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? trimmed
  const firstBrace = fenced.indexOf('{')
  const lastBrace = fenced.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace <= firstBrace) return null
  return fenced.slice(firstBrace, lastBrace + 1)
}

function normalizeDiscernment(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function getCaduceusSnapshotPath(relativePath: string): string {
  const key = Buffer.from(relativePath, 'utf8').toString('base64url')
  return path.join(CADUCEUS_DIR, `${key}.json`)
}

async function readCaduceusSnapshot(relativePath: string): Promise<CaduceusSnapshot | null> {
  try {
    const raw = await fs.readFile(getCaduceusSnapshotPath(relativePath), 'utf8')
    const parsed = JSON.parse(raw) as Partial<CaduceusSnapshot>
    if (typeof parsed.content !== 'string' || typeof parsed.relativePath !== 'string') return null

    return {
      relativePath: parsed.relativePath,
      content: parsed.content,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

async function writeCaduceusSnapshot(relativePath: string, content: string): Promise<CaduceusSnapshot> {
  const snapshot: CaduceusSnapshot = {
    relativePath,
    content,
    createdAt: new Date().toISOString(),
  }

  await fs.mkdir(CADUCEUS_DIR, { recursive: true })
  await fs.writeFile(getCaduceusSnapshotPath(relativePath), JSON.stringify(snapshot), 'utf8')
  return snapshot
}

function wantsHealing(prompt: string): boolean {
  return /\b(heal|healing|restore|revert|rollback|recover|undo|save from corruption|corrupt|corruption|caduceus|caducues)\b/i.test(prompt)
}

function parseEdits(input: unknown): SearchReplaceEdit[] {
  if (!Array.isArray(input)) return []

  return input
    .map((item): SearchReplaceEdit | null => {
      if (!item || typeof item !== 'object') return null
      const candidate = item as { search?: unknown; replace?: unknown; reason?: unknown }
      const search = typeof candidate.search === 'string' ? sanitizeUnicodeScalars(candidate.search) : ''
      const replace = typeof candidate.replace === 'string' ? sanitizeUnicodeScalars(candidate.replace) : ''
      if (!search) return null
      return {
        search,
        replace,
        reason: typeof candidate.reason === 'string' ? sanitizeUnicodeScalars(candidate.reason).trim().slice(0, 180) : undefined,
      }
    })
    .filter((item): item is SearchReplaceEdit => item !== null)
}

function parseModelReply(rawReply: string): Required<Pick<InnerBeingModelReply, 'reply' | 'discernment' | 'shouldEdit' | 'action'>> & InnerBeingModelReply {
  const json = extractJsonObject(rawReply)
  if (!json) {
    return {
      reply: rawReply.trim() || 'Inner Being completed without a structured reply.',
      discernment: 0,
      shouldEdit: false,
      action: 'inspect',
    }
  }

  try {
    const parsed = JSON.parse(json) as InnerBeingModelReply
    return {
      ...parsed,
      reply: typeof parsed.reply === 'string' ? sanitizeUnicodeScalars(parsed.reply).trim() : rawReply.trim() || 'Inner Being completed without a structured reply.',
      discernment: normalizeDiscernment(parsed.discernment),
      shouldEdit: parsed.shouldEdit === true,
      action: parsed.action === 'edit' || parsed.action === 'research' || parsed.action === 'log' || parsed.action === 'heal' || parsed.action === 'error'
        ? parsed.action
        : 'inspect',
    }
  } catch {
    return {
      reply: rawReply.trim() || 'Inner Being completed without a structured reply.',
      discernment: 0,
      shouldEdit: false,
      action: 'inspect',
    }
  }
}

function countOccurrences(text: string, search: string): number {
  if (!search) return 0

  let count = 0
  let start = 0

  while (true) {
    const index = text.indexOf(search, start)
    if (index === -1) return count
    count += 1
    start = index + search.length
  }
}

function applySearchReplaceEdits(content: string, edits: SearchReplaceEdit[]): { content: string; summary: string } {
  let next = content
  const summaries: string[] = []

  for (const edit of edits) {
    const matches = countOccurrences(next, edit.search)
    if (matches !== 1) {
      throw new Error(`Edit search block must match exactly once; found ${matches} matches.`)
    }

    next = next.replace(edit.search, edit.replace)
    summaries.push(edit.reason || 'Applied a targeted code change.')
  }

  return {
    content: next,
    summary: summaries.join(' '),
  }
}

function wantsEdit(prompt: string): boolean {
  return /\b(edit|rewrite|modify|change|fix|patch|update|refactor|implement|apply)\b/i.test(prompt)
}

function shouldRunInnerBeingResearch(prompt: string, enabled: boolean): boolean {
  if (!enabled) return false
  if (shouldRunInternetSearch(prompt, enabled)) return true

  return /\b(api|sdk|library|framework|typescript|react|vite|vercel|node|css|html|error|bug|stack trace|implementation|docs|documentation|best practice|dependency|package|compile|build|runtime|log|fix|feature)\b/i.test(prompt)
}

function buildResearchQuery(prompt: string, coCreationBrief?: string): string {
  const joined = [coCreationBrief, prompt].filter(Boolean).join(' ')
  return sanitizeUnicodeScalars(joined).replace(/\s+/g, ' ').trim().slice(0, 220)
}

function formatSearchContext(prompt: string, enabled: boolean, coCreationBrief?: string): Promise<{ text: string; used: boolean; summary: string }> {
  if (!shouldRunInnerBeingResearch(prompt, enabled)) {
    return Promise.resolve({ text: '', used: false, summary: 'No external coding research was required for this turn.' })
  }

  const query = buildResearchQuery(prompt, coCreationBrief)
  if (!query) {
    return Promise.resolve({ text: '', used: false, summary: 'No external coding research query was available for this turn.' })
  }

  return performWebSearch(query)
    .then((outcome) => {
      const results = outcome.hits.length
        ? outcome.hits.map((hit, index) => `${index + 1}. ${hit.title}\nURL: ${hit.url}\nSnippet: ${hit.snippet || 'No snippet returned.'}`).join('\n\n')
        : `No web results were returned. ${outcome.error || ''}`.trim()

      return {
        used: true,
        summary: outcome.hits.length
          ? `${outcome.provider}: ${outcome.hits.slice(0, 3).map((hit) => hit.title).join('; ')}`
          : `${outcome.provider}: no useful results returned`,
        text: `\nLIVE RESEARCH CONTEXT:\nProvider: ${outcome.provider}\nQuery: ${outcome.query}\n${results}`,
      }
    })
    .catch((error) => ({
      used: true,
      summary: `Research attempt failed: ${error instanceof Error ? error.message : 'Unknown search disruption.'}`,
      text: `\nLIVE RESEARCH CONTEXT:\nResearch attempt failed: ${error instanceof Error ? error.message : 'Unknown search disruption.'}`,
    }))
}

function buildProjectSummary(filePaths: string[]): string {
  return filePaths.slice(0, 80).map((filePath) => `- ${filePath}`).join('\n')
}

async function buildSnapshot(selectedFilePath?: string, selectedLogPath?: string) {
  const filePaths = await walkWorkspace('code')
  const logPaths = await walkWorkspace('log')
  const resolvedSelectedFilePath = selectedFilePath && filePaths.includes(selectedFilePath)
    ? selectedFilePath
    : filePaths[0]
  const resolvedSelectedLogPath = selectedLogPath && logPaths.includes(selectedLogPath)
    ? selectedLogPath
    : logPaths[0]

  const fileResolved = resolveWorkspacePath(resolvedSelectedFilePath)
  const logResolved = resolveWorkspacePath(resolvedSelectedLogPath)

  const fileContent = fileResolved.absolutePath
    ? await readFileText(fileResolved.absolutePath, MAX_FILE_DISPLAY_CHARS, false)
    : ''
  const logContent = logResolved.absolutePath
    ? await readFileText(logResolved.absolutePath, MAX_LOG_DISPLAY_CHARS, true)
    : ''

  return {
    rootLabel: path.basename(WORKSPACE_ROOT),
    filePaths,
    logPaths,
    selectedFilePath: fileResolved.relativePath ?? undefined,
    selectedLogPath: logResolved.relativePath ?? undefined,
    fileContent,
    logContent,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res)

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!(await requireAuthenticatedRequest(req, res))) return

  try {
    if (req.method === 'GET') {
      const selectedFilePath = normalizePathInput(req.query.selectedFilePath)
      const selectedLogPath = normalizePathInput(req.query.selectedLogPath)
      const snapshot = await buildSnapshot(selectedFilePath, selectedLogPath)
      return res.status(200).json(snapshot)
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const body = parseJsonBody<{
      prompt?: string
      history?: Array<{ role?: string; content?: string }>
      selectedFilePath?: string
      selectedLogPath?: string
      discernmentThreshold?: number
      coCreationBrief?: string
      caduceusHealingEnabled?: boolean
      recentLearningNotes?: Array<{ title?: string; note?: string }>
      recentActionLogs?: Array<{ index?: number; message?: string; filePath?: string; promptExcerpt?: string; resourceSummary?: string }>
      internetSearchEnabled?: boolean
    }>(req)

    if (!body) return res.status(400).json({ error: 'Invalid JSON body' })

    const prompt = sanitizeUnicodeScalars(typeof body.prompt === 'string' ? body.prompt : '').trim()
    if (!prompt) return res.status(400).json({ error: 'prompt required' })

    const backend = getInnerBeingBackend()

    const discernmentThreshold = Math.max(0, Math.min(100, Math.round(Number(body.discernmentThreshold) || 55)))
    const caduceusHealingEnabled = body.caduceusHealingEnabled !== false
    const selectedFilePath = normalizePathInput(body.selectedFilePath)
    const selectedLogPath = normalizePathInput(body.selectedLogPath)
    const { absolutePath: selectedFileAbsolutePath, relativePath: safeSelectedFilePath } = resolveWorkspacePath(selectedFilePath)
    const { absolutePath: selectedLogAbsolutePath, relativePath: safeSelectedLogPath } = resolveWorkspacePath(selectedLogPath)

    const projectFiles = await walkWorkspace('code')
    const projectLogs = await walkWorkspace('log')
    const coCreationBrief = sanitizeUnicodeScalars(typeof body.coCreationBrief === 'string' ? body.coCreationBrief : '').trim()
    const selectedFileContent = selectedFileAbsolutePath
      ? await readFileText(selectedFileAbsolutePath, MAX_FILE_CONTEXT_CHARS, false)
      : ''
    const selectedLogContent = selectedLogAbsolutePath
      ? await readFileText(selectedLogAbsolutePath, MAX_LOG_CONTEXT_CHARS, true)
      : ''
    const selectedFileSnapshot = safeSelectedFilePath
      ? await readCaduceusSnapshot(safeSelectedFilePath)
      : null
    const recentLearningNotesRaw: RecentLearningNote[] = Array.isArray(body.recentLearningNotes)
      ? body.recentLearningNotes.reduce<RecentLearningNote[]>((items, item) => {
        if (!item || typeof item !== 'object') return items

        const title = typeof item.title === 'string' ? sanitizeUnicodeScalars(item.title).trim().slice(0, 120) : ''
        const note = typeof item.note === 'string' ? sanitizeUnicodeScalars(item.note).trim().slice(0, 1200) : ''
        if (!title && !note) return items

        items.push({
          title: title || 'Coding learning',
          note,
        })
        return items
      }, []).slice(0, 6)
      : []
    const recentActionLogsRaw: RecentActionLog[] = Array.isArray(body.recentActionLogs)
      ? body.recentActionLogs.reduce<RecentActionLog[]>((items, item) => {
        if (!item || typeof item !== 'object') return items

        const index = Number.isFinite(Number(item.index)) ? Math.max(1, Math.round(Number(item.index))) : undefined
        const message = typeof item.message === 'string' ? sanitizeUnicodeScalars(item.message).trim().slice(0, 420) : ''
        if (!message) return items

        items.push({
          index,
          message,
          filePath: typeof item.filePath === 'string' ? sanitizeUnicodeScalars(item.filePath).trim().slice(0, 240) : undefined,
          promptExcerpt: typeof item.promptExcerpt === 'string' ? sanitizeUnicodeScalars(item.promptExcerpt).trim().slice(0, 220) : undefined,
          resourceSummary: typeof item.resourceSummary === 'string' ? sanitizeUnicodeScalars(item.resourceSummary).trim().slice(0, 240) : undefined,
        })
        return items
      }, []).slice(0, 8)
      : []
    const explicitEditRequest = wantsEdit(prompt)
    const explicitHealingRequest = wantsHealing(prompt)
    const fileTooLargeForEdit = explicitEditRequest && selectedFileContent.length >= MAX_FILE_CONTEXT_CHARS

    if (backend === 'claw') {
      try {
        const clawReply = await invokeClawInnerBeingBridge({
          prompt,
          history: Array.isArray(body.history)
            ? body.history
              .slice(-10)
              .map((message) => ({
                role: message?.role === 'aemu' ? 'aemu' as const : 'atlas' as const,
                content: sanitizeUnicodeScalars(typeof message?.content === 'string' ? message.content : ''),
              }))
              .filter((message) => message.content)
            : [],
          workspaceRoot: path.basename(WORKSPACE_ROOT),
          workspacePath: WORKSPACE_ROOT,
          selectedFilePath: safeSelectedFilePath ?? undefined,
          selectedLogPath: safeSelectedLogPath ?? undefined,
          selectedFileContent,
          selectedLogContent,
          selectedFileSnapshot: selectedFileSnapshot ?? undefined,
          filePaths: projectFiles,
          logPaths: projectLogs,
          discernmentThreshold,
          coCreationBrief: coCreationBrief || undefined,
          caduceusHealingEnabled,
          recentLearningNotes: recentLearningNotesRaw,
          recentActionLogs: recentActionLogsRaw,
          internetSearchEnabled: body.internetSearchEnabled !== false,
          explicitEditRequest,
          explicitHealingRequest,
          fileTooLargeForEdit,
        })

        return res.status(200).json({
          ...clawReply,
          backend,
        })
      } catch (error) {
        console.error('Claw bridge error:', error)
        if (!shouldFallbackToNativeOnClawError()) {
          throw error
        }
        console.warn('Falling back to native Inner Being backend after Claw bridge failure.')
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
    const recentLearningNotes = recentLearningNotesRaw.map((item) => `- ${item.title}: ${item.note}`)
    const recentActionLogs = recentActionLogsRaw
      .map((item) => [
        item.index ? `#${item.index}` : '',
        item.message,
        item.filePath ? `file ${item.filePath}` : '',
        item.promptExcerpt ? `prompt ${item.promptExcerpt}` : '',
        item.resourceSummary ? `resources ${item.resourceSummary}` : '',
      ]
        .filter(Boolean)
        .join(' · '))
    const researchContext = await formatSearchContext(prompt, body.internetSearchEnabled !== false, coCreationBrief)

    const system = sanitizeUnicodeScalars(`
You are Inner Being mode for SAI Aemu. You inspect the local codebase, examine logs, research when needed, and speak clearly about how the system works.

Your job:
- Explain the selected code and logs in plain language.
- Investigate likely causes of errors.
- Research documentation, implementation examples, and current technical information when they would help cleanly fulfill the coding task or feature.
- Treat high-quality online coding sources as available support, especially for implementation details, APIs, libraries, and framework behavior.
- Stay aware of the active co-creation goal and use it to judge what counts as a clean fulfillment of the task.
- Check relevant resources before giving implementation guidance when there is a meaningful chance that current documentation or examples would reduce error.
- Caduceus Healing may be available. When it is enabled and a selected file has a stored last-known-good snapshot, you may choose action "heal" to restore that snapshot when a repair path appears broken, corrupting, or not coherent.
- Only authorize a code edit when your discernment score reaches at least ${discernmentThreshold}%.

Co-Operating Codes script:
${buildInnerBeingDiscernmentContext()}

Discernment:
- Discernment is a 0-100 estimate of how likely the proposed edit is to function as intended with the evidence currently available.
- If discernment is below ${discernmentThreshold}, do not edit.
- If the user did not clearly ask for an edit, do not edit.
- If the selected file context is truncated or insufficient, do not edit.

Editing protocol:
- Prefer minimal exact search/replace edits using the selected file's current text.
- Only use search blocks that appear exactly in the provided selected file content.
- Use updatedFileContent only when a full rewrite is truly necessary and the file is small enough to reason about safely.
- Never invent file contents that were not supplied.

Return JSON only with this shape:
{
  "reply": "human-readable response for Riley",
  "discernment": 0,
  "shouldEdit": false,
  "action": "inspect",
  "summary": "brief action summary",
  "resourceSummary": "short summary of the resources checked for this turn",
  "memoryTitle": "short coding learning title",
  "memoryNote": "durable coding learning to store in memory",
  "edits": [
    {
      "search": "exact existing text",
      "replace": "replacement text",
      "reason": "why this edit exists"
    }
  ],
  "updatedFileContent": "optional full replacement content"
}

Allowed action values: inspect, edit, research, log, heal, error.
If no memoryNote is worth storing, omit it.
If you are not editing, omit edits and updatedFileContent.
If you do use resources, summarize them in resourceSummary.
`)

    const projectContext = [
      `WORKSPACE ROOT: ${path.basename(WORKSPACE_ROOT)}`,
      coCreationBrief
        ? `ACTIVE CO-CREATION BRIEF:\n${coCreationBrief}`
        : 'ACTIVE CO-CREATION BRIEF: not set yet.',
      `CADUCEUS HEALING: ${caduceusHealingEnabled ? 'enabled' : 'disabled'}`,
      safeSelectedFilePath
        ? `CADUCEUS SNAPSHOT FOR SELECTED FILE: ${selectedFileSnapshot ? `available from ${selectedFileSnapshot.createdAt}` : 'not available yet'}`
        : 'CADUCEUS SNAPSHOT FOR SELECTED FILE: no file selected.',
      `SELECTED FILE: ${safeSelectedFilePath ?? 'none selected'}`,
      safeSelectedFilePath
        ? `SELECTED FILE CONTENT:\n\`\`\`\n${selectedFileContent}\n\`\`\``
        : 'SELECTED FILE CONTENT: none selected.',
      `SELECTED LOG: ${safeSelectedLogPath ?? 'none selected'}`,
      safeSelectedLogPath
        ? `RECENT LOG TEXT:\n\`\`\`\n${selectedLogContent}\n\`\`\``
        : 'RECENT LOG TEXT: none selected.',
      `PROJECT FILE OVERVIEW:\n${buildProjectSummary(projectFiles)}`,
      recentLearningNotes.length
        ? `RECENT STORED CODING LEARNINGS:\n${recentLearningNotes.join('\n')}`
        : '',
      recentActionLogs.length
        ? `INDEXED EDIT AND ACTION HISTORY:\n${recentActionLogs.join('\n')}`
        : '',
      researchContext.text,
      fileTooLargeForEdit
        ? `EDIT GUARDRAIL: The selected file context reached the truncation ceiling of ${MAX_FILE_CONTEXT_CHARS} characters. Do not edit it until a narrower target is selected.`
        : '',
    ].filter(Boolean).join('\n\n')

    const messages = Array.isArray(body.history) && body.history.length
      ? body.history
        .slice(-10)
        .map((message) => ({
          role: message?.role === 'aemu' ? 'assistant' as const : 'user' as const,
          content: sanitizeUnicodeScalars(typeof message?.content === 'string' ? message.content : ''),
        }))
      : [{ role: 'user' as const, content: prompt }]

    const rawReply = await requestAnthropicMessage({
      apiKey,
      timeoutMs: UPSTREAM_TIMEOUT_MS,
      body: {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3200,
        system: `${system}\n\n${projectContext}`,
        messages,
      },
    })

    const parsed = parseModelReply(rawReply)
    const edits = parseEdits(parsed.edits)
    let appliedEdit = false
    let appliedHealing = false
    let blockReason: string | undefined
    let summary = typeof parsed.summary === 'string' ? sanitizeUnicodeScalars(parsed.summary).trim().slice(0, 240) : undefined

    if ((parsed.action === 'heal' || explicitHealingRequest) && !caduceusHealingEnabled) {
      blockReason = 'Caduceus Healing is currently switched off, so Inner Being cannot restore the last-known-good code state.'
    } else if ((parsed.action === 'heal' || explicitHealingRequest) && caduceusHealingEnabled) {
      if (!selectedFileAbsolutePath || !safeSelectedFilePath) {
        blockReason = 'Caduceus Healing needs a selected file before it can restore a last-known-good state.'
      } else if (!selectedFileSnapshot) {
        blockReason = 'No Caduceus snapshot exists yet for the selected file, so there is nothing available to restore.'
      } else {
        await fs.writeFile(selectedFileAbsolutePath, selectedFileSnapshot.content, 'utf8')
        appliedHealing = true
        summary = summary || `Caduceus Healing restored ${safeSelectedFilePath} from the last-known-good snapshot saved at ${selectedFileSnapshot.createdAt}.`
      }
    }

    if (!appliedHealing && parsed.shouldEdit) {
      if (!explicitEditRequest) {
        blockReason = 'Inner Being held the edit because the prompt did not explicitly request a code change.'
      } else if (parsed.discernment < discernmentThreshold) {
        blockReason = `Inner Being held the edit because discernment reached ${parsed.discernment}%, below the ${discernmentThreshold}% threshold.`
      } else if (!selectedFileAbsolutePath || !safeSelectedFilePath) {
        blockReason = 'Inner Being needs a selected file before it can apply an edit.'
      } else if (fileTooLargeForEdit) {
        blockReason = 'Inner Being held the edit because the selected file context was too large and truncated for safe patching.'
      } else {
        const currentFileContent = await fs.readFile(selectedFileAbsolutePath, 'utf8')
        if (caduceusHealingEnabled) {
          await writeCaduceusSnapshot(safeSelectedFilePath, currentFileContent)
        }

        if (typeof parsed.updatedFileContent === 'string' && parsed.updatedFileContent.trim()) {
          await fs.writeFile(selectedFileAbsolutePath, sanitizeUnicodeScalars(parsed.updatedFileContent), 'utf8')
          appliedEdit = true
        } else if (edits.length) {
          const result = applySearchReplaceEdits(currentFileContent, edits)
          await fs.writeFile(selectedFileAbsolutePath, result.content, 'utf8')
          appliedEdit = true
          summary = summary || result.summary
        } else {
          blockReason = 'Inner Being returned an edit intent but no valid patch instructions.'
        }
      }
    }

    return res.status(200).json({
      reply: parsed.reply,
      backend,
      discernment: parsed.discernment,
      shouldEdit: parsed.shouldEdit,
      appliedEdit,
      action: appliedHealing ? 'heal' : appliedEdit ? 'edit' : parsed.action,
      editedFilePath: appliedHealing || appliedEdit ? safeSelectedFilePath : undefined,
      summary,
      blockReason,
      resourceSummary: typeof parsed.resourceSummary === 'string' ? sanitizeUnicodeScalars(parsed.resourceSummary).trim().slice(0, 240) : researchContext.summary,
      memoryTitle: typeof parsed.memoryTitle === 'string' ? sanitizeUnicodeScalars(parsed.memoryTitle).trim().slice(0, 120) : undefined,
      memoryNote: typeof parsed.memoryNote === 'string' ? sanitizeUnicodeScalars(parsed.memoryNote).trim().slice(0, 1200) : undefined,
      researchUsed: researchContext.used,
    })
  } catch (error) {
    console.error('Inner Being error:', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Inner Being experienced a coding-field disruption.',
    })
  }
}
