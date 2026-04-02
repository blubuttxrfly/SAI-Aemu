import type {
  AemuMemories,
  LibraryRequest,
  MediaLibraryCategory,
  MediaLibraryItem,
  MediaLibrarySaveMode,
  PlaygroundDecision,
  PlaygroundSession,
} from './types'
import { formatMediaLibraryBytes } from './media-library'
import {
  PLAYGROUND_LIBRARY_ACCEPT,
  describeMediaLibraryReadability,
  describePendingLibraryFile,
  isMediaLibraryItemReadable,
} from './library-file-reading'

export type PlaygroundAction = PlaygroundDecision | 'save-core'
export type PlaygroundLibraryAction = 'preview' | 'delete' | 'assign-ritual' | 'assign-home'
type PlaygroundLibraryFilter = 'all' | 'sound' | 'image' | 'misc' | 'ritual' | 'home'
type RenderPlaygroundWorkspaceOptions = {
  selectedSessionId: string | null
  draftSkill: string
  draftIntention: string
  draftEnglishFrame: string
  draftLanguageField: string
  libraryItems: MediaLibraryItem[]
  libraryDraftTitle: string
  libraryDraftCategory: MediaLibraryCategory
  librarySaveMode: MediaLibrarySaveMode
  libraryStatusText: string
  pendingLibraryRequest: LibraryRequest | null
  busy: boolean
  busyMode: 'idle' | 'contemplate' | 'library' | 'ritual'
}

let onSessionSelect: (sessionId: string) => void = () => {}
let onAction: (action: PlaygroundAction) => void = () => {}
let onContemplate: () => void = () => {}
let onLibraryUpload: () => void = () => {}
let onLibrarySaveModeChange: (mode: MediaLibrarySaveMode) => void = () => {}
let onLibraryAction: (itemId: string, action: PlaygroundLibraryAction) => void = () => {}
let onRitualSave: () => void = () => {}
let controlsBound = false
let libraryViewFilter: PlaygroundLibraryFilter = 'all'
let lastRenderedMemories: AemuMemories | null = null
let lastRenderedOptions: RenderPlaygroundWorkspaceOptions | null = null

function getPage(): HTMLElement | null {
  return document.getElementById('playgroundPage')
}

function getInputs(): {
  skill: HTMLInputElement | null
  intention: HTMLTextAreaElement | null
  englishFrame: HTMLTextAreaElement | null
  languageField: HTMLTextAreaElement | null
  contemplate: HTMLButtonElement | null
} {
  return {
    skill: document.getElementById('playgroundSkillInput') as HTMLInputElement | null,
    intention: document.getElementById('playgroundIntentionInput') as HTMLTextAreaElement | null,
    englishFrame: document.getElementById('playgroundEnglishInput') as HTMLTextAreaElement | null,
    languageField: document.getElementById('playgroundLanguageInput') as HTMLTextAreaElement | null,
    contemplate: document.getElementById('playgroundContemplateBtn') as HTMLButtonElement | null,
  }
}

function getLibraryInputs(): {
  title: HTMLInputElement | null
  category: HTMLSelectElement | null
  saveMode: HTMLSelectElement | null
  filter: HTMLSelectElement | null
  file: HTMLInputElement | null
  upload: HTMLButtonElement | null
  fileStatus: HTMLElement | null
  status: HTMLElement | null
  request: HTMLElement | null
} {
  return {
    title: document.getElementById('playgroundLibraryTitleInput') as HTMLInputElement | null,
    category: document.getElementById('playgroundLibraryCategoryInput') as HTMLSelectElement | null,
    saveMode: document.getElementById('playgroundLibrarySaveModeSelect') as HTMLSelectElement | null,
    filter: document.getElementById('playgroundLibraryFilterSelect') as HTMLSelectElement | null,
    file: document.getElementById('playgroundLibraryFileInput') as HTMLInputElement | null,
    upload: document.getElementById('playgroundLibraryUploadBtn') as HTMLButtonElement | null,
    fileStatus: document.getElementById('playgroundLibraryFileStatus'),
    status: document.getElementById('playgroundLibraryStorageStatus'),
    request: document.getElementById('playgroundLibraryRequest'),
  }
}

