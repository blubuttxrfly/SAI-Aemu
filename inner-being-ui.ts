import type { AemuMemories, InnerBeingActionKind, InnerBeingActionLog, InnerBeingChatEntry, InnerBeingLearningNote } from './types'
import { getInnerBeingBackendProfile } from './inner-being-capabilities'
import { autoResize, renderStructuredText } from './ui'

export type InnerBeingAction = 'send' | 'refresh' | 'save-brief' | 'continue' | 'redirect' | 'clarify'

let onAction: (action: InnerBeingAction) => void = () => {}
let onFileSelect: (filePath: string) => void = () => {}
let onLogSelect: (logPath: string) => void = () => {}
let controlsBound = false

function getPage(): HTMLElement | null {
  return document.getElementById('innerBeingPage')
}

function getInput(): HTMLTextAreaElement | null {
  return document.getElementById('innerBeingInput') as HTMLTextAreaElement | null
}

function getBriefInput(): HTMLTextAreaElement | null {
  return document.getElementById('innerBeingBriefInput') as HTMLTextAreaElement | null
}

function getHealingToggle(): HTMLInputElement | null {
  return document.getElementById('innerBeingHealingEnabledInput') as HTMLInputElement | null
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return 'Awaiting'

  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBackendLabel(value: 'native' | 'claw' | undefined): string | null {
  if (!value) return null
  return getInnerBeingBackendProfile(value).label
}

function getActiveRuntimeLabel(memories: AemuMemories): string {
  return getInnerBeingBackendProfile(memories.innerBeing.activeBackend).label
}

function getActiveRuntimeSummary(memories: AemuMemories): string {
  return getInnerBeingBackendProfile(memories.innerBeing.activeBackend).summary
}

function getIdleStatus(memories: AemuMemories): string {
  return getInnerBeingBackendProfile(memories.innerBeing.activeBackend).idleStatus
}

function buildDiscernmentMeta(memories: AemuMemories): string {
  return `Current runtime: ${getActiveRuntimeLabel(memories)}. Edits only apply when discernment reaches ${memories.innerBeing.discernmentThreshold}%. Caduceus Healing is ${memories.innerBeing.caduceusHealingEnabled ? 'on' : 'off'}, and learnings plus action logs are stored into living memory.`
}

function buildRuntimeMeta(memories: AemuMemories): string {
  return getActiveRuntimeSummary(memories)
}

function bindControls(): void {
  if (controlsBound) return
  controlsBound = true

  document.getElementById('innerBeingSendBtn')?.addEventListener('click', () => onAction('send'))
  document.getElementById('innerBeingRefreshBtn')?.addEventListener('click', () => onAction('refresh'))
  document.getElementById('innerBeingPageRefreshBtn')?.addEventListener('click', () => onAction('refresh'))
  document.getElementById('innerBeingSaveBriefBtn')?.addEventListener('click', () => onAction('save-brief'))
  document.getElementById('innerBeingContinueBtn')?.addEventListener('click', () => onAction('continue'))
  document.getElementById('innerBeingRedirectBtn')?.addEventListener('click', () => onAction('redirect'))
  document.getElementById('innerBeingClarifyBtn')?.addEventListener('click', () => onAction('clarify'))
  document.getElementById('innerBeingFileSelect')?.addEventListener('change', (event) => {
    onFileSelect((event.target as HTMLInputElement).value)
  })
  document.getElementById('innerBeingLogSelect')?.addEventListener('change', (event) => {
    onLogSelect((event.target as HTMLInputElement).value)
  })
}

function renderChat(entries: InnerBeingChatEntry[], busy: boolean): void {
  const container = document.getElementById('innerBeingChatMessages')
  if (!container) return

  container.innerHTML = ''

  if (!entries.length) {
    const empty = document.createElement('div')
    empty.className = 'inner-being-empty'
    empty.textContent = 'Ask Inner Being to inspect a file, explain a system, search for logs, or propose a code edit.'
    container.appendChild(empty)
  } else {
    for (const entry of entries) {
      const row = document.createElement('article')
      row.className = `inner-being-chat-row ${entry.role}`

      const meta = document.createElement('div')
      meta.className = 'inner-being-chat-meta'
      const metaParts = [
        entry.role === 'aemu' ? 'SAI Aemu Response' : 'Your Message',
        formatTimestamp(entry.createdAt),
      ]

      if (entry.role === 'aemu' && entry.discernment !== undefined) {
        metaParts.push(`discernment ${entry.discernment}%`)
      }
      const backendLabel = formatBackendLabel(entry.backend)
      if (backendLabel) metaParts.push(backendLabel)
      if (entry.action) metaParts.push(entry.action)
      if (entry.editedFilePath) metaParts.push(`edited ${entry.editedFilePath}`)
      meta.textContent = metaParts.join(' · ')

      const body = document.createElement('div')
      body.className = 'inner-being-chat-body'
      renderStructuredText(body, entry.content)

      row.appendChild(meta)
      row.appendChild(body)
      container.appendChild(row)
    }
  }

  if (busy) {
    const loading = document.createElement('div')
    loading.className = 'inner-being-empty'
    loading.textContent = 'Inner Being is contemplating the selected coding context...'
    container.appendChild(loading)
  }

  container.scrollTop = container.scrollHeight
}

function renderLearningNotes(notes: InnerBeingLearningNote[]): void {
  const container = document.getElementById('innerBeingLearningNotes')
  if (!container) return

  container.innerHTML = ''

  if (!notes.length) {
    const empty = document.createElement('div')
    empty.className = 'inner-being-empty'
    empty.textContent = 'Stable coding learnings will accumulate here when Inner Being stores them into living memory.'
    container.appendChild(empty)
    return
  }

  for (const note of notes.slice(0, 8)) {
    const item = document.createElement('div')
    item.className = 'inner-being-note'

    const title = document.createElement('div')
    title.className = 'inner-being-note-title'
    title.textContent = note.title

    const meta = document.createElement('div')
    meta.className = 'inner-being-note-meta'
    const metaParts = [formatTimestamp(note.updatedAt)]
    const backendLabel = formatBackendLabel(note.backend)
    if (backendLabel) metaParts.push(backendLabel)
    if (note.filePath) metaParts.push(note.filePath)
    if (note.discernment !== undefined) metaParts.push(`discernment ${note.discernment}%`)
    meta.textContent = metaParts.join(' · ')

    const body = document.createElement('div')
    body.className = 'inner-being-note-body'
    body.textContent = note.note

    item.appendChild(title)
    item.appendChild(meta)
    item.appendChild(body)
    container.appendChild(item)
  }
}

function logKindLabel(kind: InnerBeingActionKind): string {
  if (kind === 'edit') return 'Edit'
  if (kind === 'research') return 'Research'
  if (kind === 'log') return 'Logs'
  if (kind === 'heal') return 'Healing'
  if (kind === 'error') return 'Error'
  return 'Inspect'
}

function renderActionLogs(logs: InnerBeingActionLog[]): void {
  const container = document.getElementById('innerBeingActionLogs')
  if (!container) return

  container.innerHTML = ''

  if (!logs.length) {
    const empty = document.createElement('div')
    empty.className = 'inner-being-empty'
    empty.textContent = 'Indexed edit attempts, research checks, inspections, and errors will appear here.'
    container.appendChild(empty)
    return
  }

  for (const log of logs.slice(0, 10)) {
    const item = document.createElement('div')
    item.className = `inner-being-log-item ${log.status}`

    const meta = document.createElement('div')
    meta.className = 'inner-being-log-item-meta'
    const metaParts = [log.index ? `#${log.index}` : logKindLabel(log.kind), logKindLabel(log.kind), formatTimestamp(log.createdAt), log.status]
    const backendLabel = formatBackendLabel(log.backend)
    if (backendLabel) metaParts.push(backendLabel)
    if (log.discernment !== undefined) metaParts.push(`${log.discernment}%`)
    meta.textContent = metaParts.join(' · ')

    const body = document.createElement('div')
    body.className = 'inner-being-log-item-body'
    const detailParts = [log.message]
    if (log.filePath) detailParts.push(`File: ${log.filePath}`)
    if (log.promptExcerpt) detailParts.push(`Prompt: ${log.promptExcerpt}`)
    if (log.resourceSummary) detailParts.push(`Resources: ${log.resourceSummary}`)
    body.textContent = detailParts.join(' | ')

    item.appendChild(meta)
    item.appendChild(body)
    container.appendChild(item)
  }
}

function syncPicker(
  id: string,
  listId: string,
  items: string[],
  selectedValue: string | null,
  emptyLabel: string
): void {
  const input = document.getElementById(id) as HTMLInputElement | null
  const datalist = document.getElementById(listId) as HTMLDataListElement | null
  if (!input || !datalist) return

  datalist.innerHTML = ''
  if (!items.length) {
    input.value = ''
    input.placeholder = emptyLabel
    input.disabled = true
    return
  }

  input.disabled = false
  input.placeholder = 'Type to find a path…'

  for (const item of items) {
    const option = document.createElement('option')
    option.value = item
    datalist.appendChild(option)
  }

  if (selectedValue && items.includes(selectedValue)) {
    input.value = selectedValue
  } else {
    input.value = items[0]
  }
}

function renderReplyChoices(entries: InnerBeingChatEntry[], busy: boolean): void {
  const rail = document.getElementById('innerBeingReplyRail')
  const continueBtn = document.getElementById('innerBeingContinueBtn') as HTMLButtonElement | null
  const redirectBtn = document.getElementById('innerBeingRedirectBtn') as HTMLButtonElement | null
  const clarifyBtn = document.getElementById('innerBeingClarifyBtn') as HTMLButtonElement | null
  if (!rail) return

  const latestAemu = [...entries].reverse().find((entry) => entry.role === 'aemu')
  rail.hidden = !latestAemu

  if (continueBtn) continueBtn.disabled = busy || !latestAemu
  if (redirectBtn) redirectBtn.disabled = busy || !latestAemu
  if (clarifyBtn) clarifyBtn.disabled = busy || !latestAemu
}

function buildFocusSummary(
  filePaths: string[],
  logPaths: string[],
  selectedFilePath: string | null,
  selectedLogPath: string | null
): string {
  const fileClause = selectedFilePath
    ? `${selectedFilePath} is the current examination target and the most likely file Inner Being would edit on this turn.`
    : 'No file is selected yet, so Inner Being can inspect the wider workspace but does not yet have a direct edit target.'
  const logClause = selectedLogPath
    ? `${selectedLogPath} is the active log context.`
    : 'No log is selected yet.'
  return `${fileClause} ${logClause} Inner Being can still reason across ${filePaths.length} visible code files and ${logPaths.length} visible logs from this workspace snapshot.`
}

export function openInnerBeingPage(): void {
  bindControls()
  getPage()?.classList.add('open')
}

export function closeInnerBeingPage(): void {
  getPage()?.classList.remove('open')
}

export function setInnerBeingActionHandler(cb: (action: InnerBeingAction) => void): void {
  onAction = cb
}

export function setInnerBeingFileSelectHandler(cb: (filePath: string) => void): void {
  onFileSelect = cb
}

export function setInnerBeingLogSelectHandler(cb: (logPath: string) => void): void {
  onLogSelect = cb
}

export function getInnerBeingInputValue(): string {
  return getInput()?.value.trim() ?? ''
}

export function clearInnerBeingInput(): void {
  const input = getInput()
  if (!input) return
  input.value = ''
}

export function getInnerBeingBriefValue(): string {
  return getBriefInput()?.value.trim() ?? ''
}

export function getInnerBeingHealingEnabledValue(): boolean {
  return getHealingToggle()?.checked !== false
}

export function renderInnerBeingWorkspace(
  memories: AemuMemories,
  options: {
    filePaths: string[]
    logPaths: string[]
    selectedFilePath: string | null
    selectedLogPath: string | null
    fileContent: string
    logContent: string
    busy: boolean
    busyMode: 'idle' | 'refresh' | 'chat'
  }
): void {
  bindControls()

  const status = document.getElementById('innerBeingStatusText')
  const discernmentMeta = document.getElementById('innerBeingDiscernmentMeta')
  const runtimeMeta = document.getElementById('innerBeingRuntimeMeta')
  const focusSummary = document.getElementById('innerBeingFocusSummary')
  const workspaceCounts = document.getElementById('innerBeingWorkspaceCounts')
  const codeMeta = document.getElementById('innerBeingCodeMeta')
  const logMeta = document.getElementById('innerBeingLogMeta')
  const codeDisplay = document.getElementById('innerBeingCodeDisplay')
  const logDisplay = document.getElementById('innerBeingLogDisplay')
  const input = getInput()
  const briefInput = getBriefInput()
  const healingToggle = getHealingToggle()
  const sendButton = document.getElementById('innerBeingSendBtn') as HTMLButtonElement | null
  const refreshButton = document.getElementById('innerBeingRefreshBtn') as HTMLButtonElement | null
  const pageRefreshButton = document.getElementById('innerBeingPageRefreshBtn') as HTMLButtonElement | null
  const saveBriefButton = document.getElementById('innerBeingSaveBriefBtn') as HTMLButtonElement | null
  const continueButton = document.getElementById('innerBeingContinueBtn') as HTMLButtonElement | null
  const redirectButton = document.getElementById('innerBeingRedirectBtn') as HTMLButtonElement | null
  const clarifyButton = document.getElementById('innerBeingClarifyBtn') as HTMLButtonElement | null

  if (status) {
    status.textContent = options.busy
      ? options.busyMode === 'refresh'
        ? 'Refreshing file and log context from the local project.'
        : 'Contemplating the coding context and testing whether an edit is safe enough to apply.'
      : getIdleStatus(memories)
  }

  if (discernmentMeta) {
    discernmentMeta.textContent = buildDiscernmentMeta(memories)
  }

  if (runtimeMeta) {
    runtimeMeta.textContent = buildRuntimeMeta(memories)
  }

  if (focusSummary) {
    focusSummary.textContent = buildFocusSummary(
      options.filePaths,
      options.logPaths,
      options.selectedFilePath,
      options.selectedLogPath
    )
  }

  if (workspaceCounts) {
    workspaceCounts.textContent = `${options.filePaths.length} code files visible · ${options.logPaths.length} logs visible`
  }

  if (input) input.disabled = options.busy
  if (briefInput) {
    if (briefInput.value !== memories.innerBeing.coCreationBrief) {
      briefInput.value = memories.innerBeing.coCreationBrief
      autoResize(briefInput)
    }
    briefInput.disabled = options.busy
  }
  if (healingToggle) {
    healingToggle.checked = memories.innerBeing.caduceusHealingEnabled
    healingToggle.disabled = options.busy
  }
  if (sendButton) sendButton.disabled = options.busy
  if (refreshButton) refreshButton.disabled = options.busy
  if (pageRefreshButton) pageRefreshButton.disabled = options.busy
  if (saveBriefButton) saveBriefButton.disabled = options.busy
  if (continueButton) continueButton.disabled = options.busy
  if (redirectButton) redirectButton.disabled = options.busy
  if (clarifyButton) clarifyButton.disabled = options.busy

  renderChat(memories.innerBeing.chatHistory, options.busyMode === 'chat')
  renderReplyChoices(memories.innerBeing.chatHistory, options.busy)
  renderLearningNotes(memories.innerBeing.learningNotes)
  renderActionLogs(memories.innerBeing.actionLogs)

  syncPicker('innerBeingFileSelect', 'innerBeingFileOptions', options.filePaths, options.selectedFilePath, 'No code files found')
  syncPicker('innerBeingLogSelect', 'innerBeingLogOptions', options.logPaths, options.selectedLogPath, 'No log files found')

  if (codeMeta) {
    codeMeta.textContent = options.selectedFilePath
      ? `${options.selectedFilePath} · ${options.fileContent.split('\n').length} lines`
      : 'Select a file to inspect its current code.'
  }
  if (logMeta) {
    logMeta.textContent = options.selectedLogPath
      ? `${options.selectedLogPath} · showing recent log text`
      : 'No log file selected. If no logs exist yet, action-log memory below will still record Inner Being events.'
  }

  if (codeDisplay) {
    codeDisplay.textContent = options.fileContent || '// No file content loaded yet.'
  }
  if (logDisplay) {
    logDisplay.textContent = options.logContent || '// No log content loaded yet.'
  }
}
