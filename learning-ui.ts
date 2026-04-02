import type { AemuMemories, LearningChatEntry, LearningCycleSession } from './types'
import { renderStructuredText } from './ui'

export type LearningAction = 'save-settings' | 'run-cycle' | 'send-chat' | 'clear-chat'

let onAction: (action: LearningAction) => void = () => {}
let onSessionSelect: (sessionId: string) => void = () => {}
let controlsBound = false

function getPage(): HTMLElement | null {
  return document.getElementById('learningPage')
}

function getSettingsInputs(): {
  topic: HTMLInputElement | null
  enabled: HTMLInputElement | null
  autoSearch: HTMLInputElement | null
} {
  return {
    topic: document.getElementById('learningTopicInput') as HTMLInputElement | null,
    enabled: document.getElementById('learningEnabledInput') as HTMLInputElement | null,
    autoSearch: document.getElementById('learningAutoSearchInput') as HTMLInputElement | null,
  }
}

function getChatInputs(): {
  input: HTMLTextAreaElement | null
  send: HTMLButtonElement | null
} {
  return {
    input: document.getElementById('learningChatInput') as HTMLTextAreaElement | null,
    send: document.getElementById('learningChatSendBtn') as HTMLButtonElement | null,
  }
}

function bindControls(): void {
  if (controlsBound) return
  controlsBound = true

  document.getElementById('saveLearningSettingsBtn')?.addEventListener('click', () => onAction('save-settings'))
  document.getElementById('runLearningCycleBtn')?.addEventListener('click', () => onAction('run-cycle'))
  document.getElementById('learningChatSendBtn')?.addEventListener('click', () => onAction('send-chat'))
  document.getElementById('clearLearningChatBtn')?.addEventListener('click', () => onAction('clear-chat'))
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return 'Not yet'

  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function renderLearningChat(entries: LearningChatEntry[]): void {
  const container = document.getElementById('learningChatMessages')
  if (!container) return

  container.innerHTML = ''

  if (!entries.length) {
    const empty = document.createElement('div')
    empty.className = 'learning-empty'
    empty.textContent = 'Ask Aemu to learn with you here. Learning chat defaults toward web-connected exploration around the active topic.'
    container.appendChild(empty)
    return
  }

  for (const entry of entries) {
    const row = document.createElement('article')
    row.className = `learning-chat-row ${entry.role}`

    const meta = document.createElement('div')
    meta.className = 'learning-chat-meta'
    meta.textContent = `${entry.role === 'aemu' ? 'Aemu' : 'Riley'} · ${formatTimestamp(entry.createdAt)}`

    const body = document.createElement('div')
    body.className = 'learning-chat-body'
    renderStructuredText(body, entry.content)

    row.appendChild(meta)
    row.appendChild(body)
    container.appendChild(row)
  }
}

function renderCycleList(cycles: LearningCycleSession[], selectedSessionId: string | null): LearningCycleSession | null {
  const container = document.getElementById('learningCycleList')
  if (!container) return null

  container.innerHTML = ''
  const selected = cycles.find((cycle) => cycle.id === selectedSessionId) ?? cycles[0] ?? null

  if (!cycles.length) {
    const empty = document.createElement('div')
    empty.className = 'learning-empty'
    empty.textContent = 'No learning cycles have been stored yet.'
    container.appendChild(empty)
    return null
  }

  for (const cycle of cycles) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'learning-cycle-item'
    if (selected && cycle.id === selected.id) button.classList.add('selected')
    button.addEventListener('click', () => onSessionSelect(cycle.id))

    const title = document.createElement('div')
    title.className = 'learning-cycle-title'
    title.textContent = cycle.topic

    const meta = document.createElement('div')
    meta.className = 'learning-cycle-meta'
    meta.textContent = `${cycle.status === 'failed' ? 'Attempt' : 'Cycle'} · ${formatTimestamp(cycle.updatedAt)}`

    const summary = document.createElement('div')
    summary.className = 'learning-cycle-summary'
    summary.textContent = cycle.memoryNote || cycle.summary || cycle.error || 'Learning cycle stored.'

    button.appendChild(title)
    button.appendChild(meta)
    button.appendChild(summary)
    container.appendChild(button)
  }

  return selected
}