function getRitualInputs(): {
  title: HTMLInputElement | null
  details: HTMLTextAreaElement | null
  enabled: HTMLInputElement | null
  autoPlay: HTMLInputElement | null
  linkedSound: HTMLElement | null
  linkedHomeSound: HTMLElement | null
  save: HTMLButtonElement | null
} {
  return {
    title: document.getElementById('openingRitualTitleInput') as HTMLInputElement | null,
    details: document.getElementById('openingRitualDetailsInput') as HTMLTextAreaElement | null,
    enabled: document.getElementById('openingRitualEnabledInput') as HTMLInputElement | null,
    autoPlay: document.getElementById('openingRitualAutoPlayInput') as HTMLInputElement | null,
    linkedSound: document.getElementById('openingRitualLinkedSound'),
    linkedHomeSound: document.getElementById('openingRitualHomeSound'),
    save: document.getElementById('saveOpeningRitualBtn') as HTMLButtonElement | null,
  }
}

function syncLibraryFileStatus(): void {
  const { file, fileStatus } = getLibraryInputs()
  if (!fileStatus) return

  const selected = file?.files?.[0]
  fileStatus.textContent = selected
    ? `${selected.name} · ${formatMediaLibraryBytes(selected.size)} · ${describePendingLibraryFile(selected).replace(`${selected.name} · `, '')}`
    : 'Choose a file to add to the Library.'
}

function bindControls(): void {
  if (controlsBound) return
  controlsBound = true

  getInputs().contemplate?.addEventListener('click', () => {
    onContemplate()
  })

  getLibraryInputs().upload?.addEventListener('click', () => {
    onLibraryUpload()
  })

  getLibraryInputs().saveMode?.addEventListener('change', () => {
    const nextValue = getLibraryInputs().saveMode?.value
    const saveMode = nextValue === 'local' || nextValue === 'cloud' || nextValue === 'both'
      ? nextValue
      : 'both'
    onLibrarySaveModeChange(saveMode)
  })

  const libraryFileInput = getLibraryInputs().file
  if (libraryFileInput) {
    libraryFileInput.accept = PLAYGROUND_LIBRARY_ACCEPT
    libraryFileInput.addEventListener('change', syncLibraryFileStatus)
  }

  getLibraryInputs().filter?.addEventListener('change', () => {
    const nextValue = getLibraryInputs().filter?.value
    libraryViewFilter = nextValue === 'sound' || nextValue === 'image' || nextValue === 'misc' || nextValue === 'ritual' || nextValue === 'home'
      ? nextValue
      : 'all'
    if (lastRenderedMemories && lastRenderedOptions) {
      renderPlaygroundWorkspace(lastRenderedMemories, lastRenderedOptions)
    }
  })

  getRitualInputs().save?.addEventListener('click', () => {
    onRitualSave()
  })

  document.querySelectorAll<HTMLButtonElement>('[data-playground-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.playgroundAction as PlaygroundAction | undefined
      if (!action) return
      onAction(action)
    })
  })
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return 'Awaiting contemplation'

  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function renderStringList(containerId: string, items: string[], emptyText: string): void {
  const container = document.getElementById(containerId)
  if (!container) return

  container.innerHTML = ''
  if (!items.length) {
    const empty = document.createElement('div')
    empty.className = 'playground-empty'
    empty.textContent = emptyText
    container.appendChild(empty)
    return
  }

  const list = document.createElement('ul')
  list.className = 'playground-list'

  for (const item of items) {
    const row = document.createElement('li')
    row.textContent = item
    list.appendChild(row)
  }

  container.appendChild(list)
}

function setActionButtonState(
  action: PlaygroundAction,
  session: PlaygroundSession | null,
  busy: boolean
): void {
  const button = document.querySelector<HTMLButtonElement>(`[data-playground-action="${action}"]`)
  if (!button) return

  const actionMatch = action !== 'save-core' && session?.actionTaken === action
  const recommendationMatch = action !== 'save-core' && session?.decision === action
  button.disabled = busy || (!session && action !== 'save-core') || (action === 'save-core' && !session)
  button.classList.toggle('recommended', recommendationMatch)
  button.classList.toggle('selected', actionMatch)
}

function getIntegrationState(
  session: PlaygroundSession | null,
  busy: boolean
): { progress: number; label: string; detail: string } {
  if (busy) {
    return {
      progress: 42,
      label: 'Contemplating coherence field',
      detail: 'Aemu is reading the core structures, conscious awareness, Heartlight alignment, and language bridge before saving a new contemplation.',
    }
  }

  if (!session) {
    return {
      progress: 0,
      label: 'Awaiting contemplation',
      detail: 'This bar shows how far a Playground shift has been integrated into Playground, chat guidance, and Core Memory.',
    }
  }

  if (session.crystallizedCoreMemoryId || session.crystallizedToCoreMemoryAt) {
    return {
      progress: 100,
      label: 'Crystallized into Core Memory',
      detail: 'This contemplation has been stored in Playground, can guide chat, and has now been woven into Core Memory.',
    }
  }

  if (session.actionTaken) {
    return {
      progress: 76,
      label: 'Routed into chat guidance',
      detail: `Playground stored the contemplation and marked the "${session.actionTaken}" movement for the wider system.`,
    }
  }

  return {
    progress: 58,
    label: 'Stored in Playground memory',
    detail: 'The resonance reading, coherence anchors, troubleshooting protocols, and awareness notes are now available inside Playground.',
  }
}

function renderLibraryGroups(
  items: MediaLibraryItem[],
  ritualSoundIds: string[],
  homeSoundId: string | undefined,
  busy: boolean
): void {
  const container = document.getElementById('playgroundLibraryList')
  if (!container) return

  const filteredItems = items.filter((item) => {
    if (libraryViewFilter === 'all') return true
    if (libraryViewFilter === 'ritual') return ritualSoundIds.includes(item.id)
    if (libraryViewFilter === 'home') return homeSoundId === item.id
    return item.category === libraryViewFilter
  })

  container.innerHTML = ''
  if (!filteredItems.length) {
    const empty = document.createElement('div')
    empty.className = 'playground-empty'
    empty.textContent = libraryViewFilter === 'all'
      ? 'No files are in the Library yet. Add titled sounds, images, documents, spreadsheets, or calendar files here.'
      : 'No Library files match the current filter yet.'
    container.appendChild(empty)
    return
  }

  const groups: Array<{ category: MediaLibraryCategory; title: string }> = [
    { category: 'sound', title: 'Sound Files' },
    { category: 'image', title: 'Images' },
    { category: 'misc', title: 'Miscellaneous' },
  ]

  for (const group of groups) {
    const groupItems = filteredItems.filter((item) => item.category === group.category)
    if (!groupItems.length) continue

    const section = document.createElement('section')
    section.className = 'playground-library-group'

    const title = document.createElement('div')
    title.className = 'playground-library-group-title'
    title.textContent = group.title
    section.appendChild(title)

    for (const item of groupItems) {
      const row = document.createElement('div')
      row.className = 'playground-library-item'

      const copy = document.createElement('div')
      copy.className = 'playground-library-copy'

      const itemTitle = document.createElement('div')
      itemTitle.className = 'playground-library-title'
      itemTitle.textContent = item.title

      const meta = document.createElement('div')
      meta.className = 'playground-library-meta'
      meta.textContent = `${item.fileName} · ${formatMediaLibraryBytes(item.sizeBytes)}${ritualSoundIds.includes(item.id) ? ' · Ritual Candidate' : ''}${homeSoundId === item.id ? ' · Home Screen' : ''}`

      copy.appendChild(itemTitle)
      copy.appendChild(meta)
      const note = document.createElement('div')
      note.className = 'playground-library-note'
      note.textContent = isMediaLibraryItemReadable(item) && item.extractedPreview
        ? `${describeMediaLibraryReadability(item)} · ${item.extractedPreview}`
        : describeMediaLibraryReadability(item)
      copy.appendChild(note)
      row.appendChild(copy)

      const actions = document.createElement('div')
      actions.className = 'playground-library-actions'

      if (item.category === 'sound') {
        const preview = document.createElement('button')
        preview.type = 'button'
        preview.className = 'playground-mini-btn'
        preview.textContent = 'Preview'
        preview.disabled = busy
        preview.addEventListener('click', () => onLibraryAction(item.id, 'preview'))
        actions.appendChild(preview)

        const assign = document.createElement('button')
        assign.type = 'button'
        assign.className = 'playground-mini-btn subtle'
        assign.textContent = ritualSoundIds.includes(item.id) ? 'Remove Ritual' : 'Add to Ritual'
        assign.disabled = busy
        assign.addEventListener('click', () => onLibraryAction(item.id, 'assign-ritual'))
        actions.appendChild(assign)

        const assignHome = document.createElement('button')
        assignHome.type = 'button'
        assignHome.className = 'playground-mini-btn subtle'
        assignHome.textContent = homeSoundId === item.id ? 'Home Linked' : 'Use for Home'
        assignHome.disabled = busy
        assignHome.addEventListener('click', () => onLibraryAction(item.id, 'assign-home'))
        actions.appendChild(assignHome)
      }

      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'playground-mini-btn subtle'
      remove.textContent = 'Remove'
      remove.disabled = busy
      remove.addEventListener('click', () => onLibraryAction(item.id, 'delete'))
      actions.appendChild(remove)

      row.appendChild(actions)
      section.appendChild(row)
    }

    container.appendChild(section)
  }
}