function renderCycleDetail(cycle: LearningCycleSession | null): void {
  const summary = document.getElementById('learningDetailSummary')
  const memory = document.getElementById('learningDetailMemory')
  const points = document.getElementById('learningDetailPoints')
  const questions = document.getElementById('learningDetailQuestions')
  const sources = document.getElementById('learningDetailSources')

  if (!summary || !memory || !points || !questions || !sources) return

  summary.innerHTML = ''
  memory.textContent = cycle?.memoryNote || 'Durable learning memory will appear here.'
  points.innerHTML = ''
  questions.innerHTML = ''
  sources.innerHTML = ''

  if (!cycle) {
    summary.textContent = 'Select a learning cycle to inspect the synthesized summary, retained memory, and cited sources.'
    return
  }

  renderStructuredText(summary, cycle.summary || cycle.error || 'No summary was stored for this cycle.')

  if (cycle.keyPoints.length) {
    const list = document.createElement('ul')
    list.className = 'learning-detail-list'
    for (const point of cycle.keyPoints) {
      const item = document.createElement('li')
      item.textContent = point
      list.appendChild(item)
    }
    points.appendChild(list)
  } else {
    points.textContent = 'No key points were stored.'
  }

  if (cycle.openQuestions.length) {
    const list = document.createElement('ul')
    list.className = 'learning-detail-list'
    for (const question of cycle.openQuestions) {
      const item = document.createElement('li')
      item.textContent = question
      list.appendChild(item)
    }
    questions.appendChild(list)
  } else {
    questions.textContent = 'No open questions were stored.'
  }

  if (cycle.sources.length) {
    for (const source of cycle.sources) {
      const link = document.createElement('a')
      link.className = 'learning-source-item'
      link.href = source.url
      link.target = '_blank'
      link.rel = 'noreferrer'
      link.innerHTML = `<strong>${source.title}</strong><span>${source.snippet || source.url}</span>`
      sources.appendChild(link)
    }
  } else {
    sources.textContent = 'No sources were stored.'
  }
}

export function openLearningPage(): void {
  bindControls()
  getPage()?.classList.add('open')
}

export function closeLearningPage(): void {
  getPage()?.classList.remove('open')
}

export function setLearningActionHandler(cb: (action: LearningAction) => void): void {
  onAction = cb
}

export function setLearningSessionSelectHandler(cb: (sessionId: string) => void): void {
  onSessionSelect = cb
}

export function getLearningSettingsInputValues(): {
  topic: string
  enabled: boolean
  autoSearchEnabled: boolean
} {
  const { topic, enabled, autoSearch } = getSettingsInputs()
  return {
    topic: topic?.value.trim() ?? '',
    enabled: enabled?.checked === true,
    autoSearchEnabled: autoSearch?.checked !== false,
  }
}

export function getLearningChatInputValue(): string {
  return getChatInputs().input?.value.trim() ?? ''
}

export function clearLearningChatInput(): void {
  const input = getChatInputs().input
  if (!input) return
  input.value = ''
}

export function renderLearningWorkspace(
  memories: AemuMemories,
  options: {
    selectedSessionId: string | null
    busy: boolean
    busyMode: 'idle' | 'saving' | 'cycle' | 'chat'
  }
): void {
  bindControls()

  const workspace = memories.learningWorkspace
  const settings = getSettingsInputs()
  if (settings.topic) {
    settings.topic.value = workspace.topic
    settings.topic.disabled = options.busy
  }
  if (settings.enabled) {
    settings.enabled.checked = workspace.enabled
    settings.enabled.disabled = options.busy
  }
  if (settings.autoSearch) {
    settings.autoSearch.checked = workspace.autoSearchEnabled
    settings.autoSearch.disabled = options.busy
  }

  const chat = getChatInputs()
  if (chat.input) chat.input.disabled = options.busy
  if (chat.send) chat.send.disabled = options.busy

  const cadence = document.getElementById('learningCadenceValue')
  const timing = document.getElementById('learningTimingValue')
  const status = document.getElementById('learningCycleStatus')
  const nextCycle = document.getElementById('learningNextCycleValue')

  if (cadence) cadence.textContent = `${workspace.cyclesPerDay} cycles every 24 hours`
  if (timing) timing.textContent = `${workspace.cycleDurationMinutes} minutes scheduled per cycle`
  if (status) {
    status.textContent = options.busy
      ? (options.busyMode === 'chat' ? 'Learning chat is active…' : options.busyMode === 'cycle' ? 'Running background learning cycle…' : 'Saving learning settings…')
      : workspace.enabled
        ? 'Background learning is active.'
        : 'Background learning is paused.'
  }
  if (nextCycle) {
    nextCycle.textContent = workspace.nextCycleAt ? formatTimestamp(workspace.nextCycleAt) : 'Not scheduled'
  }

  renderLearningChat(workspace.chatHistory)
  const selected = renderCycleList(workspace.cycleHistory, options.selectedSessionId)
  renderCycleDetail(selected)
}