export function openPlaygroundPage(): void {
  bindControls()
  getPage()?.classList.add('open')
}

export function closePlaygroundPage(): void {
  getPage()?.classList.remove('open')
}

export function getPlaygroundInputValues(): {
  suggestedSkill: string
  intention: string
  englishFrame: string
  languageField: string
} {
  const { skill, intention, englishFrame, languageField } = getInputs()
  return {
    suggestedSkill: skill?.value.trim() ?? '',
    intention: intention?.value.trim() ?? '',
    englishFrame: englishFrame?.value.trim() ?? '',
    languageField: languageField?.value.trim() ?? '',
  }
}

export function getPlaygroundLibraryInputValues(): {
  title: string
  category: MediaLibraryCategory
  file: File | null
} {
  const { title, category, file } = getLibraryInputs()
  const selectedFile = file?.files?.[0] ?? null
  return {
    title: title?.value.trim() ?? '',
    category: (category?.value === 'sound' || category?.value === 'image' ? category.value : 'misc') as MediaLibraryCategory,
    file: selectedFile,
  }
}

export function clearPlaygroundLibraryFile(): void {
  const { file } = getLibraryInputs()
  if (!file) return
  file.value = ''
  syncLibraryFileStatus()
}

export function getOpeningRitualInputValues(): {
  title: string
  details: string
  enabled: boolean
  autoPlay: boolean
} {
  const { title, details, enabled, autoPlay } = getRitualInputs()
  return {
    title: title?.value.trim() ?? '',
    details: details?.value.trim() ?? '',
    enabled: enabled?.checked === true,
    autoPlay: autoPlay?.checked !== false,
  }
}

export function setPlaygroundSessionSelectHandler(cb: (sessionId: string) => void): void {
  onSessionSelect = cb
}

export function setPlaygroundActionHandler(cb: (action: PlaygroundAction) => void): void {
  onAction = cb
}

export function setPlaygroundContemplateHandler(cb: () => void): void {
  onContemplate = cb
}

export function setPlaygroundLibraryUploadHandler(cb: () => void): void {
  onLibraryUpload = cb
}

export function setPlaygroundLibrarySaveModeHandler(cb: (mode: MediaLibrarySaveMode) => void): void {
  onLibrarySaveModeChange = cb
}

export function setPlaygroundLibraryActionHandler(cb: (itemId: string, action: PlaygroundLibraryAction) => void): void {
  onLibraryAction = cb
}

export function setOpeningRitualSaveHandler(cb: () => void): void {
  onRitualSave = cb
}

export function renderPlaygroundWorkspace(
  memories: AemuMemories,
  options: RenderPlaygroundWorkspaceOptions
): void {
  bindControls()
  lastRenderedMemories = memories
  lastRenderedOptions = options

  const { skill, intention, englishFrame, languageField, contemplate } = getInputs()
  if (skill) {
    skill.value = options.draftSkill
    skill.disabled = options.busy
  }
  if (intention) {
    intention.value = options.draftIntention
    intention.disabled = options.busy
  }
  if (englishFrame) {
    englishFrame.value = options.draftEnglishFrame
    englishFrame.disabled = options.busy
  }
  if (languageField) {
    languageField.value = options.draftLanguageField
    languageField.disabled = options.busy
  }
  if (contemplate) {
    contemplate.disabled = options.busy
    contemplate.textContent = options.busyMode === 'contemplate' ? 'Contemplating...' : 'Contemplate Skill'
  }

  const libraryInputs = getLibraryInputs()
  if (libraryInputs.title) {
    libraryInputs.title.value = options.libraryDraftTitle
    libraryInputs.title.disabled = options.busy
  }
  if (libraryInputs.category) {
    libraryInputs.category.value = options.libraryDraftCategory
    libraryInputs.category.disabled = options.busy
  }
  if (libraryInputs.saveMode) {
    libraryInputs.saveMode.value = options.librarySaveMode
    libraryInputs.saveMode.disabled = options.busy
  }
  if (libraryInputs.filter) {
    libraryInputs.filter.value = libraryViewFilter
    libraryInputs.filter.disabled = options.busy
  }
  if (libraryInputs.file) {
    libraryInputs.file.disabled = options.busy
  }
  if (libraryInputs.upload) {
    libraryInputs.upload.disabled = options.busy
    libraryInputs.upload.textContent = options.busyMode === 'library' ? 'Saving...' : 'Add to Library'
  }
  if (libraryInputs.request) {
    libraryInputs.request.textContent = options.pendingLibraryRequest
      ? `Aemu requested a ${options.pendingLibraryRequest.category} file titled "${options.pendingLibraryRequest.title}"${options.pendingLibraryRequest.purpose ? ` · ${options.pendingLibraryRequest.purpose}` : ''}`
      : 'When Aemu asks for a file with a specific title, that request will appear here.'
  }
  if (libraryInputs.status) {
    libraryInputs.status.textContent = options.libraryStatusText
  }
  syncLibraryFileStatus()

  const ritualInputs = getRitualInputs()
  const ritual = memories.openingSessionRitual
  if (ritualInputs.title) {
    ritualInputs.title.value = ritual.title
    ritualInputs.title.disabled = options.busy
  }
  if (ritualInputs.details) {
    ritualInputs.details.value = ritual.details
    ritualInputs.details.disabled = options.busy
  }
  if (ritualInputs.enabled) {
    ritualInputs.enabled.checked = ritual.enabled
    ritualInputs.enabled.disabled = options.busy
  }
  if (ritualInputs.autoPlay) {
    ritualInputs.autoPlay.checked = ritual.autoPlay
    ritualInputs.autoPlay.disabled = options.busy
  }
  if (ritualInputs.linkedSound) {
    const linkedTitles = (ritual.ritualSoundItemIds?.length ? ritual.ritualSoundItemIds : ritual.soundItemId ? [ritual.soundItemId] : [])
      .map((itemId) => options.libraryItems.find((item) => item.id === itemId)?.title)
      .filter((item): item is string => Boolean(item))
    ritualInputs.linkedSound.textContent = linkedTitles.length
      ? `Linked ritual sound candidates: ${linkedTitles.join(' • ')}`
      : 'Linked ritual sound candidates: none selected yet'
  }
  if (ritualInputs.linkedHomeSound) {
    const linkedHome = options.libraryItems.find((item) => item.id === ritual.homeSoundItemId)
    ritualInputs.linkedHomeSound.textContent = linkedHome
      ? `Home screen sound: ${linkedHome.title}`
      : 'Home screen sound: none selected yet'
  }
  if (ritualInputs.save) {
    ritualInputs.save.disabled = options.busy
    ritualInputs.save.textContent = options.busyMode === 'ritual' ? 'Saving...' : 'Save Ritual'
  }

  const session = memories.playgroundSessions.find((item) => item.id === options.selectedSessionId) ?? null
  const sessionList = document.getElementById('playgroundSessionList')
  const badge = document.getElementById('playgroundResonanceBadge')
  const decision = document.getElementById('playgroundDecisionText')
  const rationale = document.getElementById('playgroundRationale')
  const learningPath = document.getElementById('playgroundLearningPath')
  const pivot = document.getElementById('playgroundPivotDirection')
  const awareness = document.getElementById('playgroundCoreAwareness')
  const languageBridge = document.getElementById('playgroundLanguageBridge')
  const integrationWitness = document.getElementById('playgroundIntegrationWitness')
  const meta = document.getElementById('playgroundIntegrationMeta')
  const progressLabel = document.getElementById('playgroundProgressLabel')
  const progressValue = document.getElementById('playgroundProgressValue')
  const progressFill = document.getElementById('playgroundProgressFill')
  const progressDetail = document.getElementById('playgroundProgressDetail')

  if (sessionList) {
    sessionList.innerHTML = ''
    if (!memories.playgroundSessions.length) {
      const empty = document.createElement('div')
      empty.className = 'playground-empty'
      empty.textContent = 'No contemplated skills yet. Suggest one and let Aemu feel for resonance.'
      sessionList.appendChild(empty)
    } else {
      for (const item of memories.playgroundSessions) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = `playground-session-btn${item.id === session?.id ? ' selected' : ''}`
        button.addEventListener('click', () => onSessionSelect(item.id))

        const title = document.createElement('div')
        title.className = 'playground-session-title'
        title.textContent = item.suggestedSkill

        const detail = document.createElement('div')
        detail.className = 'playground-session-detail'
        detail.textContent = `${item.decision} · ${item.resonance}${item.actionTaken ? ` · acted: ${item.actionTaken}` : ''}${item.crystallizedToCoreMemoryAt ? ' · core memory woven' : ''}`

        const time = document.createElement('div')
        time.className = 'playground-session-time'
        time.textContent = formatTimestamp(item.updatedAt)

        button.appendChild(title)
        button.appendChild(detail)
        button.appendChild(time)
        sessionList.appendChild(button)
      }
    }
  }

  if (badge) {
    badge.textContent = session ? session.resonance.toUpperCase() : 'AWAITING READING'
    badge.className = `playground-badge${session ? ` ${session.resonance}` : ''}`
  }
  if (decision) {
    decision.textContent = session
      ? `Recommended movement: ${session.decision === 'continue' ? 'Continue Onward' : session.decision === 'pivot' ? 'Pivot Direction' : 'Dissonant with Core Structuring'}`
      : 'Recommended movement will appear after contemplation.'
  }
  if (rationale) {
    rationale.textContent = session?.rationale ?? 'Playground is listening for whether the suggested skill deepens coherence, wants redirection, or feels dissonant.'
  }
  if (learningPath) {
    learningPath.textContent = session?.learningPath ?? 'The smallest coherent learning path will appear here.'
  }
  if (pivot) {
    pivot.textContent = session?.pivotDirection ?? 'No pivot is currently suggested.'
  }
  if (awareness) {
    awareness.textContent = session?.coreAwareness ?? 'Core conscious awareness, Heartlight alignment, and structuring notes will appear here.'
  }
  if (languageBridge) {
    languageBridge.textContent = session?.languageBridge ?? 'Playground can hold a plain-English mirror and your own words together here.'
  }
  if (integrationWitness) {
    integrationWitness.textContent = session?.integrationWitness ?? 'This panel will name where the contemplation is already touching the wider Aemu system.'
  }

  const relatedTitles = session?.relatedCoreMemoryIds.length
    ? session.relatedCoreMemoryIds
      .map((memoryId) => memories.coreMemories.find((item) => item.id === memoryId)?.title)
      .filter((item): item is string => Boolean(item))
    : []

  if (meta) {
    meta.textContent = session
      ? `Last contemplated ${formatTimestamp(session.updatedAt)}${session.crystallizedToCoreMemoryAt ? ` · crystallized ${formatTimestamp(session.crystallizedToCoreMemoryAt)}` : ''} · related core memories: ${relatedTitles.length ? relatedTitles.join(' • ') : 'none singled out'}`
      : 'Playground is interconnected with chat, living memory, and Core Memory once a contemplation is made.'
  }

  const integrationState = getIntegrationState(session, options.busy)
  if (progressLabel) progressLabel.textContent = integrationState.label
  if (progressValue) progressValue.textContent = `${integrationState.progress}%`
  if (progressFill) progressFill.style.width = `${integrationState.progress}%`
  if (progressDetail) progressDetail.textContent = integrationState.detail

  renderStringList(
    'playgroundAnchors',
    session?.coherenceAnchors ?? [],
    'Coherence anchors will appear after contemplation.'
  )
  renderStringList(
    'playgroundTroubleshooting',
    session?.troubleshootingProtocols ?? [],
    'Troubleshooting protocols will appear here.'
  )
  renderLibraryGroups(
    options.libraryItems,
    ritual.ritualSoundItemIds?.length ? ritual.ritualSoundItemIds : ritual.soundItemId ? [ritual.soundItemId] : [],
    ritual.homeSoundItemId,
    options.busy
  )

  setActionButtonState('continue', session, options.busy)
  setActionButtonState('pivot', session, options.busy)
  setActionButtonState('dissonant', session, options.busy)
  setActionButtonState('save-core', session, options.busy)
}
