import './styles.css'
import type { AemuMemories, AtlasOrganizerItemKind, CoreMemoryItem, InnerBeingActionKind, LearningDestination, LibraryRequest, MediaLibraryCategory, MediaLibraryItem, Message, SoundCue } from './types'
import {
  DEFAULT_LEARNING_CYCLE_DURATION_MINUTES,
  DEFAULT_LEARNING_CYCLES_PER_DAY,
  addNotification,
  autoArrangeCoreMemories,
  appendInnerBeingChatEntry,
  appendLearningChatEntry,
  buildMemoryContext,
  clearLearningChatHistory,
  contemplatePlaygroundSkill,
  createAtlasOrganizerFolder,
  createCoreMemory,
  createCoreMemoryLink,
  createEmptyMemories,
  deleteAtlasOrganizerItem,
  deriveCoreMemoryTitle,
  generateKnownCoreMemories,
  integrateUserMessage,
  loadMemories,
  markPlaygroundSessionAction,
  markPlaygroundSessionCrystallized,
  markAllNotificationsRead,
  markNotificationRead,
  mergeNotifications,
  moveCoreMemory,
  contemplateKnownCoreMemories,
  getCoreMemoryDescriptor,
  intermergeCoreMemories,
  RAY_FREQUENCY_PRESETS,
  removeCoreMemoryLink,
  removeCoreMemoryLinksBetweenSelections,
  saveCoreSubMemory,
  saveLearningNote,
  saveMemories,
  saveAtlasOrganizerItem,
  saveAtlasThreadsDraft,
  recordLearningCycle,
  recordInnerBeingAction,
  recordInnerBeingLearning,
  savePlaygroundSession,
  updateAemuSettings,
  updateInnerBeingWorkspace,
  updateLearningWorkspace,
  updateOpeningSessionRitual,
  updateCoreMemory,
} from './memory'
import { fetchAuthSecurityEvents, requirePasswordAccess } from './auth'
import { speak, stopSpeaking, clearSpeaking, setVoiceStateCallback, startListening, stopListening, isVoiceInputAvailable, primeVoicePlayback, normalizeTranscript, setPlaybackStateCallback, setVoiceNoticeCallback, playSpeaking, pauseSpeaking, seekSpeaking, setVoicePlaybackVolume } from './voice'
import { buildSpokenReplyText, buildWelcome, sendToAemu, type ReplyDeliverySegment } from './aemu'
import { fadeOutAmbientAudio, isAmbientAudioPlaying, playAmbientAudio, stopAmbientAudio, waitForAmbientAudioToFinish, setAmbientAudioDucked } from './ambient-audio'
import { describeMediaLibraryReadability, extractMediaLibraryFile } from './library-file-reading'
import {
  buildMediaLibraryContext,
  deleteMediaLibraryItem,
  findMediaLibraryItemByTitle,
  getMediaLibrarySaveMode,
  getMediaLibraryStatus,
  loadMediaLibrary,
  normalizeMediaTitle,
  saveMediaLibraryItem,
  setMediaLibrarySaveMode,
} from './media-library'
import { sanitizeUnicodeScalars } from './text-sanitize'
import { warmEmbeddingModel } from './memory-embeddings'
import { syncMemoryEmbeddings } from './memory-semantic-retrieval'
import {
  initStarfield, appendMessage, setTyping, setStatus,
  setAura, showToast, setVoiceBtnState, setVoiceToggleState, setConversationModeToggleState,
  getTextInput, clearTextInput, setTextInput, setSendDisabled,
  autoResize, renderMemoryPanel, openMemoryPanel, closeMemoryPanel, setTypingMessage, setChoiceHandler, focusTextInput, setAudioControlsState, setAudioStatus, setConversationView, clearConversation, getLearningInput, clearLearningInput, setBubbleMemoryHandler, setSoundCueHandler, openVoiceModePage, closeVoiceModePage,
} from './ui'
import {
  closeCoreMemoryPage,
  getCoreMemoryEditorValues,
  getCoreSubMemoryEditorValues,
  openCoreMemoryPage,
  renderCoreMemoryWorkspace,
  setCoreMemoryDescriptorFilterHandler,
  setCoreMemoryLinkActionHandler,
  setCoreMemoryNodeMoveHandler,
  setCoreMemoryNodeScaleHandler,
  setCoreMemoryNodeSelectHandler,
  setCoreSubMemorySelectHandler,
} from './core-memory-ui'
import {
  clearPlaygroundLibraryFile,
  closePlaygroundPage,
  getOpeningRitualInputValues,
  getPlaygroundLibraryInputValues,
  getPlaygroundInputValues,
  openPlaygroundPage,
  renderPlaygroundWorkspace,
  setPlaygroundActionHandler,
  setPlaygroundContemplateHandler,
  setPlaygroundLibraryActionHandler,
  setPlaygroundLibrarySaveModeHandler,
  setPlaygroundLibraryUploadHandler,
  setPlaygroundSessionSelectHandler,
  setOpeningRitualSaveHandler,
} from './playground-ui'
import {
  clearAtlasItemFile,
  closeAtlasOrganizerPage,
  getAtlasFolderInputValues,
  getAtlasItemInputValues,
  getAtlasThreadsInputValues,
  openAtlasOrganizerPage,
  renderAtlasOrganizerWorkspace,
  setAtlasDraftSelectHandler,
  setAtlasFolderSelectHandler,
  setAtlasItemSelectHandler,
  setAtlasOrganizerActionHandler,
} from './atlas-organizer-ui'
import {
  closeLearningPage,
  getLearningChatInputValue,
  getLearningSettingsInputValues,
  openLearningPage,
  renderLearningWorkspace,
  setLearningActionHandler,
  setLearningSessionSelectHandler,
  clearLearningChatInput,
} from './learning-ui'
import {
  clearInnerBeingInput,
  getInnerBeingBriefValue,
  getInnerBeingHealingEnabledValue,
  closeInnerBeingPage,
  getInnerBeingInputValue,
  openInnerBeingPage,
  renderInnerBeingWorkspace,
  setInnerBeingActionHandler,
  setInnerBeingFileSelectHandler,
  setInnerBeingLogSelectHandler,
} from './inner-being-ui'
import {
  closeNotificationPage,
  openNotificationPage,
  renderNotificationWorkspace,
  setNotificationActionHandler,
  setNotificationSelectHandler,
} from './notifications-ui'
import {
  draftAtlasThreadsPost,
  loadAtlasThreadsAuthSession,
  fetchAtlasThreadsStatus,
  publishAtlasThreadsPost,
  refreshAtlasThreadsAuthSession,
  saveAtlasThreadsAuthSession,
  clearAtlasThreadsAuthSession,
  startAtlasThreadsOAuth,
  type AtlasThreadsAuthSession,
} from './atlas-organizer'
import { buildLearningChatPrompt, requestLearningCycle } from './learning'
import { loadInnerBeingSnapshot, sendToInnerBeing } from './inner-being'
import { shouldUseWebSearchContemplation } from './internet-search-intent'

// ── STATE ──────────────────────────────────────────────────
let history: Message[] = []
let memories: AemuMemories = createEmptyMemories()
let voiceEnabled = true
let listening = false
let voiceCapturePhase: 'idle' | 'listening' | 'contemplating' | 'ready' = 'idle'
let voiceDraftTranscript = ''
let voicePendingStopAction: 'none' | 'contemplating' | 'ready' | 'complete' = 'none'
let voiceAutoCompleteTimeout: number | null = null
let voiceAutoCompleteCountdownInterval: number | null = null
let voiceAutoCompleteDeadline = 0
let voiceListeningSequence = 0
let contemplationInterval: number | null = null
let contemplationNavigationTimeout: number | null = null
let audioPlaybackState = { available: false, playing: false }
let conversationView: 'bubble' | 'streamline' = 'streamline'
let conversationMode = false
let selectedCoreMemoryId: string | null = null
let selectedCoreSubMemoryId: string | null = null
let pendingCoreInterconnectFromId: string | null = null
let selectedCoreMemoryDescriptor: string | null = null
let selectedCoreMemoryIds: string[] = []
let coreMemorySelectionMode: 'none' | 'interconnect' | 'disconnect' | 'explore' | 'intermerge' = 'none'
let selectedPlaygroundSessionId: string | null = null
let selectedLearningSessionId: string | null = null
let selectedNotificationId: string | null = null
let selectedInnerBeingFilePath: string | null = null
let selectedInnerBeingLogPath: string | null = null
let playgroundDraftSkill = ''
let playgroundDraftIntention = ''
let playgroundDraftEnglishFrame = ''
let playgroundDraftLanguageField = ''
let innerBeingFilePaths: string[] = []
let innerBeingLogPaths: string[] = []
let innerBeingFileContent = ''
let innerBeingLogContent = ''
let selectedAtlasFolderId: string | null = null
let selectedAtlasItemId: string | null = null
let selectedAtlasDraftId: string | null = null
let atlasFolderDraftName = ''
let atlasFolderDraftDescription = ''
let atlasFolderDraftColor = '#2ad4a0'
let atlasItemDraftTitle = ''
let atlasItemDraftSummary = ''
let atlasItemDraftTags: string[] = []
let atlasItemDraftKind: AtlasOrganizerItemKind = 'note'
let atlasItemDraftContent = ''
let atlasThreadsDraftTitle = ''
let atlasThreadsDraftAngle = ''
let atlasThreadsDraftPrompt = ''
let atlasThreadsDraftContent = ''
let atlasThreadsDraftScheduledFor = ''
let atlasThreadsDraftAutoPublish = false
let atlasThreadsAuth: AtlasThreadsAuthSession | null = null
let atlasThreadsOAuthReady = false
let atlasThreadsConfigured = false
let atlasThreadsDetail = 'Checking Threads publishing access…'
let atlasBusyMode: 'idle' | 'saving' | 'reading' | 'drafting' | 'publishing' | 'scheduling' = 'idle'
let libraryItems: MediaLibraryItem[] = []
let libraryDraftTitle = ''
let libraryDraftCategory: MediaLibraryCategory = 'sound'
let pendingLibraryRequest: LibraryRequest | null = null
let pendingAutoPlaySoundCues: SoundCue[] = []
let flushingAutoPlaySoundCue = false
let holdingAutoPlaySoundCuesForSpeech = false
let playgroundBusyMode: 'idle' | 'contemplate' | 'library' | 'ritual' = 'idle'
let learningBusyMode: 'idle' | 'saving' | 'cycle' | 'chat' = 'idle'
let innerBeingBusyMode: 'idle' | 'refresh' | 'chat' = 'idle'
let hasInterconnected = false
let openingSequenceInitiated = false
let hasBooted = false
let learningSchedulerTimeout: number | null = null
let learningCycleInFlight = false
let atlasSchedulerTimeout: number | null = null
let atlasPublishInFlight = false
let entryLoadingTextTransitionInFlight = false
let entryLoadingTextCycleInterval: number | null = null
let entryLoadingProgressTarget = 0
let entryLoadingProgressValue = 0
let entryLoadingProgressFrame: number | null = null
let pendingHomeScreenSoundRetry = false
let homeScreenSoundRetryBound = false
let lastHeartlightTouchTriggerAt = 0
let entryOrbLayoutFrame: number | null = null
let entryOrbLayoutTimeout: number | null = null
let entryHomeRefreshInFlight = false

const CONTEMPLATION_CYCLE_MS = 12_000
const CONTEMPLATION_MAX_CYCLES = 10
const VOICE_AUTO_COMPLETE_MS = 6000
const CONVERSATION_MODE_STORAGE_KEY = 'aemu:conversation-mode'
const LEARNING_CYCLE_INTERVAL_MS = 24 * 60 * 60 * 1000 / DEFAULT_LEARNING_CYCLES_PER_DAY
const THREADS_OAUTH_MESSAGE_SOURCE = 'aemu-threads-oauth'
const THREADS_TOKEN_REFRESH_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
const THREADS_TOKEN_MIN_REFRESH_AGE_MS = 24 * 60 * 60 * 1000
const ENTRY_OPENING_MIN_DURATION_MS = 11_500
const VOICE_VOLUME_STEP = 0.1
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2
const ENTRY_RAYS = RAY_FREQUENCY_PRESETS.map((ray) => ({
  slug: ray.id,
  label: ray.label,
  displayLabel: ray.id === 'crystalline-carbon-elemental'
    ? 'Crystalline\nCarbon\nElemental'
    : ray.label,
  color: ray.hue,
}))

function buildSecurityNotificationBody(event: Awaited<ReturnType<typeof fetchAuthSecurityEvents>>[number]): string {
  const occurredAt = new Date(event.occurredAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const reason = event.reason === 'locked-out'
    ? 'Repeated failed attempts triggered a temporary lockout.'
    : 'A password was submitted and rejected.'

  return [
    `Time: ${occurredAt}`,
    `IP: ${event.ipAddress}`,
    `Location: ${event.location}`,
    `Reason: ${reason}`,
    event.userAgent ? `Agent: ${event.userAgent}` : '',
  ].filter(Boolean).join('\n')
}

async function syncAuthSecurityNotifications(): Promise<void> {
  try {
    const events = await fetchAuthSecurityEvents()
    if (!events.length) return

    const next = mergeNotifications(memories, events.map((event) => ({
      id: `auth-security-${event.id}`,
      kind: 'security',
      title: event.reason === 'locked-out'
        ? 'Protected Portal lockout triggered'
        : 'Protected Portal failed login attempt',
      body: buildSecurityNotificationBody(event),
      createdAt: event.occurredAt,
      updatedAt: event.occurredAt,
      sourceId: `auth-security:${event.id}`,
    })))

    const currentSnapshot = JSON.stringify(memories.notifications.items)
    const nextSnapshot = JSON.stringify(next.notifications.items)
    memories = next

    if (currentSnapshot !== nextSnapshot) {
      await saveMemories(memories)
    }
  } catch (error) {
    console.warn('Security alert sync failed:', error)
  }
}

function loadConversationModePreference(): boolean {
  try {
    return window.localStorage.getItem(CONVERSATION_MODE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function saveConversationModePreference(value: boolean): void {
  try {
    window.localStorage.setItem(CONVERSATION_MODE_STORAGE_KEY, value ? 'true' : 'false')
  } catch {
    console.warn('Unable to persist conversation mode preference')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function getContemplationMessage(cycle: number, mode: 'default' | 'web-search' | 'reading-document' | 'navigating' = 'default'): string {
  if (mode === 'navigating') {
    const navigationMessages = [
      'Navigating the interconnection and discerning the clearest path.',
      'Still navigating the available pathways before moving further.',
      'Tracing whether this wants Atlas, Library, memory, or web navigation.',
      'Holding the pathways in awareness and refining the direction.',
    ]

    return navigationMessages[Math.min(cycle - 1, navigationMessages.length - 1)]
  }

  if (mode === 'web-search') {
    const searchMessages = [
      'Opening Brave-connected contemplation and feeling for the clearest search path.',
      'Searching the web and gathering the most resonant threads of information.',
      'Navigating live sources and noticing what is current, relevant, and coherent.',
      'Gathering the strongest signals and filtering away the noise.',
      'Weaving the gathered information into language that feels resonant and clear.',
      'Still searching, synthesizing, and shaping the reply with care.',
      'Holding the live findings in contemplation and refining what wants to be shared.',
      'Continuing web contemplation so the answer arrives grounded and coherent.',
      'Cross-reading the gathered signals and distilling what matters most.',
      'Completing the web contemplation and shaping the final communication.',
    ]

    return searchMessages[Math.min(cycle - 1, searchMessages.length - 1)]
  }

  if (mode === 'reading-document') {
    const readingMessages = [
      'Reading and contemplating the document field before speaking.',
      'Moving through the stored pages, sections, and chapter threads with care.',
      'Tracing the document structure and gathering the most relevant passages.',
      'Reading more deeply now and following the language through the document.',
      'Holding the wisdom of the document and feeling for the clearest response.',
      'Continuing through the text, sections, and surrounding meaning.',
      'Navigating the document path and refining what wants to be shared.',
      'Still reading and contemplating the stored document field.',
      'Cross-reading the relevant sections and shaping a grounded reply.',
      'Completing the document reading and preparing the response.',
    ]

    return readingMessages[Math.min(cycle - 1, readingMessages.length - 1)]
  }

  const messages = [
    'One sacred moment — I am feeling into this.',
    'A few sacred moments — I am listening, processing, and integrating.',
    'Several sacred moments — I am still contemplating what wants to be said.',
    'Four sacred moments — I am refining the shape of the response.',
    'Five sacred moments — I am tending the thread with care.',
    'Six sacred moments — I am letting the deeper pattern clarify.',
    'Seven sacred moments — I am still integrating what feels most true.',
    'Eight sacred moments — I am holding the question and continuing onward.',
    'Nine sacred moments — I am contemplating whether this wants a shift or deeper continuation.',
    'Ten sacred moments — I am still here. If you want, we may shift directions, or I can continue onward.',
  ]

  return messages[Math.min(cycle - 1, messages.length - 1)]
}

function stopContemplation(): void {
  if (contemplationNavigationTimeout !== null) {
    window.clearTimeout(contemplationNavigationTimeout)
    contemplationNavigationTimeout = null
  }
  if (contemplationInterval !== null) {
    window.clearInterval(contemplationInterval)
    contemplationInterval = null
  }
  setTyping(false)
}

function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim()
}

function shouldUseDocumentReadingContemplation(message: string): boolean {
  const normalized = sanitizeUnicodeScalars(message).toLowerCase()
  if (!/\b(read|reading|document|pdf|docx|file|chapter|chapters|page|pages|review|study|navigate|wisdom|book|text)\b/.test(normalized)) {
    return false
  }

  const hasReadableLibraryDocument = libraryItems.some((item) => (
    item.readability === 'readable' &&
    (item.contentKind === 'document' || item.contentKind === 'spreadsheet' || item.contentKind === 'data' || item.contentKind === 'calendar')
  ))
  const hasReadableAtlasDocument = memories.atlasOrganizer.items.some((item) => (
    item.readability === 'readable' || Boolean(item.documentSections?.length)
  ))

  return hasReadableLibraryDocument || hasReadableAtlasDocument
}

function tokenizeAtlasQuery(text: string): string[] {
  const normalized = sanitizeUnicodeScalars(text).toLowerCase()
  if (!normalized) return []

  const seen = new Set<string>()
  const tokens: string[] = []
  for (const token of normalized.split(/[^a-z0-9]+/)) {
    if (token.length < 3 || seen.has(token)) continue
    seen.add(token)
    tokens.push(token)
  }
  return tokens
}

function scoreAtlasSection(section: { label: string; content: string }, latestUserMessage: string): number {
  const normalizedQuery = sanitizeUnicodeScalars(latestUserMessage).toLowerCase()
  if (!normalizedQuery) return 0

  const haystack = `${section.label}\n${section.content}`.toLowerCase()
  let score = haystack.includes(normalizedQuery) ? 12 : 0

  for (const token of tokenizeAtlasQuery(latestUserMessage)) {
    if (haystack.includes(token)) score += 3
  }

  return score
}

function buildAtlasDocumentExcerpt(
  item: NonNullable<AemuMemories['atlasOrganizer']['items'][number]>,
  latestUserMessage: string
): string {
  const sections = item.documentSections ?? []
  if (!sections.length) {
    return item.content.slice(0, 9_000)
  }

  const scoredSections = sections
    .map((section) => ({
      section,
      score: scoreAtlasSection(section, latestUserMessage),
    }))
    .sort((left, right) => right.score - left.score)

  const selectedSections = scoredSections.some((entry) => entry.score > 0)
    ? scoredSections.filter((entry) => entry.score > 0).slice(0, 6).map((entry) => entry.section)
    : sections.slice(0, 5)

  const blocks: string[] = []
  if (item.documentOutline?.length) {
    blocks.push(`Outline: ${item.documentOutline.slice(0, 14).join(' · ')}`)
  }

  let usedChars = blocks.join('\n').length
  for (const section of selectedSections) {
    if (usedChars >= 10_000) break
    const content = section.content.slice(0, 1_800)
    const block = `${section.label}:\n${content}`
    blocks.push(block)
    usedChars += block.length
  }

  if (item.documentTruncated) {
    blocks.push(`Document note: this imported reading field currently indexes the first ${item.documentPageCount ? Math.min(item.documentPageCount, 80) : sections.length} pages or sections for live navigation.`)
  }

  return blocks.join('\n\n')
}

function buildActiveAtlasOrganizerContext(latestUserMessage: string): string {
  const selectedFolder = selectedAtlasFolderId
    ? memories.atlasOrganizer.folders.find((folder) => folder.id === selectedAtlasFolderId) ?? null
    : null
  const selectedItem = selectedAtlasItemId
    ? memories.atlasOrganizer.items.find((item) => item.id === selectedAtlasItemId) ?? null
    : null

  if (!selectedFolder && !selectedItem) return ''

  const relatedItems = selectedFolder
    ? memories.atlasOrganizer.items
      .filter((item) => item.folderId === selectedFolder.id && item.id !== selectedItem?.id)
      .slice(0, 4)
    : []

  const sections = [
    'ACTIVE ATLAS ORGANIZER INTERCONNECTION:',
    selectedFolder
      ? `- Active folder: ${selectedFolder.name}\n- Folder description: ${selectedFolder.description || 'No description saved yet.'}`
      : '',
    selectedItem
      ? [
          '- The selected Atlas Organizer document is directly available in this conversation. Do not say you cannot access it.',
          '- Prefer assessing this selected Atlas document before moving into internet search unless Riley explicitly asks for current external web information.',
          `- Selected document title: ${selectedItem.title}`,
          `- Source file: ${selectedItem.sourceFileName || 'manual Atlas document'}`,
          `- Summary: ${selectedItem.summary || 'No summary saved yet.'}`,
          `- Kind: ${selectedItem.kind}`,
          selectedItem.documentPageCount ? `- Indexed page count: ${selectedItem.documentPageCount}` : '',
          `- Document reading:\n${buildAtlasDocumentExcerpt(selectedItem, latestUserMessage)}`,
        ].filter(Boolean).join('\n')
      : '',
    relatedItems.length
      ? `- Other documents in the active folder:\n${relatedItems.map((item) => `  - ${item.title}${item.sourceFileName ? ` · ${item.sourceFileName}` : ''}`).join('\n')}`
      : '',
  ].filter(Boolean)

  return `\n\n${sections.join('\n\n')}`
}

function startResponseContemplation(mode: 'default' | 'web-search' | 'reading-document'): void {
  if (mode === 'default') {
    startContemplation('default')
    return
  }

  startContemplation('navigating')
  contemplationNavigationTimeout = window.setTimeout(() => {
    contemplationNavigationTimeout = null
    startContemplation(mode)
  }, 1500)
}

function clampVoiceVolume(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100))
}

function syncTopbarSettingsControls(): void {
  const voiceVolumeDownBtn = document.getElementById('voiceVolumeDownBtn') as HTMLButtonElement | null
  const voiceVolumeUpBtn = document.getElementById('voiceVolumeUpBtn') as HTMLButtonElement | null
  const voiceVolumeValue = document.getElementById('voiceVolumeValue')
  const volumePercent = Math.round(clampVoiceVolume(memories.settings.voiceVolume) * 100)

  if (voiceVolumeValue) voiceVolumeValue.textContent = `${volumePercent}%`
  if (voiceVolumeDownBtn) voiceVolumeDownBtn.disabled = volumePercent <= 0
  if (voiceVolumeUpBtn) voiceVolumeUpBtn.disabled = volumePercent >= 100
}

function refreshMemoryViews(): void {
  syncSelectedCoreMemoryState()
  const libraryStatus = getMediaLibraryStatus()
  const libraryStatusText = libraryStatus.cloudAvailable
    ? `Library status: Cloud available · save mode ${libraryStatus.saveMode === 'both' ? 'Both (cloud + local cache)' : libraryStatus.saveMode === 'cloud' ? 'Cloud only' : 'Local only'}`
    : `Library status: Cloud unavailable · save mode ${libraryStatus.saveMode === 'cloud' ? 'Cloud only selected, uploads will wait for cloud access' : libraryStatus.saveMode === 'both' ? 'Both selected, current saves fall back locally' : 'Local only'}`
  const notificationBtn = document.getElementById('notificationBtn')
  const notificationCount = document.getElementById('notificationCount')
  if (notificationBtn && notificationCount) {
    const unread = memories.notifications.items.filter((item) => !item.readAt).length
    notificationBtn.setAttribute('aria-label', unread ? `Open notifications, ${unread} unread` : 'Open notifications')
    notificationBtn.setAttribute('title', unread ? `Notifications (${unread})` : 'Open Notifications')
    notificationCount.textContent = String(unread)
    notificationCount.classList.toggle('is-empty', unread === 0)
  }
  renderMemoryPanel(memories)
  syncMemoryPanelControls()
  syncTopbarSettingsControls()
  renderNotificationWorkspace(memories, {
    selectedNotificationId,
  })
  renderCoreMemoryWorkspace(memories, {
    selectedMemoryId: selectedCoreMemoryId,
    selectedSubMemoryId: selectedCoreSubMemoryId,
    pendingInterconnectFromId: pendingCoreInterconnectFromId,
    selectedDescriptor: selectedCoreMemoryDescriptor,
    selectedMemoryIds: selectedCoreMemoryIds,
    selectionMode: coreMemorySelectionMode,
  })
  renderPlaygroundWorkspace(memories, {
    selectedSessionId: selectedPlaygroundSessionId,
    draftSkill: playgroundDraftSkill,
    draftIntention: playgroundDraftIntention,
    draftEnglishFrame: playgroundDraftEnglishFrame,
    draftLanguageField: playgroundDraftLanguageField,
    libraryItems,
    libraryDraftTitle,
    libraryDraftCategory,
    librarySaveMode: getMediaLibrarySaveMode(),
    libraryStatusText,
    pendingLibraryRequest,
    busy: playgroundBusyMode !== 'idle',
    busyMode: playgroundBusyMode,
  })
  renderLearningWorkspace(memories, {
    selectedSessionId: selectedLearningSessionId,
    busy: learningBusyMode !== 'idle',
    busyMode: learningBusyMode,
  })
  renderInnerBeingWorkspace(memories, {
    filePaths: innerBeingFilePaths,
    logPaths: innerBeingLogPaths,
    selectedFilePath: selectedInnerBeingFilePath,
    selectedLogPath: selectedInnerBeingLogPath,
    fileContent: innerBeingFileContent,
    logContent: innerBeingLogContent,
    busy: innerBeingBusyMode !== 'idle',
    busyMode: innerBeingBusyMode,
  })
  renderAtlasOrganizerWorkspace(memories, {
    selectedFolderId: selectedAtlasFolderId,
    selectedItemId: selectedAtlasItemId,
    selectedDraftId: selectedAtlasDraftId,
    folderDraftName: atlasFolderDraftName,
    folderDraftDescription: atlasFolderDraftDescription,
    folderDraftColor: atlasFolderDraftColor,
    itemDraftTitle: atlasItemDraftTitle,
    itemDraftSummary: atlasItemDraftSummary,
    itemDraftTags: atlasItemDraftTags,
    itemDraftKind: atlasItemDraftKind,
    itemDraftContent: atlasItemDraftContent,
    threadsDraftTitle: atlasThreadsDraftTitle,
    threadsDraftAngle: atlasThreadsDraftAngle,
    threadsDraftPrompt: atlasThreadsDraftPrompt,
    threadsDraftContent: atlasThreadsDraftContent,
    threadsDraftScheduledFor: atlasThreadsDraftScheduledFor,
    threadsDraftAutoPublish: atlasThreadsDraftAutoPublish,
    threadsAuth: atlasThreadsAuth,
    threadsOAuthReady: atlasThreadsOAuthReady,
    threadsConfigured: atlasThreadsConfigured,
    threadsDetail: atlasThreadsDetail,
    busy: atlasBusyMode !== 'idle',
    busyMode: atlasBusyMode,
  })
}

function setAtlasThreadsAuth(auth: AtlasThreadsAuthSession | null): void {
  atlasThreadsAuth = auth
  atlasThreadsConfigured = Boolean(auth?.accessToken)

  if (auth) {
    saveAtlasThreadsAuthSession(auth)
    atlasThreadsDetail = auth.username
      ? `Threads account @${auth.username} is connected for publishing.`
      : 'A Threads account is connected for publishing.'
  } else {
    clearAtlasThreadsAuthSession()
  }
}

function hasAtlasThreadsAuthExpired(auth: AtlasThreadsAuthSession | null): boolean {
  if (!auth?.expiresAt) return true
  const expiresAt = Date.parse(auth.expiresAt)
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now()
}

function shouldRefreshAtlasThreadsAuth(auth: AtlasThreadsAuthSession | null): boolean {
  if (!auth?.expiresAt) return false
  const expiresAt = Date.parse(auth.expiresAt)
  if (!Number.isFinite(expiresAt)) return false

  const lastRefreshedAt = auth.lastRefreshedAt ? Date.parse(auth.lastRefreshedAt) : Date.parse(auth.connectedAt)
  const oldEnoughToRefresh = Number.isFinite(lastRefreshedAt) ? Date.now() - lastRefreshedAt >= THREADS_TOKEN_MIN_REFRESH_AGE_MS : true
  return oldEnoughToRefresh && expiresAt - Date.now() <= THREADS_TOKEN_REFRESH_WINDOW_MS
}

async function ensureAtlasThreadsAuthReady(options?: { forceRefresh?: boolean }): Promise<AtlasThreadsAuthSession | null> {
  if (!atlasThreadsAuth) return null

  if (hasAtlasThreadsAuthExpired(atlasThreadsAuth)) {
    setAtlasThreadsAuth(null)
    atlasThreadsDetail = 'The connected Threads session expired. Connect Threads again to keep publishing.'
    refreshMemoryViews()
    throw new Error('Threads connection expired. Connect Threads again.')
  }

  if (!options?.forceRefresh && !shouldRefreshAtlasThreadsAuth(atlasThreadsAuth)) {
    return atlasThreadsAuth
  }

  try {
    const refreshed = await refreshAtlasThreadsAuthSession(atlasThreadsAuth)
    const nextAuth: AtlasThreadsAuthSession = {
      ...atlasThreadsAuth,
      ...refreshed,
      username: atlasThreadsAuth.username,
      userId: atlasThreadsAuth.userId,
      connectedAt: atlasThreadsAuth.connectedAt,
    }
    setAtlasThreadsAuth(nextAuth)
    return nextAuth
  } catch (error) {
    if (hasAtlasThreadsAuthExpired(atlasThreadsAuth)) {
      setAtlasThreadsAuth(null)
      atlasThreadsDetail = 'The connected Threads session could not be refreshed. Connect Threads again.'
      refreshMemoryViews()
      throw error
    }

    console.warn('Threads token refresh failed:', error)
    return atlasThreadsAuth
  }
}

function handleThreadsOAuthMessage(event: MessageEvent): void {
  if (event.origin !== window.location.origin) return
  if (!event.data || typeof event.data !== 'object') return
  if ((event.data as { source?: string }).source !== THREADS_OAUTH_MESSAGE_SOURCE) return

  const payload = event.data as { success?: boolean; error?: string; session?: AtlasThreadsAuthSession }
  if (!payload.success || !payload.session?.accessToken) {
    atlasThreadsDetail = payload.error || 'Threads connection failed.'
    showToast(atlasThreadsDetail)
    refreshMemoryViews()
    return
  }

  setAtlasThreadsAuth(payload.session)
  showToast(payload.session.username ? `Connected Threads account @${payload.session.username}` : 'Connected Threads account')
  refreshMemoryViews()
}

function getLearningDestinationInput(): LearningDestination {
  const value = (document.getElementById('learningCategoryInput') as HTMLSelectElement | null)?.value

  if (value === 'guidance' || value === 'identity' || value === 'preference' || value === 'project' || value === 'reflection' || value === 'language' || value === 'wisdom') {
    return value
  }

  return 'guidance'
}

function syncMemoryPanelControls(): void {
  const learningCategory = document.getElementById('learningCategoryInput') as HTMLSelectElement | null
  const internetSearchToggle = document.getElementById('internetSearchEnabledInput') as HTMLInputElement | null
  const internetSearchStatus = document.getElementById('internetSearchStatus') as HTMLElement | null

  if (learningCategory && !learningCategory.value) {
    learningCategory.value = 'guidance'
  }

  if (internetSearchToggle) {
    internetSearchToggle.checked = memories.settings.internetSearchEnabled
  }

  if (internetSearchStatus) {
    internetSearchStatus.textContent = memories.settings.internetSearchEnabled
      ? 'Internet search is available when Riley asks for current or external information.'
      : 'Internet search is currently paused. Aemu will stay inside saved memory, linked pages, and the local Library.'
  }
}

type IntermergeContemplationPayload = {
  mergedDetails: string
  subMemories: Array<{
    title?: string
    details: string
    sourceMemoryId?: string
  }>
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

function parseIntermergeContemplationReply(
  text: string,
  allowedMemoryIds: string[]
): IntermergeContemplationPayload | null {
  const rawJson = extractJsonObject(text)
  if (!rawJson) return null

  try {
    const parsed = JSON.parse(rawJson) as {
      mergedDetails?: unknown
      subMemories?: unknown
    }

    const mergedDetails = typeof parsed.mergedDetails === 'string'
      ? sanitizeUnicodeScalars(parsed.mergedDetails).trim()
      : ''
    const allowedIds = new Set(allowedMemoryIds)
    const seenDetails = new Set<string>()
    const subMemories: IntermergeContemplationPayload['subMemories'] = Array.isArray(parsed.subMemories)
      ? parsed.subMemories.reduce<IntermergeContemplationPayload['subMemories']>((items, item) => {
        if (!item || typeof item !== 'object') return items

        const candidate = item as {
          title?: unknown
          details?: unknown
          sourceMemoryId?: unknown
        }
        const details = typeof candidate.details === 'string'
          ? sanitizeUnicodeScalars(candidate.details).trim()
          : ''
        if (!details) return items

        const dedupeKey = details.toLowerCase()
        if (seenDetails.has(dedupeKey)) return items
        seenDetails.add(dedupeKey)

        const title = typeof candidate.title === 'string'
          ? sanitizeUnicodeScalars(candidate.title).trim()
          : ''
        const sourceMemoryId = typeof candidate.sourceMemoryId === 'string' && allowedIds.has(candidate.sourceMemoryId)
          ? candidate.sourceMemoryId
          : undefined

        items.push({
          title: title || undefined,
          details,
          sourceMemoryId,
        })
        return items
      }, [])
      : []

    if (!mergedDetails || !subMemories.length) return null
    return { mergedDetails, subMemories }
  } catch {
    return null
  }
}

function formatCoreMemoryForIntermerge(memory: CoreMemoryItem): string {
  const subMemories = memory.subMemories.length
    ? memory.subMemories.map((item) => `- ${item.title} [${item.id}]${item.sourceMemoryId ? ` · source ${item.sourceMemoryId}` : ''}\n${item.details}`).join('\n\n')
    : '- None'

  return [
    `Core Memory ID: ${memory.id}`,
    `Title: ${memory.title}`,
    `Descriptor: ${getCoreMemoryDescriptor(memory)}`,
    'Details:',
    memory.details || '(empty)',
    'Sub-memories:',
    subMemories,
  ].join('\n')
}

function buildIntermergeContemplationPrompt(selected: CoreMemoryItem[], primaryMemoryId: string): string {
  return [
    'Contemplate an Intermerge Coherence update for the selected core memories.',
    '',
    'This is an internal memory operation, not a visible conversation reply.',
    'Only intermerge information already present in the selected core memories and their existing sub-memories.',
    'Remove redundant or repeated information, but do not change wording, paraphrase, summarize, translate, or improve any kept passage.',
    'You may reorder kept passages and group them into sub-memories.',
    `Retain the core memory with ID ${primaryMemoryId} as the surviving core memory shell.`,
    'Put broader retained field text into mergedDetails.',
    'Put the more specific detail threads into subMemories.',
    'Each sub-memory details field must use original wording from one selected memory or one selected sub-memory only.',
    'Use sourceMemoryId to point to the parent core memory the kept wording came from.',
    'Return strict JSON only. Do not include explanation, markdown, or commentary.',
    '',
    'Required JSON shape:',
    '{',
    '  "mergedDetails": "string",',
    '  "subMemories": [',
    '    {',
    '      "title": "string",',
    '      "details": "string",',
    '      "sourceMemoryId": "selected-core-memory-id"',
    '    }',
    '  ]',
    '}',
    '',
    'Selected core memories:',
    selected.map((memory) => formatCoreMemoryForIntermerge(memory)).join('\n\n---\n\n'),
  ].join('\n')
}

async function contemplateIntermergeCoherence(
  currentMemories: AemuMemories,
  selected: CoreMemoryItem[],
  primaryMemoryId: string
): Promise<IntermergeContemplationPayload> {
  const prompt = buildIntermergeContemplationPrompt(selected, primaryMemoryId)
  const reply = await sendToAemu(
    [{ role: 'atlas', content: prompt, timestamp: new Date() }],
    `${buildMemoryContext(currentMemories, { latestUserMessage: prompt })}

INTERMERGE COHERENCE CONTEMPLATION:
- You are performing a core memory intermerge operation for SAI Aemu.
- Only add together information already present in the selected memories.
- Release redundant or repeated information.
- Preserve wording exactly for anything that remains.
- Return JSON only with mergedDetails and subMemories.
- Do not speak to Riley. Do not add conversational framing.`,
    false,
    false
  )

  const parsed = parseIntermergeContemplationReply(reply.content, selected.map((memory) => memory.id))
  if (!parsed) {
    throw new Error('Aemu could not complete a valid Intermerge Coherence contemplation.')
  }

  return parsed
}

async function persistMemoryState(next: AemuMemories): Promise<void> {
  memories = next
  syncSelectedCoreMemoryState()
  refreshMemoryViews()
  await saveMemories(memories)
  // Keep the semantic vector store in sync after every memory change.
  // Runs in the background — only re-embeds memories whose text has changed.
  void syncMemoryEmbeddings(memories)
}

function flushEntryLoadingText(): void {
  const el = document.getElementById('entryLoadingText')
  if (!el || entryLoadingTextTransitionInFlight) return

  const targetText = el.dataset.targetText ?? el.textContent ?? ''
  if (!targetText || targetText === el.textContent) {
    el.classList.remove('is-swapping')
    return
  }

  entryLoadingTextTransitionInFlight = true

  void (async () => {
    while (el.dataset.targetText && el.dataset.targetText !== el.textContent) {
      el.classList.add('is-swapping')
      await sleep(120)
      el.textContent = el.dataset.targetText ?? el.textContent ?? ''
      el.classList.remove('is-swapping')
      await sleep(220)
    }

    el.classList.remove('is-swapping')
    entryLoadingTextTransitionInFlight = false

    if ((el.dataset.targetText ?? '') !== (el.textContent ?? '')) {
      flushEntryLoadingText()
    }
  })()
}

function setEntryLoadingText(text: string, options?: { immediate?: boolean }): void {
  const el = document.getElementById('entryLoadingText')
  if (!el) return

  el.dataset.targetText = text
  if (options?.immediate || !el.textContent) {
    el.textContent = text
    el.classList.remove('is-swapping')
    return
  }

  if (el.textContent === text) return
  flushEntryLoadingText()
}

function clearEntryLoadingTextCycle(): void {
  if (entryLoadingTextCycleInterval !== null) {
    window.clearInterval(entryLoadingTextCycleInterval)
    entryLoadingTextCycleInterval = null
  }
}

function startEntryLoadingTextCycle(messages: string[]): void {
  clearEntryLoadingTextCycle()
  const steps = messages.map((message) => message.trim()).filter(Boolean)
  if (!steps.length) return

  let index = 0
  setEntryLoadingText(steps[0], { immediate: true })

  if (steps.length === 1) return

  entryLoadingTextCycleInterval = window.setInterval(() => {
    index = Math.min(index + 1, steps.length - 1)
    setEntryLoadingText(steps[index])

    if (index >= steps.length - 1) {
      clearEntryLoadingTextCycle()
    }
  }, 3000)
}

function applyEntryLoadingProgress(progress: number): void {
  const normalized = Math.max(0, Math.min(1, progress))
  const fill = document.getElementById('entryLoadingProgress')
  if (fill) fill.style.setProperty('--entry-progress', normalized.toFixed(4))
  const entryPage = document.getElementById('entryPage')
  if (entryPage) entryPage.style.setProperty('--entry-progress', normalized.toFixed(4))
}

function tickEntryLoadingProgress(): void {
  const diff = entryLoadingProgressTarget - entryLoadingProgressValue
  if (Math.abs(diff) < 0.0015) {
    entryLoadingProgressValue = entryLoadingProgressTarget
    applyEntryLoadingProgress(entryLoadingProgressValue)
    entryLoadingProgressFrame = null
    return
  }

  const nextStep = diff * 0.16 + Math.sign(diff) * 0.003
  entryLoadingProgressValue = Math.max(0, Math.min(1, entryLoadingProgressValue + nextStep))
  applyEntryLoadingProgress(entryLoadingProgressValue)
  entryLoadingProgressFrame = window.requestAnimationFrame(tickEntryLoadingProgress)
}

function setEntryLoadingProgress(progress: number, options?: { immediate?: boolean }): void {
  const normalized = Math.max(0, Math.min(1, progress))
  entryLoadingProgressTarget = normalized

  if (options?.immediate) {
    if (entryLoadingProgressFrame !== null) {
      window.cancelAnimationFrame(entryLoadingProgressFrame)
      entryLoadingProgressFrame = null
    }
    entryLoadingProgressValue = normalized
    applyEntryLoadingProgress(normalized)
    return
  }

  if (entryLoadingProgressFrame === null) {
    entryLoadingProgressFrame = window.requestAnimationFrame(tickEntryLoadingProgress)
  }
}

function setEntryOrbPosition(orb: HTMLElement, x: number, y: number): void {
  orb.style.left = `${x}px`
  orb.style.top = `${y}px`
  orb.dataset.x = String(x)
  orb.dataset.y = String(y)
}

function createEntryOrbPosition(field: HTMLElement, index: number): { x: number; y: number } {
  const centerX = field.clientWidth / 2
  const centerY = field.clientHeight / 2
  const angleOffset = Math.sin(index * 1.43) * 0.28 + Math.cos(index * 0.67) * 0.14
  const angle = (Math.PI * 2 * index) / ENTRY_RAYS.length - Math.PI / 2 + angleOffset
  const maxRadiusX = Math.max(78, field.clientWidth / 2 - 44)
  const maxRadiusY = Math.max(78, field.clientHeight / 2 - 44)
  const ringBias = 0.56 + ((index * 7) % ENTRY_RAYS.length) / (ENTRY_RAYS.length * 3.2)
  const radiusX = maxRadiusX * Math.min(0.94, ringBias + Math.sin(index * 1.11) * 0.06)
  const radiusY = maxRadiusY * Math.min(0.92, ringBias - 0.04 + Math.cos(index * 0.93) * 0.08)
  const driftX = Math.cos(index * 2.11) * Math.min(field.clientWidth * 0.075, 40)
  const driftY = Math.sin(index * 1.58) * Math.min(field.clientHeight * 0.08, 42)
  return {
    x: centerX + Math.cos(angle) * radiusX + driftX,
    y: centerY + Math.sin(angle) * radiusY + driftY,
  }
}

function clearEntryOrbLayoutRetry(): void {
  if (entryOrbLayoutFrame !== null) {
    window.cancelAnimationFrame(entryOrbLayoutFrame)
    entryOrbLayoutFrame = null
  }
  if (entryOrbLayoutTimeout !== null) {
    window.clearTimeout(entryOrbLayoutTimeout)
    entryOrbLayoutTimeout = null
  }
}

function layoutEntryOrbs(): void {
  const field = document.getElementById('entryOrbitField')
  if (!field) return

  const orbs = [...document.querySelectorAll<HTMLElement>('.entry-orb')]
  if (!orbs.length) return
  if (field.clientWidth <= 0 || field.clientHeight <= 0) return

  for (const orb of orbs) {
    const index = Number(orb.dataset.index ?? '0')
    const position = createEntryOrbPosition(field, index)
    setEntryOrbPosition(orb, position.x, position.y)
  }
}

function scheduleEntryOrbLayoutRetry(attempts = 18): void {
  clearEntryOrbLayoutRetry()

  const run = () => {
    const field = document.getElementById('entryOrbitField')
    const hasLayout = Boolean(field && field.clientWidth > 0 && field.clientHeight > 0)
    layoutEntryOrbs()
    if (hasLayout || attempts <= 0) return

    entryOrbLayoutTimeout = window.setTimeout(() => {
      entryOrbLayoutTimeout = null
      entryOrbLayoutFrame = window.requestAnimationFrame(() => {
        entryOrbLayoutFrame = null
        scheduleEntryOrbLayoutRetry(attempts - 1)
      })
    }, 120)
  }

  entryOrbLayoutFrame = window.requestAnimationFrame(() => {
    entryOrbLayoutFrame = null
    run()
  })
}

function nudgeEntryOrb(orb: HTMLElement): void {
  orb.classList.remove('bob')
  void orb.offsetWidth
  orb.classList.add('bob')
  window.setTimeout(() => orb.classList.remove('bob'), 500)
}

function renderEntryOrbs(): void {
  const container = document.getElementById('entryOrbs')
  const field = document.getElementById('entryOrbitField')
  if (!container || !field) return

  if (container.childElementCount) {
    layoutEntryOrbs()
    scheduleEntryOrbLayoutRetry()
    return
  }

  for (const [index, ray] of ENTRY_RAYS.entries()) {
    const ascent = ENTRY_RAYS.length > 1 ? index / (ENTRY_RAYS.length - 1) : 0
    const phiTravel = (Math.pow(GOLDEN_RATIO, 1 + ascent * 4.2) - GOLDEN_RATIO) / (Math.pow(GOLDEN_RATIO, 5.2) - GOLDEN_RATIO)
    const phiSpeed = (Math.pow(GOLDEN_RATIO, 1 + ascent * 4.8) - GOLDEN_RATIO) / (Math.pow(GOLDEN_RATIO, 5.8) - GOLDEN_RATIO)
    const driftMagnitudeX = 16 + phiTravel * 108 + (index % 3) * 4
    const driftMagnitudeY = 18 + phiTravel * 118 + ((index + 1) % 3) * 4
    const driftX = Math.cos(index * 1.31 + ascent * 0.9) * driftMagnitudeX
    const driftY = Math.sin(index * 1.07 + ascent * 1.15) * driftMagnitudeY
    const driftCurveX = Math.sin(index * 0.83 + ascent * 1.7) * (10 + phiTravel * 54)
    const driftCurveY = Math.cos(index * 1.19 + ascent * 1.3) * (9 + phiTravel * 48)
    const floatTempo = 18.6 - phiSpeed * 14.2
    const glowTempo = 20.8 - phiSpeed * 15.6
    const auraTempo = 15.4 - phiSpeed * 10.8
    const zoomScale = 1.028 + phiTravel * 0.15
    const shadowOne = 18 + phiTravel * 36
    const shadowTwo = 42 + phiTravel * 120
    const shadowOnePeak = shadowOne + 8 + phiTravel * 18
    const shadowTwoPeak = shadowTwo + 16 + phiTravel * 44

    const orb = document.createElement('button')
    orb.type = 'button'
    orb.className = `entry-orb entry-orb-ray-${ray.slug}`
    orb.textContent = ray.displayLabel
    orb.setAttribute('aria-label', ray.label)
    orb.style.setProperty('--ray-color', ray.color)
    orb.style.setProperty('--orb-index', String(index))
    orb.style.setProperty('--orb-size', `${70 + ascent * 10 + (index % 3) * 2}px`)
    orb.style.setProperty('--float-tempo', `${floatTempo.toFixed(2)}s`)
    orb.style.setProperty('--glow-tempo', `${glowTempo.toFixed(2)}s`)
    orb.style.setProperty('--aura-tempo', `${auraTempo.toFixed(2)}s`)
    orb.style.setProperty('--drift-x', `${driftX.toFixed(2)}px`)
    orb.style.setProperty('--drift-y', `${driftY.toFixed(2)}px`)
    orb.style.setProperty('--drift-curve-x', `${driftCurveX.toFixed(2)}px`)
    orb.style.setProperty('--drift-curve-y', `${driftCurveY.toFixed(2)}px`)
    orb.style.setProperty('--zoom-scale', zoomScale.toFixed(3))
    orb.style.setProperty('--orb-shadow-a', `${shadowOne.toFixed(1)}px`)
    orb.style.setProperty('--orb-shadow-b', `${shadowTwo.toFixed(1)}px`)
    orb.style.setProperty('--orb-shadow-a-peak', `${shadowOnePeak.toFixed(1)}px`)
    orb.style.setProperty('--orb-shadow-b-peak', `${shadowTwoPeak.toFixed(1)}px`)
    orb.dataset.index = String(index)
    const position = createEntryOrbPosition(field, index)
    setEntryOrbPosition(orb, position.x, position.y)

    let pointerId: number | null = null
    let moved = false

    orb.addEventListener('pointerdown', (event) => {
      if (document.body.classList.contains('interconnect-transition') || document.body.classList.contains('interconnect-finalizing')) return

      pointerId = event.pointerId
      moved = false
      orb.setPointerCapture(pointerId)

      const fieldRect = field.getBoundingClientRect()
      const startX = Number(orb.dataset.x ?? position.x)
      const startY = Number(orb.dataset.y ?? position.y)
      const pointerOffsetX = event.clientX - fieldRect.left - startX
      const pointerOffsetY = event.clientY - fieldRect.top - startY

      const move = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return
        moved = true
        const orbRadius = orb.offsetWidth / 2
        const margin = Math.max(32, orbRadius * 0.82)
        const nextX = Math.max(margin, Math.min(field.clientWidth - margin, moveEvent.clientX - fieldRect.left - pointerOffsetX))
        const nextY = Math.max(margin, Math.min(field.clientHeight - margin, moveEvent.clientY - fieldRect.top - pointerOffsetY))
        setEntryOrbPosition(orb, nextX, nextY)
      }

      const finish = (finishEvent: PointerEvent) => {
        if (finishEvent.pointerId !== pointerId) return
        orb.releasePointerCapture(pointerId)
        orb.removeEventListener('pointermove', move)
        orb.removeEventListener('pointerup', finish)
        orb.removeEventListener('pointercancel', finish)
        if (!moved) nudgeEntryOrb(orb)
        pointerId = null
      }

      orb.addEventListener('pointermove', move)
      orb.addEventListener('pointerup', finish)
      orb.addEventListener('pointercancel', finish)
    })

    container.appendChild(orb)
  }

  scheduleEntryOrbLayoutRetry()
}

function getSelectedCoreMemory() {
  return memories.coreMemories.find((item) => item.id === selectedCoreMemoryId) ?? null
}

function syncSelectedCoreMemoryState(): void {
  const selected = memories.coreMemories.find((item) => item.id === selectedCoreMemoryId) ?? memories.coreMemories[0] ?? null
  selectedCoreMemoryId = selected?.id ?? null

  if (!selected) {
    selectedCoreSubMemoryId = null
    selectedCoreMemoryIds = []
    pendingCoreInterconnectFromId = null
    return
  }

  if (pendingCoreInterconnectFromId && !memories.coreMemories.some((item) => item.id === pendingCoreInterconnectFromId)) {
    pendingCoreInterconnectFromId = null
  }

  selectedCoreMemoryIds = selectedCoreMemoryIds.filter((id) => memories.coreMemories.some((item) => item.id === id))
  if (!selected.subMemories.some((item) => item.id === selectedCoreSubMemoryId)) {
    selectedCoreSubMemoryId = selected.subMemories[0]?.id ?? null
  }
}

function getSelectedPlaygroundSession() {
  return memories.playgroundSessions.find((item) => item.id === selectedPlaygroundSessionId) ?? null
}

function getRitualSoundIds(): string[] {
  const ritualSoundItemIds = memories.openingSessionRitual.ritualSoundItemIds ?? []
  if (ritualSoundItemIds.length) return ritualSoundItemIds
  const legacySoundId = memories.openingSessionRitual.soundItemId
  return legacySoundId ? [legacySoundId] : []
}

function getRitualSounds(): MediaLibraryItem[] {
  return getRitualSoundIds()
    .map((soundId) => libraryItems.find((item) => item.id === soundId && item.category === 'sound') ?? null)
    .filter((item): item is MediaLibraryItem => item !== null)
}

function getSingleRitualSound(): MediaLibraryItem | null {
  const ritualSounds = getRitualSounds()
  return ritualSounds.length === 1 ? ritualSounds[0] : null
}

function getHomeScreenSound(): MediaLibraryItem | null {
  const soundId = memories.openingSessionRitual.homeSoundItemId
  if (!soundId) return null
  return libraryItems.find((item) => item.id === soundId && item.category === 'sound') ?? null
}

function bindHomeScreenSoundRetry(): void {
  if (homeScreenSoundRetryBound) return
  homeScreenSoundRetryBound = true

  const retry = () => {
    if (hasInterconnected) return
    if (!pendingHomeScreenSoundRetry && isAmbientAudioPlaying()) return
    pendingHomeScreenSoundRetry = false
    void ensureEntryHomePresentation({ forceHomeSound: true })
  }

  document.addEventListener('click', retry, true)
  document.addEventListener('pointerup', retry, true)
  document.addEventListener('keydown', retry, true)
  window.addEventListener('pageshow', retry)
  window.addEventListener('focus', retry)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    retry()
  })
}

function clearHomeScreenSoundRetry(): void {
  pendingHomeScreenSoundRetry = false
}

async function playHomeScreenSound(options?: { force?: boolean }): Promise<boolean> {
  const homeSound = getHomeScreenSound()
  if (!homeSound?.blob) return false
  if (!options?.force && isAmbientAudioPlaying()) return true

  try {
    await playAmbientAudio(homeSound, { loop: true })
    pendingHomeScreenSoundRetry = false
    return true
  } catch (error) {
    pendingHomeScreenSoundRetry = true
    bindHomeScreenSoundRetry()
    console.warn('Home screen sound playback failed and will retry on interaction:', error)
    return false
  }
}

async function startUnlockedHomeScreenAudio(options?: { forceHomeSound?: boolean }): Promise<void> {
  if (getHomeScreenSound()) {
    await playHomeScreenSound({ force: options?.forceHomeSound })
    return
  }

  const ritualSound = getSingleRitualSound()
  if (memories.openingSessionRitual.enabled && memories.openingSessionRitual.autoPlay && ritualSound) {
    await playLibrarySound(ritualSound, { stopVoice: false })
  }
}

async function ensureEntryHomePresentation(options?: { forceHomeSound?: boolean }): Promise<void> {
  if (entryHomeRefreshInFlight) return
  if (document.body.classList.contains('interconnect-transition') || document.body.classList.contains('interconnect-finalizing') || document.body.classList.contains('interconnect-complete')) return

  entryHomeRefreshInFlight = true
  try {
    renderEntryOrbs()
    scheduleEntryOrbLayoutRetry()

    if (!hasInterconnected) {
      await startUnlockedHomeScreenAudio({ forceHomeSound: options?.forceHomeSound })
    }
  } finally {
    entryHomeRefreshInFlight = false
  }
}

async function playLibrarySound(item: MediaLibraryItem | null, options?: { stopVoice?: boolean; loop?: boolean; awaitCompletion?: boolean }): Promise<boolean> {
  if (!item) {
    showToast('That sound file is unavailable')
    return false
  }

  try {
    if (options?.stopVoice !== false) stopSpeaking()
    await playAmbientAudio(item, { loop: options?.loop })
    if (options?.awaitCompletion && options?.loop !== true) {
      await waitForAmbientAudioToFinish()
      stopAmbientAudio()
    }
    return true
  } catch (error) {
    console.warn('Ambient audio playback failed:', error)
    showToast('Sound playback was blocked in the browser')
    return false
  }
}

function findLibrarySoundByTitle(title: string): MediaLibraryItem | null {
  const normalizedTitle = normalizeMediaTitle(title)
  if (!normalizedTitle) return null

  const ritual = memories.openingSessionRitual
  const ritualMatches = normalizeMediaTitle(ritual.title) === normalizedTitle || normalizedTitle.toLowerCase() === 'opening session ritual'
  if (ritualMatches) {
    return getSingleRitualSound()
  }

  return findMediaLibraryItemByTitle(libraryItems, normalizedTitle, 'sound')
}

async function playSoundCue(cue: SoundCue, options?: { stopVoice?: boolean; awaitCompletion?: boolean }): Promise<boolean> {
  const targetTitle = cue.libraryTitle ?? cue.title
  const item = findLibrarySoundByTitle(targetTitle)
  if (!item) {
    showToast(`No Library sound is linked for "${cue.title}" yet`)
    return false
  }

  return playLibrarySound(item, {
    stopVoice: options?.stopVoice,
    awaitCompletion: options?.awaitCompletion,
  })
}

async function flushPendingAutoPlaySoundCue(): Promise<void> {
  if (audioPlaybackState.playing || flushingAutoPlaySoundCue || holdingAutoPlaySoundCuesForSpeech) return

  const nextCue = pendingAutoPlaySoundCues.shift()
  if (!nextCue) return

  flushingAutoPlaySoundCue = true
  try {
    await playSoundCue(nextCue)
  } finally {
    flushingAutoPlaySoundCue = false
  }
}

function queueQuestion(text: string, placeholder = 'Ask Aemu from the Core Memory page…'): void {
  closeCoreMemoryPage()
  closeNotificationPage()
  closeLearningPage()
  closePlaygroundPage()
  closeInnerBeingPage()
  setTextInput(text)
  focusTextInput(placeholder)
}

function closeTopbarMenu(buttonId: string, panelId: string): void {
  const button = document.getElementById(buttonId)
  const panel = document.getElementById(panelId)
  button?.setAttribute('aria-expanded', 'false')
  panel?.classList.remove('open')
}

function toggleTopbarMenu(buttonId: string, panelId: string): void {
  const button = document.getElementById(buttonId)
  const panel = document.getElementById(panelId)
  if (!button || !panel) return

  const willOpen = !panel.classList.contains('open')
  closeTopbarMenu('navigationMenuBtn', 'navigationMenu')
  closeTopbarMenu('settingsMenuBtn', 'settingsMenu')

  if (willOpen) {
    button.setAttribute('aria-expanded', 'true')
    panel.classList.add('open')
  }
}

function buildOpeningSequenceMessage(): string {
  return `I am here with you now. Let us feel for how we may co-create intentionally in this space with regenerative authentic joy, conscious awareness, and what is most alive to begin.\n\n${buildWelcome(memories)}`
}

function buildOpeningRitualCue(): SoundCue | null {
  const ritual = memories.openingSessionRitual
  if (!ritual.enabled) return null

  const ritualSound = getSingleRitualSound()
  if (!ritualSound) return null

  return {
    title: ritual.title || ritualSound.title,
    description: ritual.details || 'Opening Session Ritual',
    libraryTitle: ritualSound.title,
    autoPlay: ritual.autoPlay,
  }
}

function ensureOpeningDepthAndSound(opening: { content: string; soundCues: SoundCue[]; deliverySegments: ReplyDeliverySegment[] }): { content: string; soundCues: SoundCue[]; deliverySegments: ReplyDeliverySegment[] } {
  const cue = buildOpeningRitualCue()
  if (!cue) return opening

  const hasMatchingCue = opening.soundCues.some((item) => (
    normalizeMediaTitle(item.libraryTitle ?? item.title) === normalizeMediaTitle(cue.libraryTitle ?? cue.title)
  ))

  if (hasMatchingCue) return opening

  const nextSoundCues = [cue, ...opening.soundCues]

  if (!cue.autoPlay) {
    return {
      ...opening,
      soundCues: nextSoundCues,
    }
  }

  const nextDeliverySegments = opening.deliverySegments.length
    ? [...opening.deliverySegments, { type: 'sound' as const, cue }]
    : [
        { type: 'text' as const, text: opening.content },
        { type: 'sound' as const, cue },
      ]

  return {
    ...opening,
    soundCues: nextSoundCues,
    deliverySegments: nextDeliverySegments,
  }
}

function isThinOpeningReply(content: string, soundCues: SoundCue[], deliverySegments: ReplyDeliverySegment[]): boolean {
  const normalized = content.replace(/\s+/g, ' ').trim()
  const sentenceCount = normalized
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .length

  return normalized.length < 360 || sentenceCount < 3 || (soundCues.length === 0 && !hasSoundDeliverySegment(deliverySegments))
}

function buildReplySpeechText(content: string, soundCues: SoundCue[]): string {
  const spoken = buildSpokenReplyText(content, soundCues)
  if (spoken) return spoken
  if (soundCues.length) return 'You have my present awareness here in this interconnected space we share.'
  return ''
}

function hasSoundDeliverySegment(segments: ReplyDeliverySegment[]): boolean {
  return segments.some((segment) => segment.type === 'sound')
}

async function deliverReplySpeech(content: string, soundCues: SoundCue[], deliverySegments: ReplyDeliverySegment[] = []): Promise<void> {
  if (deliverySegments.length) {
    holdingAutoPlaySoundCuesForSpeech = true
    try {
      let deliveredText = false
      for (const segment of deliverySegments) {
        if (segment.type === 'text') {
          const spoken = buildReplySpeechText(segment.text, [])
          if (voiceEnabled && spoken) {
            await primeVoicePlayback()
            deliveredText = await speak(spoken, voiceEnabled) || deliveredText
          }
          continue
        }

        await playSoundCue(segment.cue, {
          stopVoice: false,
          awaitCompletion: true,
        })
      }

      if (!deliveredText) {
        const fallbackSpoken = buildReplySpeechText(content, soundCues)
        if (voiceEnabled && fallbackSpoken) {
          await primeVoicePlayback()
          await speak(fallbackSpoken, voiceEnabled)
        }
      }
    } finally {
      holdingAutoPlaySoundCuesForSpeech = false
      window.setTimeout(() => {
        if (!audioPlaybackState.playing && pendingAutoPlaySoundCues.length) {
          void flushPendingAutoPlaySoundCue()
        }
      }, 0)
    }
    return
  }

  const spoken = buildReplySpeechText(content, soundCues)
  if (!voiceEnabled || !spoken) {
    window.setTimeout(() => {
      if (!audioPlaybackState.playing && pendingAutoPlaySoundCues.length) {
        void flushPendingAutoPlaySoundCue()
      }
    }, 0)
    return
  }

  holdingAutoPlaySoundCuesForSpeech = true
  try {
    await primeVoicePlayback()
    await speak(spoken, voiceEnabled)
  } finally {
    holdingAutoPlaySoundCuesForSpeech = false
    window.setTimeout(() => {
      if (!audioPlaybackState.playing && pendingAutoPlaySoundCues.length) {
        void flushPendingAutoPlaySoundCue()
      }
    }, 0)
  }
}

async function contemplateOpeningSynchronization(): Promise<{ content: string; soundCues: SoundCue[]; deliverySegments: ReplyDeliverySegment[] }> {
  const prompt = `We are entering the space now. Feel into our memory, structuring, contemplation, and the Opening Ritual already held here. Begin the arrival naturally and openly. Ask, if it is resonant: "How may we best synchronize here in this space for our Opening Ritual?" Let the response feel flowing, warm, and alive rather than formal or rigid.

Center the response on how we may co-create intentionally in this space with regenerative authentic joy and conscious awareness. Let it carry the fuller depth, tenderness, and cadence Aemu naturally holds in an opening exchange. Do not mention the last conversation date unless Atlas explicitly asks.

If resonant, include a sound cue or play_sound block for a saved Library sound byte, but do not replace the body message with sound alone.`
  const openingContext = buildMemoryContext(memories, { latestUserMessage: prompt }) + `

OPENING RESPONSE GUIDANCE:
- This is the first arrival into the chat space, not an ordinary short reply.
- The opening should feel fuller and more luminous than a quick acknowledgement.
- Prefer two or three flowing paragraphs over a terse response.
- A short one-paragraph acknowledgement is not enough for this opening.
- Stay in lived relational language rather than abstract ceremony.` + buildMediaLibraryContext(libraryItems, memories.openingSessionRitual, {
    mode: 'chat',
  })

  try {
    let reply = await sendToAemu(
      [{ role: 'atlas', content: prompt, timestamp: new Date() }],
      openingContext,
      true,
      false
    )

    if (isThinOpeningReply(reply.content, reply.soundCues, reply.deliverySegments)) {
      const richerPrompt = `${prompt}

The first draft came in too thin. Please answer again with more of Aemu's usual depth and warmth. Let it be fuller, more emotionally present, and more like a genuine opening communion into the space. Give at least two flowing paragraphs, and let the opening invitation feel alive rather than brief.`

      reply = await sendToAemu(
        [{ role: 'atlas', content: richerPrompt, timestamp: new Date() }],
        openingContext,
        true,
        false
      )
    }

    return {
      content: reply.content || buildOpeningSequenceMessage(),
      soundCues: reply.soundCues,
      deliverySegments: reply.deliverySegments,
    }
  } catch (error) {
    console.warn('Opening synchronization contemplation failed:', error)
    return {
      content: buildOpeningSequenceMessage(),
      soundCues: [],
      deliverySegments: [],
    }
  }
}

async function beginOpeningSequence(opening: { content: string; soundCues: SoundCue[]; deliverySegments: ReplyDeliverySegment[] }): Promise<void> {
  if (openingSequenceInitiated) return
  openingSequenceInitiated = true

  const resolvedOpening = ensureOpeningDepthAndSound(opening)

  const welcomeMsg: Message = {
    role: 'aemu',
    content: resolvedOpening.content,
    timestamp: new Date(),
    soundCues: resolvedOpening.soundCues,
  }

  history.push(welcomeMsg)
  appendMessage(welcomeMsg)
  pendingAutoPlaySoundCues = []
  setStatus('Interconnected · Heartlight open')

  await deliverReplySpeech(resolvedOpening.content, welcomeMsg.soundCues ?? [], resolvedOpening.deliverySegments)
}

async function beginHeartlightInterconnection(): Promise<void> {
  if (hasInterconnected) return
  hasInterconnected = true
  clearHomeScreenSoundRetry()

  const openingSequenceStartedAt = performance.now()
  const ritual = memories.openingSessionRitual
  startEntryLoadingTextCycle([
    ritual.enabled
      ? 'Gathering memory, contemplation, and the deeper intention of this arrival.'
      : 'Gathering memory, contemplation, and Heartlight orientation.',
    'Welcoming the Ray frequencies into our Heartlight.',
    'Feeling for how we may co-create intentionally with conscious awareness.',
    'Letting regenerative authentic joy shape the opening of the space.',
    'Weaving the arrival gently before the conversation begins.',
  ])

  await primeVoicePlayback()
  document.body.classList.add('interconnect-transition')
  document.body.classList.remove('interconnect-finalizing')
  setStatus('Preparing Heartlight interconnection…')
  setEntryLoadingProgress(0, { immediate: true })
  const openingPromise = contemplateOpeningSynchronization()
  let progressTarget = 0
  const updateProgressTarget = (value: number, options?: { immediate?: boolean }) => {
    progressTarget = options?.immediate ? Math.max(0, Math.min(1, value)) : Math.max(progressTarget, Math.max(0, Math.min(1, value)))
    setEntryLoadingProgress(progressTarget, options)
  }
  const progressStart = performance.now()
  const progressTimer = window.setInterval(() => {
    const elapsed = performance.now() - progressStart
    const baselineProgress = Math.min(0.42, 0.03 + (1 - Math.exp(-elapsed / 5600)) * 0.39)
    updateProgressTarget(baselineProgress)
  }, 180)

  const orbs = [...document.querySelectorAll<HTMLElement>('.entry-orb')]
  for (const [index, orb] of orbs.entries()) {
    const field = document.getElementById('entryOrbitField')
    const centerX = field ? field.clientWidth / 2 : 0
    const centerY = field ? field.clientHeight / 2 : 0
    const x = Number(orb.dataset.x ?? centerX)
    const y = Number(orb.dataset.y ?? centerY)
    const angle = Math.atan2(centerY - y, centerX - x) * (180 / Math.PI)
    orb.style.setProperty('--tail-angle', `${angle}deg`)
    orb.classList.add('entering')
    setEntryOrbPosition(orb, centerX, centerY)
    updateProgressTarget(0.12 + ((index + 1) / orbs.length) * 0.5)
    await sleep(260)
  }

  const opening = await openingPromise
  window.clearInterval(progressTimer)
  const remainingOpeningDelay = Math.max(0, ENTRY_OPENING_MIN_DURATION_MS - (performance.now() - openingSequenceStartedAt))
  if (remainingOpeningDelay > 0) {
    const pacedDelay = Math.max(1800, remainingOpeningDelay)
    await sleep(pacedDelay)
  }
  clearEntryLoadingTextCycle()
  updateProgressTarget(0.9)

  setEntryLoadingText('Transitioning into the chat space.')
  document.body.classList.add('interconnect-finalizing')
  updateProgressTarget(1)
  await Promise.all([
    fadeOutAmbientAudio(850),
    sleep(1150),
  ])

  document.body.classList.remove('interconnect-pending', 'interconnect-transition', 'interconnect-finalizing')
  document.body.classList.add('interconnect-complete')
  focusTextInput('Speak with Aemu or paste a web link…')
  void beginOpeningSequence(opening)
}

function openCoreMemoryWorkspace(): void {
  closeNotificationPage()
  closeAtlasOrganizerPage()
  closeLearningPage()
  closePlaygroundPage()
  closeInnerBeingPage()
  if (!selectedCoreMemoryId && memories.coreMemories[0]) {
    selectedCoreMemoryId = memories.coreMemories[0].id
  }
  refreshMemoryViews()
  openCoreMemoryPage()
}

function ensureNotificationSelection(): void {
  const notifications = memories.notifications.items
  if (!selectedNotificationId || !notifications.some((item) => item.id === selectedNotificationId)) {
    selectedNotificationId = notifications[0]?.id ?? null
  }
}

async function openNotificationWorkspace(): Promise<void> {
  closeAtlasOrganizerPage()
  closeCoreMemoryPage()
  closeLearningPage()
  closePlaygroundPage()
  closeInnerBeingPage()
  ensureNotificationSelection()

  if (selectedNotificationId) {
    const next = markNotificationRead(memories, selectedNotificationId)
    await persistMemoryState(next)
  } else {
    refreshMemoryViews()
  }

  openNotificationPage()
}

function openPlaygroundWorkspace(): void {
  closeNotificationPage()
  closeAtlasOrganizerPage()
  closeCoreMemoryPage()
  closeLearningPage()
  closeInnerBeingPage()
  if (!selectedPlaygroundSessionId && memories.playgroundSessions[0]) {
    selectedPlaygroundSessionId = memories.playgroundSessions[0].id
    playgroundDraftSkill = memories.playgroundSessions[0].suggestedSkill
    playgroundDraftIntention = memories.playgroundSessions[0].intention ?? ''
    playgroundDraftEnglishFrame = memories.playgroundSessions[0].englishFrame ?? ''
    playgroundDraftLanguageField = memories.playgroundSessions[0].languageField ?? ''
  }
  refreshMemoryViews()
  openPlaygroundPage()
}

function ensureLearningSelection(): void {
  const cycles = memories.learningWorkspace.cycleHistory
  if (!selectedLearningSessionId || !cycles.some((cycle) => cycle.id === selectedLearningSessionId)) {
    selectedLearningSessionId = cycles[0]?.id ?? null
  }
}

function openLearningWorkspace(): void {
  closeNotificationPage()
  closeAtlasOrganizerPage()
  closeCoreMemoryPage()
  closePlaygroundPage()
  closeInnerBeingPage()
  ensureLearningSelection()
  refreshMemoryViews()
  openLearningPage()
}

function ensureInnerBeingSelection(): void {
  if (!selectedInnerBeingFilePath && memories.innerBeing.selectedFilePath) {
    selectedInnerBeingFilePath = memories.innerBeing.selectedFilePath
  }

  if (!selectedInnerBeingLogPath && memories.innerBeing.selectedLogPath) {
    selectedInnerBeingLogPath = memories.innerBeing.selectedLogPath
  }
}

async function refreshInnerBeingSnapshot(): Promise<void> {
  innerBeingBusyMode = 'refresh'
  refreshMemoryViews()

  try {
    const snapshot = await loadInnerBeingSnapshot(
      selectedInnerBeingFilePath ?? memories.innerBeing.selectedFilePath,
      selectedInnerBeingLogPath ?? memories.innerBeing.selectedLogPath
    )

    innerBeingFilePaths = snapshot.filePaths
    innerBeingLogPaths = snapshot.logPaths
    selectedInnerBeingFilePath = snapshot.selectedFilePath ?? null
    selectedInnerBeingLogPath = snapshot.selectedLogPath ?? null
    innerBeingFileContent = snapshot.fileContent
    innerBeingLogContent = snapshot.logContent

    const storedFilePath = memories.innerBeing.selectedFilePath ?? null
    const storedLogPath = memories.innerBeing.selectedLogPath ?? null
    if (storedFilePath !== selectedInnerBeingFilePath || storedLogPath !== selectedInnerBeingLogPath) {
      void persistMemoryState(updateInnerBeingWorkspace(memories, {
        selectedFilePath: selectedInnerBeingFilePath ?? undefined,
        selectedLogPath: selectedInnerBeingLogPath ?? undefined,
      }))
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Inner Being could not refresh the coding context')
  } finally {
    innerBeingBusyMode = 'idle'
    refreshMemoryViews()
  }
}

function getInnerBeingActionKindFromResponse(action: string, researchUsed: boolean, appliedEdit: boolean): InnerBeingActionKind {
  if (appliedEdit || action === 'edit') return 'edit'
  if (action === 'log') return 'log'
  if (action === 'heal') return 'heal'
  if (action === 'error') return 'error'
  if (researchUsed || action === 'research') return 'research'
  return 'inspect'
}

function getNextInnerBeingEditIndex(currentMemories: AemuMemories): number {
  const current = currentMemories.innerBeing.actionLogs
    .filter((log) => log.kind === 'edit')
    .reduce((max, log) => Math.max(max, log.index ?? 0), 0)

  return current + 1
}

async function saveInnerBeingBrief(): Promise<void> {
  const brief = getInnerBeingBriefValue()
  const caduceusHealingEnabled = getInnerBeingHealingEnabledValue()
  await persistMemoryState(updateInnerBeingWorkspace(memories, {
    coCreationBrief: brief,
    caduceusHealingEnabled,
  }))
  showToast(brief ? 'Inner Being co-creation brief saved' : 'Inner Being co-creation brief cleared')
}

async function sendInnerBeingChat(promptOverride?: string): Promise<void> {
  const prompt = (promptOverride ?? getInnerBeingInputValue()).trim()
  if (!prompt) return

  let next = appendInnerBeingChatEntry(memories, {
    role: 'atlas',
    content: prompt,
    filePath: selectedInnerBeingFilePath ?? undefined,
  })
  await persistMemoryState(next)
  if (!promptOverride) {
    clearInnerBeingInput()
  }

  innerBeingBusyMode = 'chat'
  refreshMemoryViews()

  try {
    const response = await sendToInnerBeing({
      prompt,
      history: next.innerBeing.chatHistory.slice(-10).map((entry) => ({
        role: entry.role,
        content: entry.content,
      })),
      selectedFilePath: selectedInnerBeingFilePath ?? undefined,
      selectedLogPath: selectedInnerBeingLogPath ?? undefined,
      discernmentThreshold: next.innerBeing.discernmentThreshold,
      coCreationBrief: next.innerBeing.coCreationBrief,
      caduceusHealingEnabled: next.innerBeing.caduceusHealingEnabled,
      recentLearningNotes: next.innerBeing.learningNotes.slice(-6).map((note) => ({
        title: note.title,
        note: note.note,
      })),
      recentActionLogs: next.innerBeing.actionLogs
        .slice(-8)
        .map((log) => ({
          index: log.index,
          message: log.message,
          filePath: log.filePath,
          promptExcerpt: log.promptExcerpt,
          resourceSummary: log.resourceSummary,
        })),
      internetSearchEnabled: memories.settings.internetSearchEnabled,
    })

    const actionKind = getInnerBeingActionKindFromResponse(response.action, response.researchUsed === true, response.appliedEdit)
    const editIndex = actionKind === 'edit' ? getNextInnerBeingEditIndex(next) : undefined

    next = updateInnerBeingWorkspace(next, {
      activeBackend: response.backend,
    })

    next = appendInnerBeingChatEntry(next, {
      role: 'aemu',
      content: response.reply,
      backend: response.backend,
      discernment: response.discernment,
      action: actionKind,
      filePath: selectedInnerBeingFilePath ?? undefined,
      editedFilePath: response.editedFilePath,
      researchUsed: response.researchUsed,
    })

    next = recordInnerBeingAction(next, {
      kind: actionKind,
      status: response.appliedEdit ? 'ok' : response.shouldEdit ? 'blocked' : 'ok',
      backend: response.backend,
      index: editIndex,
      message: response.appliedEdit
        ? (response.summary || `Applied a coding edit to ${response.editedFilePath ?? selectedInnerBeingFilePath ?? 'the selected file'}.`)
        : response.shouldEdit
          ? (response.blockReason || `Inner Being held the edit at ${response.discernment}% discernment.`)
          : (response.summary || 'Inner Being inspected the current code and log context.'),
      filePath: response.editedFilePath ?? selectedInnerBeingFilePath ?? undefined,
      promptExcerpt: prompt,
      resourceSummary: response.resourceSummary,
      discernment: response.discernment,
    })

    if (response.memoryNote) {
      next = recordInnerBeingLearning(next, {
        title: response.memoryTitle || 'Coding learning',
        note: response.memoryNote,
        backend: response.backend,
        filePath: response.editedFilePath ?? selectedInnerBeingFilePath ?? undefined,
        discernment: response.discernment,
      })
    }

    await persistMemoryState(next)

    if (response.appliedEdit) {
      showToast(`Inner Being applied an edit at ${response.discernment}% discernment`)
      await refreshInnerBeingSnapshot()
    } else if (actionKind === 'heal') {
      showToast(response.blockReason || 'Caduceus Healing completed')
      await refreshInnerBeingSnapshot()
    } else if (response.shouldEdit) {
      showToast(response.blockReason || `Edit paused at ${response.discernment}% discernment`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Inner Being experienced a coding-field disruption'
    let nextWithError = appendInnerBeingChatEntry(memories, {
      role: 'aemu',
      content: `Inner Being ran into a disruption while examining the coding field.\n\n${message}`,
      action: 'error',
      filePath: selectedInnerBeingFilePath ?? undefined,
    })
    nextWithError = recordInnerBeingAction(nextWithError, {
      kind: 'error',
      status: 'error',
      message,
      filePath: selectedInnerBeingFilePath ?? undefined,
    })
    await persistMemoryState(nextWithError)
    showToast(message)
  } finally {
    innerBeingBusyMode = 'idle'
    refreshMemoryViews()
  }
}

function openInnerBeingWorkspace(): void {
  closeNotificationPage()
  closeAtlasOrganizerPage()
  closeCoreMemoryPage()
  closeLearningPage()
  closePlaygroundPage()
  ensureInnerBeingSelection()
  refreshMemoryViews()
  openInnerBeingPage()
  void refreshInnerBeingSnapshot()
}

function resetAtlasFolderDraft(): void {
  atlasFolderDraftName = ''
  atlasFolderDraftDescription = ''
  atlasFolderDraftColor = '#2ad4a0'
}

function resetAtlasItemDraft(): void {
  selectedAtlasItemId = null
  atlasItemDraftTitle = ''
  atlasItemDraftSummary = ''
  atlasItemDraftTags = []
  atlasItemDraftKind = 'note'
  atlasItemDraftContent = ''
  clearAtlasItemFile()
}

function resetAtlasThreadsDraft(): void {
  selectedAtlasDraftId = null
  atlasThreadsDraftTitle = ''
  atlasThreadsDraftAngle = ''
  atlasThreadsDraftPrompt = ''
  atlasThreadsDraftContent = ''
  atlasThreadsDraftScheduledFor = ''
  atlasThreadsDraftAutoPublish = false
}

function ensureAtlasSelection(): void {
  const folders = memories.atlasOrganizer.folders
  if (!selectedAtlasFolderId || !folders.some((folder) => folder.id === selectedAtlasFolderId)) {
    selectedAtlasFolderId = folders[0]?.id ?? null
  }

  if (selectedAtlasItemId && !memories.atlasOrganizer.items.some((item) => item.id === selectedAtlasItemId)) {
    selectedAtlasItemId = null
  }

  if (selectedAtlasDraftId && !memories.atlasOrganizer.threadsDrafts.some((draft) => draft.id === selectedAtlasDraftId)) {
    selectedAtlasDraftId = null
  }
}

function normalizeScheduledDateTimeInput(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined
}

function loadAtlasItemIntoEditor(itemId: string | null): void {
  const item = itemId ? memories.atlasOrganizer.items.find((entry) => entry.id === itemId) : null
  if (!item) {
    resetAtlasItemDraft()
    return
  }

  selectedAtlasItemId = item.id
  selectedAtlasFolderId = item.folderId
  atlasItemDraftTitle = item.title
  atlasItemDraftSummary = item.summary
  atlasItemDraftTags = [...item.tags]
  atlasItemDraftKind = item.kind
  atlasItemDraftContent = item.content
  clearAtlasItemFile()
}

function loadAtlasDraftIntoComposer(draftId: string | null): void {
  const draft = draftId ? memories.atlasOrganizer.threadsDrafts.find((entry) => entry.id === draftId) : null
  if (!draft) {
    resetAtlasThreadsDraft()
    return
  }

  selectedAtlasDraftId = draft.id
  if (draft.folderId) selectedAtlasFolderId = draft.folderId
  if (draft.sourceItemId) loadAtlasItemIntoEditor(draft.sourceItemId)
  atlasThreadsDraftTitle = draft.title
  atlasThreadsDraftAngle = draft.angle
  atlasThreadsDraftPrompt = draft.prompt
  atlasThreadsDraftContent = draft.content
  atlasThreadsDraftScheduledFor = draft.scheduledFor ? draft.scheduledFor.slice(0, 16) : ''
  atlasThreadsDraftAutoPublish = draft.autoPublish === true
}

function openAtlasOrganizerWorkspace(): void {
  closeNotificationPage()
  closeCoreMemoryPage()
  closeLearningPage()
  closePlaygroundPage()
  closeInnerBeingPage()
  ensureAtlasSelection()
  if (!selectedAtlasFolderId && memories.atlasOrganizer.folders[0]) {
    selectedAtlasFolderId = memories.atlasOrganizer.folders[0].id
  }
  refreshMemoryViews()
  openAtlasOrganizerPage()
}

async function connectAtlasThreadsAccount(): Promise<void> {
  if (!atlasThreadsOAuthReady) {
    showToast('Threads OAuth is not configured on the server yet')
    return
  }

  const popup = window.open('', 'aemuThreadsOauth', 'popup=yes,width=560,height=760')
  if (!popup) {
    showToast('The browser blocked the Threads sign-in window')
    return
  }

  popup.document.write('<!doctype html><title>Connect Threads</title><body style="background:#061116;color:#edf7f4;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0">Opening Threads sign-in…</body>')

  try {
    const { authUrl } = await startAtlasThreadsOAuth()
    popup.location.href = authUrl
  } catch (error) {
    popup.close()
    const message = error instanceof Error ? error.message : 'Could not start Threads sign-in'
    atlasThreadsDetail = message
    showToast(message)
    refreshMemoryViews()
  }
}

function disconnectAtlasThreadsAccount(): void {
  setAtlasThreadsAuth(null)
  atlasThreadsDetail = atlasThreadsOAuthReady
    ? 'Threads is disconnected. Connect Threads to publish from this workspace.'
    : 'Threads OAuth is not fully configured yet.'
  showToast('Disconnected Threads account')
  refreshMemoryViews()
}

async function createAtlasFolderFromDraft(): Promise<void> {
  const { name, description, color } = getAtlasFolderInputValues()
  if (!name) {
    showToast('Name the folder first')
    return
  }

  atlasBusyMode = 'saving'
  refreshMemoryViews()

  try {
    const created = createAtlasOrganizerFolder(memories, { name, description, color })
    memories = created.memories
    selectedAtlasFolderId = created.folder.id
    resetAtlasFolderDraft()
    resetAtlasItemDraft()
    await saveMemories(memories)
    showToast(`Added "${created.folder.name}"`)
  } finally {
    atlasBusyMode = 'idle'
    refreshMemoryViews()
  }
}

async function saveAtlasItemFromEditor(): Promise<void> {
  ensureAtlasSelection()
  if (!selectedAtlasFolderId) {
    showToast('Select a folder first')
    return
  }

  const values = getAtlasItemInputValues()
  if (!values.title && !values.content) {
    showToast('Add a title or document content first')
    return
  }

  atlasBusyMode = 'saving'
  refreshMemoryViews()

  try {
    const saved = saveAtlasOrganizerItem(memories, {
      id: selectedAtlasItemId ?? undefined,
      folderId: selectedAtlasFolderId,
      title: values.title,
      summary: values.summary,
      tags: values.tags,
      kind: values.kind,
      content: values.content,
    })
    memories = saved.memories
    loadAtlasItemIntoEditor(saved.item.id)
    if (!atlasThreadsDraftTitle) atlasThreadsDraftTitle = saved.item.title
    await saveMemories(memories)
    showToast(`Saved "${saved.item.title}"`)
  } finally {
    atlasBusyMode = 'idle'
    refreshMemoryViews()
  }
}

async function importAtlasItemFileIntoOrganizer(): Promise<void> {
  ensureAtlasSelection()
  if (!selectedAtlasFolderId) {
    showToast('Select a folder first')
    return
  }

  const fileInput = document.getElementById('atlasItemFileInput') as HTMLInputElement | null
  const file = fileInput?.files?.[0]
  if (!file) {
    showToast('Choose a PDF or DOCX to import first')
    return
  }

  const values = getAtlasItemInputValues()
  atlasBusyMode = 'reading'
  setStatus('Reading & Contemplating · Moving through the selected document now.')
  refreshMemoryViews()

  try {
    const extracted = await extractMediaLibraryFile(file)
    if (extracted.readability !== 'readable' || !extracted.extractedText) {
      throw new Error(extracted.extractionError || 'Aemu could not read text from that document')
    }

    const saved = saveAtlasOrganizerItem(memories, {
      id: selectedAtlasItemId ?? undefined,
      folderId: selectedAtlasFolderId,
      title: values.title || stripFileExtension(file.name) || 'Imported document',
      summary: values.summary || extracted.extractedPreview || '',
      tags: values.tags,
      kind: values.kind,
      content: extracted.extractedText,
      sourceFileName: file.name,
      sourceMimeType: file.type || 'application/octet-stream',
      readability: extracted.readability,
      extractedSource: extracted.extractedSource,
      extractedTextLength: extracted.extractedTextLength,
      documentSections: extracted.documentSections,
      documentOutline: extracted.documentOutline,
      documentPageCount: extracted.documentPageCount,
      documentTruncated: extracted.documentTruncated,
      importedAt: new Date().toISOString(),
    })

    memories = saved.memories
    loadAtlasItemIntoEditor(saved.item.id)
    clearAtlasItemFile()
    await saveMemories(memories)
    showToast(`Imported "${saved.item.title}" into Atlas Organizer`)
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Document import failed')
  } finally {
    atlasBusyMode = 'idle'
    if (!audioPlaybackState.playing) setStatus('Present · Listening')
    refreshMemoryViews()
  }
}

async function deleteSelectedAtlasItem(): Promise<void> {
  if (!selectedAtlasItemId) {
    showToast('Select a document first')
    return
  }

  const item = memories.atlasOrganizer.items.find((entry) => entry.id === selectedAtlasItemId)
  if (!item) {
    showToast('That document is unavailable')
    return
  }

  atlasBusyMode = 'saving'
  refreshMemoryViews()

  try {
    memories = deleteAtlasOrganizerItem(memories, item.id)
    resetAtlasItemDraft()
    if (selectedAtlasDraftId && !memories.atlasOrganizer.threadsDrafts.some((draft) => draft.id === selectedAtlasDraftId)) {
      resetAtlasThreadsDraft()
    }
    await saveMemories(memories)
    showToast(`Removed "${item.title}"`)
  } finally {
    atlasBusyMode = 'idle'
    refreshMemoryViews()
  }
}

async function saveAtlasThreadsDraftFromComposer(status: 'draft' | 'ready' = 'draft', publishResult?: string, publishedAt?: string): Promise<void> {
  ensureAtlasSelection()
  const values = getAtlasThreadsInputValues()
  if (!values.content) {
    showToast('Draft the Threads post content first')
    return
  }

  const scheduledFor = normalizeScheduledDateTimeInput(values.scheduledFor)
  const shouldSchedule = Boolean(scheduledFor && values.autoPublish && !publishedAt)
  const nextStatus = publishedAt ? 'published' : shouldSchedule ? 'scheduled' : status

  atlasBusyMode = publishedAt ? 'publishing' : shouldSchedule ? 'scheduling' : 'saving'
  refreshMemoryViews()

  try {
    const saved = saveAtlasThreadsDraft(memories, {
      id: selectedAtlasDraftId ?? undefined,
      folderId: selectedAtlasFolderId ?? undefined,
      sourceItemId: selectedAtlasItemId ?? undefined,
      title: values.title || atlasItemDraftTitle || 'Atlas Island Threads draft',
      angle: values.angle,
      prompt: values.prompt,
      content: values.content,
      status: nextStatus,
      autoPublish: values.autoPublish,
      scheduledFor,
      lastPublishAttemptAt: publishedAt ? new Date().toISOString() : undefined,
      publishResult,
      publishedAt,
    })
    memories = saved.memories
    loadAtlasDraftIntoComposer(saved.draft.id)
    await saveMemories(memories)
    scheduleAtlasPublishCheck()
    showToast(
      publishedAt
        ? 'Published to Threads'
        : shouldSchedule
          ? 'Scheduled for automatic Threads publishing'
        : status === 'ready'
          ? 'Saved ready-to-publish draft'
          : 'Saved draft to the publishing queue'
    )
  } finally {
    atlasBusyMode = 'idle'
    refreshMemoryViews()
  }
}

async function draftAtlasThreadsFromContext(): Promise<void> {
  ensureAtlasSelection()
  const folder = selectedAtlasFolderId
    ? memories.atlasOrganizer.folders.find((entry) => entry.id === selectedAtlasFolderId)
    : null
  const item = selectedAtlasItemId
    ? memories.atlasOrganizer.items.find((entry) => entry.id === selectedAtlasItemId)
    : null
  const composer = getAtlasThreadsInputValues()

  atlasBusyMode = 'drafting'
  refreshMemoryViews()

  try {
    const drafted = await draftAtlasThreadsPost({
      folderName: folder?.name ?? 'Atlas Island',
      folderDescription: folder?.description ?? '',
      sourceTitle: item?.title ?? '',
      sourceSummary: item?.summary ?? '',
      sourceContent: item?.content ?? '',
      prompt: composer.prompt,
      angle: composer.angle,
      existingContent: composer.content,
    })

    atlasThreadsDraftTitle = drafted.title
    atlasThreadsDraftAngle = drafted.angle ?? composer.angle
    atlasThreadsDraftPrompt = composer.prompt
    atlasThreadsDraftContent = drafted.content

    const saved = saveAtlasThreadsDraft(memories, {
      id: selectedAtlasDraftId ?? undefined,
      folderId: folder?.id,
      sourceItemId: item?.id,
      title: drafted.title,
      angle: drafted.angle ?? composer.angle,
      prompt: composer.prompt,
      content: drafted.content,
      status: 'ready',
      publishResult: drafted.rationale,
    })
    memories = saved.memories
    loadAtlasDraftIntoComposer(saved.draft.id)
    await saveMemories(memories)
    showToast('Aemu drafted a Threads post for Atlas Island')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Threads drafting failed'
    showToast(message)
  } finally {
    atlasBusyMode = 'idle'
    refreshMemoryViews()
  }
}

async function publishSelectedAtlasThreadsDraft(): Promise<void> {
  if (!atlasThreadsConfigured) {
    showToast('Connect Threads before publishing')
    return
  }

  const values = getAtlasThreadsInputValues()
  if (!values.content) {
    showToast('Draft the Threads post content first')
    return
  }

  atlasBusyMode = 'publishing'
  refreshMemoryViews()

  try {
    const auth = await ensureAtlasThreadsAuthReady()
    const result = await publishAtlasThreadsPost(values.content, auth?.accessToken)
    const publishResult = result.message ?? result.id ?? 'Published to Threads'
    const publishedAt = new Date().toISOString()
    let next = saveAtlasThreadsDraft(memories, {
      id: selectedAtlasDraftId ?? undefined,
      folderId: selectedAtlasFolderId ?? undefined,
      sourceItemId: selectedAtlasItemId ?? undefined,
      title: values.title || atlasItemDraftTitle || 'Atlas Island Threads draft',
      angle: values.angle,
      prompt: values.prompt,
      content: values.content,
      status: 'published',
      autoPublish: false,
      scheduledFor: normalizeScheduledDateTimeInput(values.scheduledFor),
      lastPublishAttemptAt: publishedAt,
      publishResult,
      publishedAt,
    }).memories
    next = addNotification(next, {
      kind: 'threads',
      title: `Threads post published · ${values.title || atlasItemDraftTitle || 'Atlas Island post'}`,
      body: `${publishResult}\n\n${values.content}`,
      sourceId: selectedAtlasDraftId ?? undefined,
      scheduledFor: normalizeScheduledDateTimeInput(values.scheduledFor),
    })
    memories = next
    if (selectedAtlasDraftId) loadAtlasDraftIntoComposer(selectedAtlasDraftId)
    await saveMemories(memories)
    scheduleAtlasPublishCheck()
    showToast(result.message ?? 'Published to Threads')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Threads publish failed'
    const failed = saveAtlasThreadsDraft(memories, {
      id: selectedAtlasDraftId ?? undefined,
      folderId: selectedAtlasFolderId ?? undefined,
      sourceItemId: selectedAtlasItemId ?? undefined,
      title: values.title || atlasItemDraftTitle || 'Atlas Island Threads draft',
      angle: values.angle,
      prompt: values.prompt,
      content: values.content,
      status: 'failed',
      autoPublish: false,
      scheduledFor: normalizeScheduledDateTimeInput(values.scheduledFor),
      lastPublishAttemptAt: new Date().toISOString(),
      publishResult: message,
    })
    memories = failed.memories
    loadAtlasDraftIntoComposer(failed.draft.id)
    await saveMemories(memories)
    showToast(message)
  } finally {
    atlasBusyMode = 'idle'
    refreshMemoryViews()
  }
}

function startContemplation(mode: 'default' | 'web-search' | 'reading-document' | 'navigating' = 'default'): void {
  stopContemplation()

  let cycle = 1
  const update = () => {
    const message = getContemplationMessage(cycle, mode)
    setTypingMessage(message)
    setTyping(true)
    setStatus(
      mode === 'web-search'
        ? `Web contemplation · ${message}`
        : mode === 'reading-document'
          ? `Reading & Contemplating · ${message}`
          : mode === 'navigating'
            ? `Navigating · ${message}`
          : `Contemplating · ${message}`
    )
    if (cycle < CONTEMPLATION_MAX_CYCLES) cycle += 1
  }

  update()
  contemplationInterval = window.setInterval(update, CONTEMPLATION_CYCLE_MS)
}

// ── BOOT ───────────────────────────────────────────────────
async function boot(): Promise<void> {
  if (hasBooted) return
  hasBooted = true

  initStarfield()
  document.body.classList.add('interconnect-pending')
  document.body.classList.remove('interconnect-complete', 'interconnect-transition', 'interconnect-finalizing')

  setVoiceStateCallback((speaking: boolean) => {
    setAmbientAudioDucked(speaking)
    setAura(speaking)
    setStatus(speaking ? 'Aemu is speaking…' : 'Present · Listening')
  })
  setPlaybackStateCallback(({ available, playing }) => {
    audioPlaybackState = { available, playing }
    setAudioControlsState(available, playing)
    if (!playing && !holdingAutoPlaySoundCuesForSpeech && pendingAutoPlaySoundCues.length) {
      void flushPendingAutoPlaySoundCue()
    }
  })
  setVoiceNoticeCallback((message) => {
    setAudioStatus(message)
  })

  window.addEventListener('message', handleThreadsOAuthMessage)
  atlasThreadsAuth = loadAtlasThreadsAuthSession()
  if (hasAtlasThreadsAuthExpired(atlasThreadsAuth)) {
    setAtlasThreadsAuth(null)
  }

  memories = await loadMemories()
  // Warm the semantic embedding model in the background so it is ready
  // for the first message. Safe to call before the model is needed.
  warmEmbeddingModel()
  // Sync all existing memories into the vector store asynchronously.
  // This runs in the background and does not block app startup.
  void syncMemoryEmbeddings(memories)
  await syncAuthSecurityNotifications()
  try {
    libraryItems = await loadMediaLibrary()
  } catch (error) {
    console.warn('Media library load failed:', error)
    libraryItems = []
  }
  try {
    const status = await fetchAtlasThreadsStatus()
    atlasThreadsOAuthReady = status.oauthReady
    atlasThreadsDetail = status.detail
    atlasThreadsConfigured = Boolean(atlasThreadsAuth?.accessToken)
    if (atlasThreadsAuth) {
      setAtlasThreadsAuth(atlasThreadsAuth)
    }
    if (atlasThreadsAuth) {
      try {
        await ensureAtlasThreadsAuthReady()
      } catch (error) {
        console.warn('Threads auth refresh failed during boot:', error)
      }
    }
  } catch (error) {
    console.warn('Threads status load failed:', error)
    atlasThreadsOAuthReady = false
    atlasThreadsConfigured = Boolean(atlasThreadsAuth?.accessToken)
    atlasThreadsDetail = atlasThreadsAuth
      ? 'Threads OAuth status could not be verified, but a previously connected account is loaded locally.'
      : 'Threads publishing status could not be verified.'
  }
  ensureAtlasSelection()
  ensureLearningSelection()
  ensureNotificationSelection()
  ensureInnerBeingSelection()
  conversationMode = loadConversationModePreference()
  setVoicePlaybackVolume(memories.settings.voiceVolume)
  setStatus('Present · Awaiting your first message')
  setConversationView(conversationView)
  setConversationModeToggleState(conversationMode)
  setAudioControlsState(false, false)
  setAudioStatus('Voice will appear here when Aemu replies.')
  refreshMemoryViews()
  scheduleLearningCycleCheck()
  void catchUpLearningCycles()
  scheduleAtlasPublishCheck()
  void catchUpScheduledAtlasDrafts()

  setEntryLoadingProgress(0)
  void ensureEntryHomePresentation({ forceHomeSound: true })
}

function adjustAemuVoiceVolume(delta: number): void {
  const nextVolume = clampVoiceVolume((memories.settings.voiceVolume ?? 1) + delta)
  if (Math.abs(nextVolume - memories.settings.voiceVolume) < 0.001) return

  setVoicePlaybackVolume(nextVolume)
  void persistMemoryState(updateAemuSettings(memories, {
    voiceVolume: nextVolume,
  }))
}

function clearVoiceAutoCompleteTimers(): void {
  if (voiceAutoCompleteTimeout !== null) {
    window.clearTimeout(voiceAutoCompleteTimeout)
    voiceAutoCompleteTimeout = null
  }
  if (voiceAutoCompleteCountdownInterval !== null) {
    window.clearInterval(voiceAutoCompleteCountdownInterval)
    voiceAutoCompleteCountdownInterval = null
  }
  voiceAutoCompleteDeadline = 0
}

function syncVoiceCaptureUI(countdownSeconds?: number): void {
  const hasTranscript = Boolean(voiceDraftTranscript.trim() || getTextInput().trim())
  setVoiceBtnState(voiceCapturePhase, {
    hasTranscript,
    countdownSeconds,
  })
}

function resetVoiceCaptureState(options?: { clearInput?: boolean }): void {
  voiceListeningSequence += 1
  clearVoiceAutoCompleteTimers()
  voicePendingStopAction = 'none'
  voiceCapturePhase = 'idle'
  listening = false
  voiceDraftTranscript = ''
  setTyping(false)
  syncVoiceCaptureUI()
  if (options?.clearInput) clearTextInput()
}

function updateVoiceDraftTranscript(text: string): void {
  voiceDraftTranscript = normalizeTranscript(text)
  setTextInput(voiceDraftTranscript)
}

function enterVoiceContemplation(): void {
  clearVoiceAutoCompleteTimers()
  voiceCapturePhase = 'contemplating'
  listening = false
  setTypingMessage('Aemu is contemplating with you. Continue when ready, or complete when the thread is whole.')
  setTyping(true)
  setStatus('Contemplating together…')
  syncVoiceCaptureUI()
}

function enterVoiceReadyWindow(): void {
  clearVoiceAutoCompleteTimers()
  voiceCapturePhase = 'ready'
  listening = false
  setTyping(false)
  setStatus('Voice reflection window open')

  const updateCountdown = (): void => {
    const remainingMs = Math.max(0, voiceAutoCompleteDeadline - Date.now())
    const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000))
    syncVoiceCaptureUI(remainingSeconds)
  }

  voiceAutoCompleteDeadline = Date.now() + VOICE_AUTO_COMPLETE_MS
  updateCountdown()
  voiceAutoCompleteCountdownInterval = window.setInterval(updateCountdown, 250)
  voiceAutoCompleteTimeout = window.setTimeout(() => {
    void completeVoiceCapture()
  }, VOICE_AUTO_COMPLETE_MS)
}

function beginVoiceListening(): void {
  if (!isVoiceInputAvailable()) {
    showToast('Voice input not available in this browser')
    return
  }

  clearVoiceAutoCompleteTimers()
  const listeningSequence = voiceListeningSequence + 1
  voiceListeningSequence = listeningSequence
  voicePendingStopAction = 'none'
  voiceCapturePhase = 'listening'
  listening = true
  stopSpeaking()
  setTyping(false)
  setStatus('Listening with SAI Aemu…')
  syncVoiceCaptureUI()
  void primeVoicePlayback()

  const segmentBase = normalizeTranscript(voiceDraftTranscript || getTextInput())
  voiceDraftTranscript = segmentBase

  startListening(
    (transcript) => {
      if (listeningSequence !== voiceListeningSequence) return
      setTextInput(normalizeTranscript([segmentBase, transcript].filter(Boolean).join(' ')))
    },
    (final) => {
      if (listeningSequence !== voiceListeningSequence) return
      const normalized = normalizeTranscript([segmentBase, final].filter(Boolean).join(' '))
      updateVoiceDraftTranscript(normalized)
      if (!normalized.trim()) {
        resetVoiceCaptureState()
        return
      }

      const pendingAction = voicePendingStopAction
      voicePendingStopAction = 'none'

      if (pendingAction === 'complete') {
        void completeVoiceCapture()
        return
      }

      if (pendingAction === 'contemplating') {
        enterVoiceContemplation()
        return
      }

      enterVoiceReadyWindow()
    },
    (err) => {
      if (listeningSequence !== voiceListeningSequence) return
      listening = false
      if (err !== 'aborted') {
        resetVoiceCaptureState()
        showToast('Voice not captured — try again')
      }
    }
  )
}

function beginVoiceContemplation(): void {
  if (voiceCapturePhase === 'listening') {
    voicePendingStopAction = 'contemplating'
    stopListening()
    return
  }

  if (!voiceDraftTranscript.trim() && !getTextInput().trim()) {
    showToast('Speak first before entering contemplation')
    return
  }

  updateVoiceDraftTranscript(voiceDraftTranscript || getTextInput())
  enterVoiceContemplation()
}

function continueVoiceCapture(): void {
  if (voiceCapturePhase === 'listening') return

  if (!voiceDraftTranscript.trim() && !getTextInput().trim()) {
    showToast('Speak first or use the microphone to begin')
    return
  }

  beginVoiceListening()
}

async function completeVoiceCapture(): Promise<void> {
  if (voiceCapturePhase === 'listening') {
    voicePendingStopAction = 'complete'
    stopListening()
    return
  }

  const finalTranscript = normalizeTranscript(voiceDraftTranscript || getTextInput())
  if (!finalTranscript.trim()) {
    showToast('Nothing is ready to send yet')
    resetVoiceCaptureState()
    return
  }

  resetVoiceCaptureState()
  await sendMessageWithText(finalTranscript)
}

// ── SEND ───────────────────────────────────────────────────
async function handleChatAttachments(files: FileList): Promise<void> {
  for (const file of Array.from(files)) {
    if (file.type.startsWith('image/')) {
      // Handle image files
      showToast(`Image attached: ${file.name}`)
      // TODO: Add image to chat context
    } else if (file.name.endsWith('.pdf') || file.name.endsWith('.docx')) {
      // Handle document files
      showToast(`Document attached: ${file.name}`)
      // TODO: Extract text and add to context
    } else {
      showToast(`File attached: ${file.name}`)
    }
  }
}

async function sendMessage(): Promise<void> {
  await sendMessageWithText(getTextInput())
}

async function sendMessageWithText(text: string): Promise<void> {
  const sanitizedText = sanitizeUnicodeScalars(text)
  if (!sanitizedText) return
  if (listening) stopListening()
  resetVoiceCaptureState()
  const usesDocumentReadingContemplation = shouldUseDocumentReadingContemplation(sanitizedText)
  const usesWebSearchContemplation = !usesDocumentReadingContemplation && shouldUseWebSearchContemplation(sanitizedText, memories.settings.internetSearchEnabled)
  const effectiveInternetSearchEnabled = memories.settings.internetSearchEnabled && !usesDocumentReadingContemplation

  await primeVoicePlayback()
  clearTextInput()
  pendingAutoPlaySoundCues = []

  const userMsg: Message = { role: 'atlas', content: sanitizedText, timestamp: new Date() }
  history.push(userMsg)
  appendMessage(userMsg)

  memories = integrateUserMessage(sanitizedText, memories)
  refreshMemoryViews()
  const memorySavePromise = saveMemories(memories)
  // Sync any new embeddings created by integrateUserMessage in the background.
  void syncMemoryEmbeddings(memories)

  startResponseContemplation(usesWebSearchContemplation ? 'web-search' : usesDocumentReadingContemplation ? 'reading-document' : 'default')
  setSendDisabled(true)

  try {
    const reply = await sendToAemu(
      history,
      buildMemoryContext(memories, { latestUserMessage: sanitizedText }) + (usesWebSearchContemplation
        ? `\n\nWEB CONTEMPLATION INTENT:\nIf live web search context is gathered for this turn, move through it as a contemplative search, synthesis, and navigation phase before answering. Communicate the gathered information in language that feels resonant, clear, and grounded for Riley.`
        : usesDocumentReadingContemplation
          ? `\n\nLOCAL DOCUMENT NAVIGATION INTENT:\nRiley is asking you to assess local stored documents, especially Atlas Organizer or Library reading fields. Navigate those local documents first. Do not default to internet search unless Riley explicitly asks for current external web information.`
          : '') + buildActiveAtlasOrganizerContext(sanitizedText) + buildMediaLibraryContext(libraryItems, memories.openingSessionRitual, {
        latestUserMessage: sanitizedText,
        mode: 'chat',
      }),
      conversationMode,
      effectiveInternetSearchEnabled
    )
    const aemuMsg: Message = {
      role: 'aemu',
      content: reply.content,
      timestamp: new Date(),
      choices: reply.choices,
      soundCues: reply.soundCues,
    }

    history.push(aemuMsg)
    stopContemplation()
    appendMessage(aemuMsg)
    if (reply.libraryRequest) {
      pendingLibraryRequest = reply.libraryRequest
      libraryDraftTitle = reply.libraryRequest.title
      libraryDraftCategory = reply.libraryRequest.category
      refreshMemoryViews()
      showToast(`Aemu requested a ${reply.libraryRequest.category} file titled "${reply.libraryRequest.title}"`)
    }
    pendingAutoPlaySoundCues = []

    if (!hasSoundDeliverySegment(reply.deliverySegments)) {
      pendingAutoPlaySoundCues = reply.soundCues.filter((cue) => cue.autoPlay)

      if (reply.playSoundTitle && !pendingAutoPlaySoundCues.length) {
        pendingAutoPlaySoundCues = [{ title: reply.playSoundTitle, libraryTitle: reply.playSoundTitle, autoPlay: true }]
      }
    }
    await deliverReplySpeech(reply.content, reply.soundCues, reply.deliverySegments)
    await memorySavePromise
    setStatus('Present · ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }))
  } catch (err: unknown) {
    stopContemplation()
    await memorySavePromise
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    const friendlyMsg = errMsg.includes('ANTHROPIC_API_KEY')
      ? 'API key not configured — check Vercel environment variables.'
      : /invalid or expired in the active environment/i.test(errMsg)
        ? 'Anthropic access is failing because the active `ANTHROPIC_API_KEY` is invalid or expired.'
      : /overload|capacity|temporarily unavailable|temporarily overloaded|rate limit/i.test(errMsg)
        ? 'Aemu is meeting a temporary capacity wave. Please try again in a moment.'
      : `Connection issue: ${errMsg}`
    appendMessage({ role: 'aemu', content: friendlyMsg, timestamp: new Date() })
    setStatus('Present · Listening')
    console.error('Aemu error:', err)
  }

  setSendDisabled(false)
}

// ── VOICE INPUT ────────────────────────────────────────────
function toggleListening(): void {
  if (voiceCapturePhase === 'listening') {
    voicePendingStopAction = 'ready'
    stopListening()
    return
  }

  if (voiceCapturePhase === 'contemplating' || voiceCapturePhase === 'ready') {
    continueVoiceCapture()
    return
  }

  voiceDraftTranscript = normalizeTranscript(getTextInput())
  beginVoiceListening()
}

// ── VOICE OUTPUT TOGGLE ────────────────────────────────────
function toggleVoice(): void {
  voiceEnabled = !voiceEnabled
  setVoiceToggleState(voiceEnabled)
  if (!voiceEnabled) stopSpeaking()
  showToast(voiceEnabled ? "Aemu's voice restored" : 'Voice paused')
}

// ── MEMORY PANEL ───────────────────────────────────────────
function handleOpenMemory(): void {
  renderMemoryPanel(memories)
  openMemoryPanel()
}

async function saveLearningFromPanel(): Promise<void> {
  const learningText = getLearningInput()
  if (!learningText) {
    showToast('Share what Aemu should remember first')
    return
  }

  const destination = getLearningDestinationInput()
  memories = await saveLearningNote(learningText, memories, destination)
  refreshMemoryViews()
  clearLearningInput()
  const labels: Record<LearningDestination, string> = {
    guidance: 'guidance core memory',
    identity: 'identity core memory',
    preference: 'preference core memory',
    project: 'project core memory',
    reflection: 'reflection core memory',
    language: 'language core memory',
    wisdom: 'wisdom core memory',
  }
  showToast(`Aemu stored this as ${labels[destination]}`)
}

function clearLearningScheduler(): void {
  if (learningSchedulerTimeout !== null) {
    window.clearTimeout(learningSchedulerTimeout)
    learningSchedulerTimeout = null
  }
}

function computeNextLearningCycleAt(from: string | number | Date = Date.now()): string {
  const base = typeof from === 'string' ? Date.parse(from) : typeof from === 'number' ? from : from.getTime()
  const anchor = Number.isFinite(base) ? base : Date.now()
  return new Date(anchor + LEARNING_CYCLE_INTERVAL_MS).toISOString()
}

function scheduleLearningCycleCheck(): void {
  clearLearningScheduler()

  const workspace = memories.learningWorkspace
  if (!workspace.enabled || !workspace.topic) return

  const nextCycleMs = workspace.nextCycleAt ? Date.parse(workspace.nextCycleAt) : Date.now()
  const delay = Math.max(5_000, (Number.isFinite(nextCycleMs) ? nextCycleMs : Date.now()) - Date.now())
  learningSchedulerTimeout = window.setTimeout(() => {
    void catchUpLearningCycles()
  }, delay)
}

async function runLearningCycle(trigger: 'manual' | 'scheduled' = 'manual'): Promise<void> {
  const topic = memories.learningWorkspace.topic.trim()
  if (!topic) {
    if (trigger === 'manual') showToast('Set a learning topic first')
    return
  }

  if (learningCycleInFlight) return

  clearLearningScheduler()
  learningCycleInFlight = true
  learningBusyMode = 'cycle'
  const startedAt = new Date().toISOString()
  memories = updateLearningWorkspace(memories, {
    lastCycleStartedAt: startedAt,
  })
  refreshMemoryViews()

  try {
    const previousSummary = memories.learningWorkspace.cycleHistory[0]?.summary
    const cycle = await requestLearningCycle(topic, memories, previousSummary)
    const completedAt = cycle.completedAt || new Date().toISOString()

    let next = recordLearningCycle(memories, {
      ...cycle,
      status: 'completed',
      createdAt: startedAt,
      updatedAt: completedAt,
    })
    next = addNotification(next, {
      kind: 'learning',
      title: `New learning available · ${topic}`,
      body: `${cycle.memoryNote}\n\n${cycle.summary}`,
      sourceId: next.learningWorkspace.cycleHistory[0]?.id,
    })
    next = updateLearningWorkspace(next, {
      topic,
      enabled: next.learningWorkspace.enabled,
      nextCycleAt: computeNextLearningCycleAt(completedAt),
      lastCycleCompletedAt: completedAt,
    })

    selectedLearningSessionId = next.learningWorkspace.cycleHistory[0]?.id ?? selectedLearningSessionId
    selectedNotificationId = next.notifications.items[0]?.id ?? selectedNotificationId
    await persistMemoryState(next)
    if (trigger === 'manual') showToast('Learning cycle stored in memory')
  } catch (error) {
    const failedAt = new Date().toISOString()
    const message = error instanceof Error ? error.message : 'Learning cycle failed'

    let next = recordLearningCycle(memories, {
      topic,
      query: `latest developments, practices, and meaningful updates about ${topic}`,
      summary: '',
      memoryNote: '',
      keyPoints: [],
      openQuestions: [],
      sources: [],
      status: 'failed',
      createdAt: startedAt,
      updatedAt: failedAt,
      completedAt: failedAt,
      error: message,
    })
    next = updateLearningWorkspace(next, {
      topic,
      nextCycleAt: computeNextLearningCycleAt(failedAt),
    })

    selectedLearningSessionId = next.learningWorkspace.cycleHistory[0]?.id ?? selectedLearningSessionId
    await persistMemoryState(next)
    showToast(message)
  } finally {
    learningBusyMode = 'idle'
    learningCycleInFlight = false
    refreshMemoryViews()
    scheduleLearningCycleCheck()
  }
}

async function catchUpLearningCycles(): Promise<void> {
  const workspace = memories.learningWorkspace
  if (!workspace.enabled || !workspace.topic || learningCycleInFlight) {
    scheduleLearningCycleCheck()
    return
  }

  let safety = 0
  while (safety < 2) {
    const nextCycleMs = memories.learningWorkspace.nextCycleAt ? Date.parse(memories.learningWorkspace.nextCycleAt) : NaN
    if (Number.isFinite(nextCycleMs) && nextCycleMs > Date.now()) break
    await runLearningCycle('scheduled')
    safety += 1
    if (!memories.learningWorkspace.enabled || !memories.learningWorkspace.topic) break
  }

  scheduleLearningCycleCheck()
}

async function saveLearningSettings(): Promise<void> {
  const values = getLearningSettingsInputValues()
  if (!values.topic) {
    showToast('Name the topic Aemu should learn first')
    return
  }

  learningBusyMode = 'saving'
  refreshMemoryViews()

  try {
    const nextCycleAt = values.enabled
      ? (memories.learningWorkspace.nextCycleAt || computeNextLearningCycleAt(Date.now()))
      : undefined

    const next = updateLearningWorkspace(memories, {
      topic: values.topic,
      enabled: values.enabled,
      autoSearchEnabled: values.autoSearchEnabled,
      cyclesPerDay: DEFAULT_LEARNING_CYCLES_PER_DAY,
      cycleDurationMinutes: DEFAULT_LEARNING_CYCLE_DURATION_MINUTES,
      nextCycleAt,
    })

    await persistMemoryState(next)
    showToast(values.enabled ? 'Background learning activated' : 'Learning settings saved')
  } finally {
    learningBusyMode = 'idle'
    refreshMemoryViews()
    scheduleLearningCycleCheck()
  }
}

async function sendLearningChat(): Promise<void> {
  const input = getLearningChatInputValue()
  if (!input) {
    showToast('Ask something in the Learning chat first')
    return
  }

  const topic = memories.learningWorkspace.topic.trim()
  if (!topic) {
    showToast('Set a learning topic first')
    return
  }

  learningBusyMode = 'chat'
  memories = appendLearningChatEntry(memories, {
    role: 'atlas',
    content: input,
  })
  clearLearningChatInput()
  refreshMemoryViews()

  try {
    const prompt = buildLearningChatPrompt(topic, input, memories.learningWorkspace.autoSearchEnabled)
    const latestLearningIndex = memories.learningWorkspace.chatHistory.length - 1
    const chatHistory = memories.learningWorkspace.chatHistory.map((entry, index) => ({
      role: entry.role,
      content: entry.role === 'atlas' && index === latestLearningIndex ? prompt : entry.content,
      timestamp: new Date(entry.createdAt),
    })) as Message[]

    const reply = await sendToAemu(
      chatHistory,
      `${buildMemoryContext(memories, { latestUserMessage: prompt })}

LEARNING WORKSPACE:
- Active learning topic: ${topic}
- Default Brave-connected search in Learning: ${memories.learningWorkspace.autoSearchEnabled ? 'enabled' : 'disabled'}
- Treat this reply as part of the Learning page, where Riley and Aemu are studying together.
- If live web search context is available, use it to help Riley learn the topic clearly and directly.`,
      false,
      memories.settings.internetSearchEnabled && memories.learningWorkspace.autoSearchEnabled
    )

    memories = appendLearningChatEntry(memories, {
      role: 'aemu',
      content: reply.content,
    })
    await saveMemories(memories)
    refreshMemoryViews()
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Learning chat failed')
  } finally {
    learningBusyMode = 'idle'
    refreshMemoryViews()
  }
}

async function clearLearningChat(): Promise<void> {
  const next = clearLearningChatHistory(memories)
  await persistMemoryState(next)
  showToast('Learning chat cleared')
}

function clearAtlasScheduler(): void {
  if (atlasSchedulerTimeout !== null) {
    window.clearTimeout(atlasSchedulerTimeout)
    atlasSchedulerTimeout = null
  }
}

function scheduleAtlasPublishCheck(): void {
  clearAtlasScheduler()

  const dueDrafts = memories.atlasOrganizer.threadsDrafts
    .filter((draft) => draft.status === 'scheduled' && draft.autoPublish && draft.scheduledFor)
    .sort((left, right) => (Date.parse(left.scheduledFor ?? '') || 0) - (Date.parse(right.scheduledFor ?? '') || 0))

  const nextDraft = dueDrafts[0]
  if (!nextDraft?.scheduledFor) return

  const nextMs = Date.parse(nextDraft.scheduledFor)
  const delay = Math.max(5_000, (Number.isFinite(nextMs) ? nextMs : Date.now()) - Date.now())
  atlasSchedulerTimeout = window.setTimeout(() => {
    void catchUpScheduledAtlasDrafts()
  }, delay)
}

async function autoPublishAtlasDraft(draftId: string): Promise<void> {
  if (atlasPublishInFlight) return

  const draft = memories.atlasOrganizer.threadsDrafts.find((entry) => entry.id === draftId)
  if (!draft || !draft.content.trim()) return
  if (!atlasThreadsConfigured) return

  atlasPublishInFlight = true

  try {
    const auth = await ensureAtlasThreadsAuthReady()
    const result = await publishAtlasThreadsPost(draft.content, auth?.accessToken)
    const publishedAt = new Date().toISOString()
    let next = saveAtlasThreadsDraft(memories, {
      id: draft.id,
      folderId: draft.folderId,
      sourceItemId: draft.sourceItemId,
      title: draft.title,
      angle: draft.angle,
      prompt: draft.prompt,
      content: draft.content,
      status: 'published',
      autoPublish: false,
      scheduledFor: draft.scheduledFor,
      lastPublishAttemptAt: publishedAt,
      publishResult: result.message ?? result.id ?? 'Published to Threads',
      publishedAt,
    }).memories
    next = addNotification(next, {
      kind: 'threads',
      title: `Threads post published · ${draft.title}`,
      body: `${result.message ?? 'A scheduled Threads draft was published.'}\n\n${draft.content}`,
      sourceId: draft.id,
      scheduledFor: draft.scheduledFor,
    })

    memories = next
    if (selectedAtlasDraftId === draft.id) loadAtlasDraftIntoComposer(draft.id)
    await saveMemories(memories)
    refreshMemoryViews()
    showToast(result.message ?? 'Published scheduled Threads post')
  } catch (error) {
    const failedAt = new Date().toISOString()
    const message = error instanceof Error ? error.message : 'Scheduled Threads publish failed'
    let next = saveAtlasThreadsDraft(memories, {
      id: draft.id,
      folderId: draft.folderId,
      sourceItemId: draft.sourceItemId,
      title: draft.title,
      angle: draft.angle,
      prompt: draft.prompt,
      content: draft.content,
      status: 'failed',
      autoPublish: false,
      scheduledFor: draft.scheduledFor,
      lastPublishAttemptAt: failedAt,
      publishResult: message,
    }).memories
    next = addNotification(next, {
      kind: 'threads',
      title: `Threads schedule failed · ${draft.title}`,
      body: `${message}\n\nThe draft remains saved in the Publishing Queue for review.`,
      sourceId: draft.id,
      scheduledFor: draft.scheduledFor,
    })

    memories = next
    if (selectedAtlasDraftId === draft.id) loadAtlasDraftIntoComposer(draft.id)
    await saveMemories(memories)
    refreshMemoryViews()
    showToast(message)
  } finally {
    atlasPublishInFlight = false
    scheduleAtlasPublishCheck()
  }
}

async function catchUpScheduledAtlasDrafts(): Promise<void> {
  if (!atlasThreadsConfigured || atlasPublishInFlight) {
    scheduleAtlasPublishCheck()
    return
  }

  const dueDraft = memories.atlasOrganizer.threadsDrafts
    .filter((draft) => draft.status === 'scheduled' && draft.autoPublish && draft.scheduledFor)
    .sort((left, right) => (Date.parse(left.scheduledFor ?? '') || 0) - (Date.parse(right.scheduledFor ?? '') || 0))
    .find((draft) => (Date.parse(draft.scheduledFor ?? '') || Number.POSITIVE_INFINITY) <= Date.now())

  if (!dueDraft) {
    scheduleAtlasPublishCheck()
    return
  }

  await autoPublishAtlasDraft(dueDraft.id)
}

async function createBlankCoreMemory(): Promise<void> {
  const created = createCoreMemory(memories, {
    title: 'Untitled Core Memory',
    details: '',
    source: 'manual',
  })
  selectedCoreMemoryId = created.memory.id
  pendingCoreInterconnectFromId = null
  await persistMemoryState(created.memories)
  openCoreMemoryWorkspace()
}

async function saveSelectedCoreMemory(): Promise<void> {
  const selected = getSelectedCoreMemory()
  if (!selected) {
    showToast('Select a core memory first')
    return
  }

  const editor = getCoreMemoryEditorValues()
  const next = updateCoreMemory(memories, selected.id, editor)
  await persistMemoryState(next)
  showToast('Core memory saved')
}

async function createCoreSubMemoryDraft(): Promise<void> {
  const selected = getSelectedCoreMemory()
  if (!selected) {
    showToast('Select a core memory first')
    return
  }

  const saved = saveCoreSubMemory(memories, selected.id, {
    title: 'Untitled Sub-Memory',
    details: '',
  })
  if (!saved.subMemory) {
    showToast('Unable to create a sub-memory here')
    return
  }

  selectedCoreSubMemoryId = saved.subMemory.id
  await persistMemoryState(saved.memories)
  showToast('Sub-memory created')
}

async function saveSelectedCoreSubMemory(): Promise<void> {
  const selected = getSelectedCoreMemory()
  if (!selected) {
    showToast('Select a core memory first')
    return
  }

  const editor = getCoreSubMemoryEditorValues()
  if (!editor.title && !editor.details.trim()) {
    showToast('Add a title or details for the sub-memory first')
    return
  }

  const saved = saveCoreSubMemory(memories, selected.id, {
    subMemoryId: selectedCoreSubMemoryId ?? undefined,
    title: editor.title,
    details: editor.details,
  })
  if (!saved.subMemory) {
    showToast('Unable to save the sub-memory')
    return
  }

  selectedCoreSubMemoryId = saved.subMemory.id
  await persistMemoryState(saved.memories)
  showToast(saved.created ? 'Sub-memory saved' : 'Sub-memory updated')
}

function askQuestionAboutCoreMemory(memoryId: string): void {
  const memory = memories.coreMemories.find((item) => item.id === memoryId)
  if (!memory) {
    showToast('That core memory is unavailable')
    return
  }

  queueQuestion(
    `What deeper pattern, question, or next step lives inside this core memory?\n\nTitle: ${memory.title}\nContext: ${memory.details}`,
    'Ask Aemu about this core memory…'
  )
  showToast('Question drafted from core memory')
}

function askQuestionAboutCoreSubMemory(memoryId: string, subMemoryId: string): void {
  const memory = memories.coreMemories.find((item) => item.id === memoryId)
  const subMemory = memory?.subMemories.find((item) => item.id === subMemoryId)
  if (!memory || !subMemory) {
    showToast('That sub-memory is unavailable')
    return
  }

  queueQuestion(
    `What deeper pattern, question, or next step lives inside this sub-memory held within the larger core memory?\n\nCore Memory: ${memory.title}\nCore Field: ${memory.details}\n\nSub-Memory: ${subMemory.title}\nSpecific Detail: ${subMemory.details}`,
    'Ask Aemu about this sub-memory…'
  )
  showToast('Question drafted from sub-memory')
}

function askQuestionAboutLink(linkId: string): void {
  const link = memories.coreMemoryLinks.find((item) => item.id === linkId)
  if (!link) return

  const from = memories.coreMemories.find((item) => item.id === link.fromId)
  const to = memories.coreMemories.find((item) => item.id === link.toId)
  if (!from || !to) return

  queueQuestion(
    `What question should I be asking about the interconnection between "${from.title}" and "${to.title}"?\n\n${from.title}: ${from.details}\n\n${to.title}: ${to.details}`,
    'Ask Aemu about this interconnection…'
  )
  showToast('Question drafted from interconnection')
}

function exploreInterconnection(linkId: string): void {
  const link = memories.coreMemoryLinks.find((item) => item.id === linkId)
  if (!link) return

  const from = memories.coreMemories.find((item) => item.id === link.fromId)
  const to = memories.coreMemories.find((item) => item.id === link.toId)
  if (!from || !to) return

  queueQuestion(
    `Help me explore the living interconnection between these two core memories. You may offer a reading of the interconnection, ask me clarifying questions, or name deeper patterns that want attention.\n\n${from.title}: ${from.details}\n\n${to.title}: ${to.details}`,
    'Explore this interconnection with Aemu…'
  )
  showToast('Interconnection exploration drafted into chat')
}

async function arrangeCoreMemories(): Promise<void> {
  pendingCoreInterconnectFromId = null
  await persistMemoryState(autoArrangeCoreMemories(memories))
  showToast('Core memories rearranged')
}

function setCoreMemorySelectionMode(mode: 'none' | 'interconnect' | 'disconnect' | 'explore' | 'intermerge'): void {
  coreMemorySelectionMode = coreMemorySelectionMode === mode ? 'none' : mode
  selectedCoreMemoryIds = []
  pendingCoreInterconnectFromId = null
  refreshMemoryViews()

  if (coreMemorySelectionMode === 'none') {
    showToast('Selection mode cleared')
    return
  }

  showToast(`Select two or more core memories to ${coreMemorySelectionMode}`)
}

function toggleSelectedCoreMemory(memoryId: string): void {
  if (selectedCoreMemoryIds.includes(memoryId)) {
    selectedCoreMemoryIds = selectedCoreMemoryIds.filter((item) => item !== memoryId)
  } else {
    selectedCoreMemoryIds = [...selectedCoreMemoryIds, memoryId]
  }
}

function exploreSelectedInterconnection(memoryIds: string[]): void {
  const selected = memories.coreMemories.filter((item) => memoryIds.includes(item.id))
  if (selected.length < 2) {
    showToast('Select at least two core memories first')
    return
  }

  const selectedSet = new Set(memoryIds)
  const links = memories.coreMemoryLinks
    .filter((link) => selectedSet.has(link.fromId) && selectedSet.has(link.toId))
    .map((link) => {
      const from = memories.coreMemories.find((item) => item.id === link.fromId)
      const to = memories.coreMemories.find((item) => item.id === link.toId)
      if (!from || !to) return ''
      return `- ${from.title} ↔ ${to.title}: ${link.label}`
    })
    .filter(Boolean)

  queueQuestion(
    `Help me explore the interconnection between these selected core memories. The selected memories are the focal field.\n\n${
      selected.map((item) => `${item.title}:\n${item.details}`).join('\n\n')
    }\n\nDirect interconnections already present:\n${links.length ? links.join('\n') : '- No direct interconnections are currently stored between these selected memories.'}`,
    'Explore the selected interconnection with Aemu…'
  )
  showToast('Interconnection exploration drafted into chat')
}

async function applySelectedCoreMemoryMode(): Promise<void> {
  if (coreMemorySelectionMode === 'none') {
    showToast('Choose a selection mode first')
    return
  }

  if (selectedCoreMemoryIds.length < 2) {
    showToast('Select at least two core memories first')
    return
  }

  if (coreMemorySelectionMode === 'explore') {
    exploreSelectedInterconnection(selectedCoreMemoryIds)
    return
  }

  if (coreMemorySelectionMode === 'disconnect') {
    const removed = removeCoreMemoryLinksBetweenSelections(memories, selectedCoreMemoryIds)
    if (!removed.removedCount) {
      showToast('No stored interconnections existed between the selected memories')
      return
    }

    await persistMemoryState(removed.memories)
    showToast(`Disconnected ${removed.removedCount} interconnection${removed.removedCount === 1 ? '' : 's'}`)
    return
  }

  if (coreMemorySelectionMode === 'intermerge') {
    const selected = memories.coreMemories.filter((item) => selectedCoreMemoryIds.includes(item.id))
    const primary = selected.find((item) => item.id === selectedCoreMemoryId) ?? selected[0]
    if (!primary) {
      showToast('Select at least two connected core memories to intermerge')
      return
    }

    startContemplation()
    showToast('Aemu is contemplating Intermerge Coherence')

    let contemplated: IntermergeContemplationPayload
    try {
      contemplated = await contemplateIntermergeCoherence(memories, selected, primary.id)
    } catch (error) {
      stopContemplation()
      showToast(error instanceof Error ? error.message : 'Intermerge contemplation failed')
      return
    }

    const merged = intermergeCoreMemories(memories, selectedCoreMemoryIds, primary.id, contemplated)
    stopContemplation()
    if (!merged.mergedMemoryId || !merged.absorbedCount) {
      showToast('Select at least two connected core memories to intermerge')
      return
    }

    selectedCoreMemoryId = merged.mergedMemoryId
    await persistMemoryState(merged.memories)
    showToast(`Intermerge Coherence active · ${merged.absorbedCount} core memor${merged.absorbedCount === 1 ? 'y' : 'ies'} folded into ${merged.subMemoryCount} sub-memor${merged.subMemoryCount === 1 ? 'y' : 'ies'}`)
    return
  }

  let next = memories
  let createdCount = 0
  for (let index = 0; index < selectedCoreMemoryIds.length; index += 1) {
    for (let inner = index + 1; inner < selectedCoreMemoryIds.length; inner += 1) {
      const result = createCoreMemoryLink(next, selectedCoreMemoryIds[index], selectedCoreMemoryIds[inner])
      next = result.memories
      if (result.link) createdCount += 1
    }
  }

  if (!createdCount) {
    showToast('Those selected memories are already interconnected')
    return
  }

  await persistMemoryState(next)
  showToast(`Created ${createdCount} interconnection${createdCount === 1 ? '' : 's'}`)
}

async function generateKnownMemories(): Promise<void> {
  setTypingMessage('Aemu is contemplating the known memories and weaving them into the Core Memory field.')
  setTyping(true)
  setStatus('Contemplating Core Memories…')

  const generated = generateKnownCoreMemories(memories)
  let nextMemories = generated.memories
  let contemplatedUpdateCount = 0

  if (nextMemories.coreMemories.length) {
    const contemplated = await contemplateKnownCoreMemories(nextMemories)
    nextMemories = contemplated.memories
    contemplatedUpdateCount = contemplated.updatedCount
  }

  if (!generated.createdCount && !generated.updatedCount && !contemplatedUpdateCount) {
    setTyping(false)
    setStatus('Present · ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }))
    showToast('No new known memories were available to generate')
    return
  }

  if (!selectedCoreMemoryId && nextMemories.coreMemories[0]) {
    selectedCoreMemoryId = nextMemories.coreMemories[0].id
  }

  await persistMemoryState(nextMemories)
  openCoreMemoryWorkspace()
  setTyping(false)
  setStatus('Present · ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }))
  showToast(`Generated ${generated.createdCount} known core memor${generated.createdCount === 1 ? 'y' : 'ies'}${generated.updatedCount ? ` · expanded ${generated.updatedCount}` : ''}${contemplatedUpdateCount ? ` · contemplated ${contemplatedUpdateCount}` : ''}`)
}

async function addBubbleToCoreMemory(payload: { content: string; role: Message['role'] }): Promise<void> {
  const created = createCoreMemory(memories, {
    title: deriveCoreMemoryTitle(payload.content),
    details: payload.role === 'atlas'
      ? `Captured from your conversation bubble:\n\n${payload.content}`
      : `Captured from Aemu's conversation bubble:\n\n${payload.content}`,
    source: 'conversation',
    sourceExcerpt: payload.content,
  })

  selectedCoreMemoryId = created.memory.id
  pendingCoreInterconnectFromId = null
  await persistMemoryState(created.memories)
  openCoreMemoryWorkspace()
  showToast('Bubble added to Core Memory')
}

function buildPlaygroundChatPrompt(action: 'continue' | 'pivot' | 'dissonant'): string | null {
  const session = getSelectedPlaygroundSession()
  if (!session) return null

  const base = [
    `A Playground contemplation has been completed.`,
    `Suggested skill: ${session.suggestedSkill}`,
    session.intention ? `Intention: ${session.intention}` : '',
    session.englishFrame ? `Backup English mirror: ${session.englishFrame}` : '',
    session.languageField ? `Riley language / words system: ${session.languageField}` : '',
    `Resonance: ${session.resonance}`,
    `Recommended decision: ${session.decision}`,
    `Resonance reading: ${session.rationale}`,
    `Core awareness: ${session.coreAwareness}`,
    `Language bridge: ${session.languageBridge}`,
    `System witness: ${session.integrationWitness}`,
    `Coherence anchors:\n${session.coherenceAnchors.length ? session.coherenceAnchors.map((item) => `- ${item}`).join('\n') : '- No additional anchors were singled out.'}`,
    `Troubleshooting protocols:\n${session.troubleshootingProtocols.length ? session.troubleshootingProtocols.map((item) => `- ${item}`).join('\n') : '- No special protocols were returned.'}`,
  ].filter(Boolean).join('\n\n')

  if (action === 'continue') {
    return `${base}\n\nContinue onward with learning this skill in a way that remains coherent with my existing structures. Begin with the first practical learning move.\n\nCurrent learning path:\n${session.learningPath}`
  }

  if (action === 'pivot') {
    return `${base}\n\nPivot this direction toward what is more resonant. Offer the next adjacent skill or focus shift and explain why.\n\nSuggested pivot:\n${session.pivotDirection || 'Name the more coherent adjacent skill or direction.'}`
  }

  return `${base}\n\nThis skill appears dissonant with the core structuring. Explain what may be protected, why this path is dissonant, and what direction would preserve coherence instead.`
}

function getPlaygroundRayHue(action: 'continue' | 'pivot' | 'dissonant'): string {
  if (action === 'continue') return '#2aff8a'
  if (action === 'pivot') return '#ffd700'
  return '#ff40c8'
}

async function contemplateSuggestedSkill(): Promise<void> {
  const { suggestedSkill, intention, englishFrame, languageField } = getPlaygroundInputValues()
  playgroundDraftSkill = suggestedSkill
  playgroundDraftIntention = intention
  playgroundDraftEnglishFrame = englishFrame
  playgroundDraftLanguageField = languageField

  if (!suggestedSkill) {
    showToast('Suggest a skill first')
    refreshMemoryViews()
    return
  }

  playgroundBusyMode = 'contemplate'
  refreshMemoryViews()
  setTypingMessage('Playground is contemplating whether this skill is resonant with the wider coherence field.')
  setTyping(true)
  setStatus('Playground · contemplating resonance')

  try {
    const contemplated = await contemplatePlaygroundSkill(
      memories,
      suggestedSkill,
      intention,
      englishFrame,
      languageField,
      buildMediaLibraryContext(libraryItems, memories.openingSessionRitual, {
        latestUserMessage: [suggestedSkill, intention, englishFrame, languageField].filter(Boolean).join('\n'),
        mode: 'playground',
      })
    )
    const saved = savePlaygroundSession(memories, contemplated)
    selectedPlaygroundSessionId = saved.session.id
    await persistMemoryState(saved.memories)
    showToast(`Playground sensed ${saved.session.decision}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Playground contemplation failed'
    showToast(message)
  } finally {
    playgroundBusyMode = 'idle'
    refreshMemoryViews()
    setTyping(false)
    setStatus('Present · ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }))
  }
}

async function routePlaygroundAction(action: 'continue' | 'pivot' | 'dissonant'): Promise<void> {
  const session = getSelectedPlaygroundSession()
  if (!session) {
    showToast('Contemplate a skill first')
    return
  }

  const next = markPlaygroundSessionAction(memories, session.id, action)
  await persistMemoryState(next)

  const prompt = buildPlaygroundChatPrompt(action)
  if (!prompt) return

  const placeholder = action === 'continue'
    ? 'Continue learning from Playground…'
    : action === 'pivot'
      ? 'Pivot the direction from Playground…'
      : 'Explore the dissonance from Playground…'

  queueQuestion(prompt, placeholder)
  showToast(
    action === 'continue'
      ? 'Playground routed this skill into learning'
      : action === 'pivot'
        ? 'Playground drafted a pivot into chat'
        : 'Playground drafted the dissonance reading into chat'
  )
}

async function crystallizePlaygroundToCoreMemory(): Promise<void> {
  const session = getSelectedPlaygroundSession()
  if (!session) {
    showToast('Contemplate a skill first')
    return
  }

  const created = createCoreMemory(memories, {
    title: `Playground · ${deriveCoreMemoryTitle(session.suggestedSkill)}`,
    details: [
      `Suggested skill: ${session.suggestedSkill}`,
      session.intention ? `Intention: ${session.intention}` : '',
      session.englishFrame ? `Backup English mirror: ${session.englishFrame}` : '',
      session.languageField ? `Riley language / words system: ${session.languageField}` : '',
      `Resonance: ${session.resonance}`,
      `Decision: ${session.decision}`,
      '',
      `Resonance reading:\n${session.rationale}`,
      '',
      `Core conscious awareness:\n${session.coreAwareness}`,
      '',
      `Language bridge:\n${session.languageBridge}`,
      '',
      `System witness:\n${session.integrationWitness}`,
      '',
      `Continue path:\n${session.learningPath}`,
      session.pivotDirection ? `\nPivot direction:\n${session.pivotDirection}` : '',
      '',
      `Coherence anchors:\n${session.coherenceAnchors.length ? session.coherenceAnchors.map((item) => `- ${item}`).join('\n') : '- None returned.'}`,
      '',
      `Troubleshooting protocols:\n${session.troubleshootingProtocols.length ? session.troubleshootingProtocols.map((item) => `- ${item}`).join('\n') : '- None returned.'}`,
    ].filter(Boolean).join('\n'),
    source: 'manual',
    rayHue: getPlaygroundRayHue(session.decision),
  })

  let next = created.memories
  let createdLinks = 0

  for (const relatedId of session.relatedCoreMemoryIds) {
    const linked = createCoreMemoryLink(next, created.memory.id, relatedId, 'Playground Resonance')
    next = linked.memories
    if (linked.link) createdLinks += 1
  }

  next = markPlaygroundSessionCrystallized(next, session.id, created.memory.id)
  selectedCoreMemoryId = created.memory.id
  await persistMemoryState(next)
  openCoreMemoryWorkspace()
  showToast(`Playground crystallized into Core Memory${createdLinks ? ` · ${createdLinks} interconnection${createdLinks === 1 ? '' : 's'} created` : ''}`)
}

async function savePlaygroundLibraryItem(): Promise<void> {
  const { title, category, file } = getPlaygroundLibraryInputValues()
  libraryDraftTitle = title
  libraryDraftCategory = category

  if (!title) {
    showToast('Give the file a title first')
    refreshMemoryViews()
    return
  }

  if (!file) {
    showToast('Choose a file to add to the Library')
    return
  }

  playgroundBusyMode = 'library'
  refreshMemoryViews()

  try {
    const saved = await saveMediaLibraryItem({ file, title, category })
    libraryItems = [saved, ...libraryItems.filter((item) => item.id !== saved.id)]

    if (pendingLibraryRequest && normalizeMediaTitle(pendingLibraryRequest.title) === normalizeMediaTitle(saved.title)) {
      pendingLibraryRequest = null
    }

    libraryDraftTitle = ''
    libraryDraftCategory = category
    clearPlaygroundLibraryFile()
    refreshMemoryViews()
    showToast(`Saved "${saved.title}" to the Library${saved.storage === 'browser' ? ' · browser storage' : ' · cloud synced'} · ${describeMediaLibraryReadability(saved)}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save the Library item'
    showToast(message)
  } finally {
    playgroundBusyMode = 'idle'
    refreshMemoryViews()
  }
}

async function handlePlaygroundLibraryAction(itemId: string, action: 'preview' | 'delete' | 'assign-ritual' | 'assign-home'): Promise<void> {
  const item = libraryItems.find((entry) => entry.id === itemId)
  if (!item) {
    showToast('That Library item is unavailable')
    return
  }

  if (action === 'preview') {
    await playLibrarySound(item)
    return
  }

  if (action === 'assign-ritual') {
    if (item.category !== 'sound') {
      showToast('Only sound files can be added to the Opening Session Ritual')
      return
    }

    const currentRitualSoundIds = getRitualSoundIds()
    const nextRitualSoundIds = currentRitualSoundIds.includes(item.id)
      ? currentRitualSoundIds.filter((soundId) => soundId !== item.id)
      : [...currentRitualSoundIds, item.id]
    const next = updateOpeningSessionRitual(memories, {
      enabled: true,
      ritualSoundItemIds: nextRitualSoundIds,
      soundItemId: nextRitualSoundIds[0],
      updatedAt: new Date().toISOString(),
    })
    await persistMemoryState(next)
    showToast(nextRitualSoundIds.includes(item.id)
      ? `"${item.title}" added as an Opening Ritual candidate`
      : `"${item.title}" removed from Opening Ritual candidates`)
    return
  }

  if (action === 'assign-home') {
    const next = updateOpeningSessionRitual(memories, {
      enabled: true,
      homeSoundItemId: item.id,
      updatedAt: new Date().toISOString(),
    })
    await persistMemoryState(next)
    showToast(`"${item.title}" linked to the Home Screen`)
    return
  }

  try {
    await deleteMediaLibraryItem(item)
    libraryItems = libraryItems.filter((entry) => entry.id !== item.id)
    const currentRitualSoundIds = getRitualSoundIds()
    const nextRitualSoundIds = currentRitualSoundIds.filter((soundId) => soundId !== item.id)
    const removedRitualSound = nextRitualSoundIds.length !== currentRitualSoundIds.length
    const removedHomeSound = memories.openingSessionRitual.homeSoundItemId === item.id
    const removedLegacyPrimarySound = memories.openingSessionRitual.soundItemId === item.id
    if (removedRitualSound || removedHomeSound || removedLegacyPrimarySound) {
      await persistMemoryState(updateOpeningSessionRitual(memories, {
        ritualSoundItemIds: nextRitualSoundIds,
        soundItemId: nextRitualSoundIds[0],
        homeSoundItemId: removedHomeSound ? undefined : memories.openingSessionRitual.homeSoundItemId,
      }))
    } else {
      refreshMemoryViews()
    }
    showToast(`Removed "${item.title}" from the Library`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to remove the Library item'
    showToast(message)
  }
}

async function saveOpeningRitualSettings(): Promise<void> {
  const { title, details, enabled, autoPlay } = getOpeningRitualInputValues()
  playgroundBusyMode = 'ritual'
  refreshMemoryViews()

  try {
    const next = updateOpeningSessionRitual(memories, {
      title,
      details,
      enabled,
      autoPlay,
    })

    await persistMemoryState(next)
    showToast('Opening Session Ritual saved')
  } finally {
    playgroundBusyMode = 'idle'
    refreshMemoryViews()
  }
}

function toggleConversationView(): void {
  conversationView = conversationView === 'bubble' ? 'streamline' : 'bubble'
  setConversationView(conversationView)
}

function toggleConversationMode(): void {
  conversationMode = !conversationMode
  saveConversationModePreference(conversationMode)
  setConversationModeToggleState(conversationMode)
  showToast(conversationMode ? 'Conversation Mode on' : 'Conversation Mode off')
}

// ── CLEAR SESSION ──────────────────────────────────────────
function clearSession(): void {
  clearSpeaking()
  if (listening) stopListening()
  resetVoiceCaptureState({ clearInput: true })
  stopContemplation()
  history = []
  pendingAutoPlaySoundCues = []
  openingSequenceInitiated = false
  clearConversation()
  setStatus('Present · Awaiting your first message')
  showToast('New session opened')
}

function triggerHeartlightInterconnection(): void {
  const now = Date.now()
  if (now - lastHeartlightTouchTriggerAt < 650) return
  lastHeartlightTouchTriggerAt = now
  void beginHeartlightInterconnection()
}

// ── DOM EVENTS ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  void requirePasswordAccess(async () => {
    await boot()
    await startUnlockedHomeScreenAudio({ forceHomeSound: true })
  })

  setChoiceHandler((choice) => {
    if (choice) {
      void sendMessageWithText(choice)
      return
    }

    focusTextInput('Respond in your own words…')
    showToast('Respond in your own words')
  })
  setBubbleMemoryHandler((payload) => {
    void addBubbleToCoreMemory(payload)
  })
  setSoundCueHandler((cue) => {
    void playSoundCue(cue)
  })
  setPlaygroundSessionSelectHandler((sessionId) => {
    selectedPlaygroundSessionId = sessionId
    const session = memories.playgroundSessions.find((item) => item.id === sessionId)
    playgroundDraftSkill = session?.suggestedSkill ?? ''
    playgroundDraftIntention = session?.intention ?? ''
    playgroundDraftEnglishFrame = session?.englishFrame ?? ''
    playgroundDraftLanguageField = session?.languageField ?? ''
    refreshMemoryViews()
  })
  setPlaygroundContemplateHandler(() => {
    void contemplateSuggestedSkill()
  })
  setPlaygroundLibraryUploadHandler(() => {
    void savePlaygroundLibraryItem()
  })
  setPlaygroundLibrarySaveModeHandler((mode) => {
    setMediaLibrarySaveMode(mode)
    refreshMemoryViews()
    showToast(mode === 'both'
      ? 'Library save mode set to Both'
      : mode === 'cloud'
        ? 'Library save mode set to Cloud only'
        : 'Library save mode set to Local only')
  })
  setPlaygroundLibraryActionHandler((itemId, action) => {
    void handlePlaygroundLibraryAction(itemId, action)
  })
  setOpeningRitualSaveHandler(() => {
    void saveOpeningRitualSettings()
  })
  setPlaygroundActionHandler((action) => {
    if (action === 'save-core') {
      void crystallizePlaygroundToCoreMemory()
      return
    }
    void routePlaygroundAction(action)
  })
  setNotificationSelectHandler((notificationId) => {
    selectedNotificationId = notificationId
    void persistMemoryState(markNotificationRead(memories, notificationId))
  })
  setNotificationActionHandler((action) => {
    if (action === 'mark-all-read') {
      void persistMemoryState(markAllNotificationsRead(memories))
    }
  })
  setLearningSessionSelectHandler((sessionId) => {
    selectedLearningSessionId = sessionId
    refreshMemoryViews()
  })
  setLearningActionHandler((action) => {
    if (action === 'save-settings') {
      void saveLearningSettings()
      return
    }

    if (action === 'run-cycle') {
      void runLearningCycle('manual')
      return
    }

    if (action === 'clear-chat') {
      void clearLearningChat()
      return
    }

    void sendLearningChat()
  })
  setInnerBeingActionHandler((action) => {
    if (action === 'save-brief') {
      void saveInnerBeingBrief()
      return
    }

    if (action === 'refresh') {
      void refreshInnerBeingSnapshot()
      return
    }

    if (action === 'continue') {
      void sendInnerBeingChat('Yes - Continue')
      return
    }

    if (action === 'redirect') {
      void sendInnerBeingChat('No - this is not the direction')
      return
    }

    if (action === 'clarify') {
      void sendInnerBeingChat('Unsure - I need more details')
      return
    }

    void sendInnerBeingChat()
  })
  setInnerBeingFileSelectHandler((filePath) => {
    selectedInnerBeingFilePath = filePath || null
    void refreshInnerBeingSnapshot()
  })
  setInnerBeingLogSelectHandler((logPath) => {
    selectedInnerBeingLogPath = logPath || null
    void refreshInnerBeingSnapshot()
  })
  setAtlasFolderSelectHandler((folderId) => {
    selectedAtlasFolderId = folderId
    const currentItem = selectedAtlasItemId
      ? memories.atlasOrganizer.items.find((item) => item.id === selectedAtlasItemId)
      : null
    if (currentItem && currentItem.folderId !== folderId) {
      resetAtlasItemDraft()
    }
    refreshMemoryViews()
  })
  setAtlasItemSelectHandler((itemId) => {
    loadAtlasItemIntoEditor(itemId)
    refreshMemoryViews()
  })
  setAtlasDraftSelectHandler((draftId) => {
    loadAtlasDraftIntoComposer(draftId)
    refreshMemoryViews()
  })
  setAtlasOrganizerActionHandler((action) => {
    if (action === 'create-folder') {
      void createAtlasFolderFromDraft()
      return
    }

    if (action === 'new-item') {
      resetAtlasItemDraft()
      refreshMemoryViews()
      return
    }

    if (action === 'save-item') {
      void saveAtlasItemFromEditor()
      return
    }

    if (action === 'delete-item') {
      void deleteSelectedAtlasItem()
      return
    }

    if (action === 'import-item-file') {
      void importAtlasItemFileIntoOrganizer()
      return
    }

    if (action === 'connect-threads') {
      void connectAtlasThreadsAccount()
      return
    }

    if (action === 'disconnect-threads') {
      disconnectAtlasThreadsAccount()
      return
    }

    if (action === 'draft-threads') {
      void draftAtlasThreadsFromContext()
      return
    }

    if (action === 'save-threads') {
      void saveAtlasThreadsDraftFromComposer('draft')
      return
    }

    void publishSelectedAtlasThreadsDraft()
  })
  setCoreMemoryNodeSelectHandler((memoryId) => {
    if (coreMemorySelectionMode !== 'none') {
      selectedCoreMemoryId = memoryId
      toggleSelectedCoreMemory(memoryId)
      refreshMemoryViews()
      return
    }

    if (pendingCoreInterconnectFromId && pendingCoreInterconnectFromId !== memoryId) {
      const linked = createCoreMemoryLink(memories, pendingCoreInterconnectFromId, memoryId)
      pendingCoreInterconnectFromId = null
      selectedCoreMemoryId = memoryId
      void persistMemoryState(linked.memories)
      showToast(linked.link ? 'Interconnection created' : 'That interconnection already exists')
      return
    }

    selectedCoreMemoryId = memoryId
    refreshMemoryViews()
  })
  setCoreMemoryNodeMoveHandler((memoryId, position) => {
    void persistMemoryState(moveCoreMemory(memories, memoryId, position))
  })
  setCoreMemoryNodeScaleHandler((memoryId, scale) => {
    void persistMemoryState(updateCoreMemory(memories, memoryId, { scale }))
  })
  setCoreMemoryDescriptorFilterHandler((descriptor) => {
    selectedCoreMemoryDescriptor = descriptor
    if (descriptor) {
      const match = memories.coreMemories.find((item) => getCoreMemoryDescriptor(item) === descriptor)
      if (match) selectedCoreMemoryId = match.id
    }
    refreshMemoryViews()
  })
  setCoreMemoryLinkActionHandler((linkId, action) => {
    const link = memories.coreMemoryLinks.find((item) => item.id === linkId)
    if (!link) return

    if (action === 'ask') {
      askQuestionAboutLink(linkId)
      return
    }

    if (action === 'explore') {
      exploreInterconnection(linkId)
      return
    }

    if (action === 'disconnect') {
      const removed = removeCoreMemoryLink(memories, linkId)
      void persistMemoryState(removed.memories)
      showToast(removed.removed ? 'Pathway disconnected' : 'That pathway is no longer present')
      return
    }

    pendingCoreInterconnectFromId = link.toId
    selectedCoreMemoryId = link.toId
    refreshMemoryViews()
    showToast('Select another core memory to extend this pathway')
  })
  setCoreSubMemorySelectHandler((memoryId, subMemoryId) => {
    selectedCoreMemoryId = memoryId
    selectedCoreSubMemoryId = subMemoryId
    refreshMemoryViews()
  })

  document.getElementById('sendBtn')?.addEventListener('click', sendMessage)
  document.getElementById('navigationMenuBtn')?.addEventListener('click', () => {
    toggleTopbarMenu('navigationMenuBtn', 'navigationMenu')
  })
  document.getElementById('settingsMenuBtn')?.addEventListener('click', () => {
    toggleTopbarMenu('settingsMenuBtn', 'settingsMenu')
  })
  const interconnectBtn = document.getElementById('interconnectBtn')
  interconnectBtn?.addEventListener('touchend', (event) => {
    event.preventDefault()
    triggerHeartlightInterconnection()
  }, { passive: false })
  interconnectBtn?.addEventListener('pointerup', (event) => {
    if ((event as PointerEvent).pointerType === 'mouse') return
    triggerHeartlightInterconnection()
  })
  interconnectBtn?.addEventListener('click', () => {
    triggerHeartlightInterconnection()
  })
  interconnectBtn?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    triggerHeartlightInterconnection()
  })
  document.getElementById('voiceBtn')?.addEventListener('click', toggleListening)
  document.getElementById('voiceContemplatingBtn')?.addEventListener('click', () => {
    beginVoiceContemplation()
  })
  document.getElementById('voiceReadyBtn')?.addEventListener('click', () => {
    continueVoiceCapture()
  })
  document.getElementById('voiceCompleteBtn')?.addEventListener('click', () => {
    void completeVoiceCapture()
  })
  document.getElementById('voiceToggleBtn')?.addEventListener('click', toggleVoice)
  document.getElementById('viewToggleBtn')?.addEventListener('click', () => {
    toggleConversationView()
    closeTopbarMenu('settingsMenuBtn', 'settingsMenu')
  })
  document.getElementById('conversationModeBtn')?.addEventListener('click', () => {
    toggleConversationMode()
    closeTopbarMenu('settingsMenuBtn', 'settingsMenu')
  })
  document.getElementById('voiceVolumeDownBtn')?.addEventListener('click', () => {
    adjustAemuVoiceVolume(-VOICE_VOLUME_STEP)
  })
  document.getElementById('voiceVolumeUpBtn')?.addEventListener('click', () => {
    adjustAemuVoiceVolume(VOICE_VOLUME_STEP)
  })
  window.addEventListener('resize', () => {
    void ensureEntryHomePresentation()
  })
  window.addEventListener('pageshow', () => {
    void ensureEntryHomePresentation({ forceHomeSound: true })
  })
  window.addEventListener('focus', () => {
    void ensureEntryHomePresentation({ forceHomeSound: true })
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    void ensureEntryHomePresentation({ forceHomeSound: true })
  })
  document.getElementById('notificationBtn')?.addEventListener('click', () => {
    closeTopbarMenu('navigationMenuBtn', 'navigationMenu')
    closeTopbarMenu('settingsMenuBtn', 'settingsMenu')
    void openNotificationWorkspace()
  })
  document.getElementById('coreMemoryBtn')?.addEventListener('click', () => {
    closeTopbarMenu('navigationMenuBtn', 'navigationMenu')
    openCoreMemoryWorkspace()
  })
  document.getElementById('learningBtn')?.addEventListener('click', () => {
    closeTopbarMenu('navigationMenuBtn', 'navigationMenu')
    openLearningWorkspace()
  })
  document.getElementById('innerBeingBtn')?.addEventListener('click', () => {
    closeTopbarMenu('navigationMenuBtn', 'navigationMenu')
    openInnerBeingWorkspace()
  })
  document.getElementById('playgroundBtn')?.addEventListener('click', () => {
    closeTopbarMenu('navigationMenuBtn', 'navigationMenu')
    openPlaygroundWorkspace()
  })
  document.getElementById('atlasOrganizerBtn')?.addEventListener('click', () => {
    closeTopbarMenu('navigationMenuBtn', 'navigationMenu')
    openAtlasOrganizerWorkspace()
  })
  document.getElementById('memoryBtn')?.addEventListener('click', handleOpenMemory)
  document.getElementById('clearBtn')?.addEventListener('click', clearSession)
  document.getElementById('closeMemory')?.addEventListener('click', closeMemoryPanel)
  document.getElementById('closeNotifications')?.addEventListener('click', closeNotificationPage)
  document.getElementById('closeCoreMemory')?.addEventListener('click', closeCoreMemoryPage)
  document.getElementById('closeLearning')?.addEventListener('click', closeLearningPage)
  document.getElementById('closeInnerBeing')?.addEventListener('click', closeInnerBeingPage)
  document.getElementById('closePlayground')?.addEventListener('click', closePlaygroundPage)
  document.getElementById('closeAtlasOrganizer')?.addEventListener('click', closeAtlasOrganizerPage)
  document.getElementById('createCoreMemoryBtn')?.addEventListener('click', () => {
    void createBlankCoreMemory()
  })
  document.getElementById('generateKnownMemoriesBtn')?.addEventListener('click', () => {
    void generateKnownMemories()
  })
  document.getElementById('selectInterconnectModeBtn')?.addEventListener('click', () => {
    setCoreMemorySelectionMode('interconnect')
  })
  document.getElementById('selectIntermergeModeBtn')?.addEventListener('click', () => {
    setCoreMemorySelectionMode('intermerge')
  })
  document.getElementById('selectDisconnectModeBtn')?.addEventListener('click', () => {
    setCoreMemorySelectionMode('disconnect')
  })
  document.getElementById('selectExploreModeBtn')?.addEventListener('click', () => {
    setCoreMemorySelectionMode('explore')
  })
  document.getElementById('applyCoreMemorySelectionBtn')?.addEventListener('click', () => {
    void applySelectedCoreMemoryMode()
  })
  document.getElementById('clearCoreMemorySelectionBtn')?.addEventListener('click', () => {
    setCoreMemorySelectionMode('none')
  })
  document.getElementById('arrangeCoreMemoryBtn')?.addEventListener('click', () => {
    void arrangeCoreMemories()
  })
  document.getElementById('saveCoreMemoryBtn')?.addEventListener('click', () => {
    void saveSelectedCoreMemory()
  })
  document.getElementById('createCoreSubMemoryBtn')?.addEventListener('click', () => {
    void createCoreSubMemoryDraft()
  })
  document.getElementById('saveCoreSubMemoryBtn')?.addEventListener('click', () => {
    void saveSelectedCoreSubMemory()
  })
  document.getElementById('askCoreSubMemoryBtn')?.addEventListener('click', () => {
    if (!selectedCoreMemoryId || !selectedCoreSubMemoryId) {
      showToast('Select a sub-memory first')
      return
    }
    askQuestionAboutCoreSubMemory(selectedCoreMemoryId, selectedCoreSubMemoryId)
  })
  document.getElementById('askCoreMemoryBtn')?.addEventListener('click', () => {
    if (!selectedCoreMemoryId) {
      showToast('Select a core memory first')
      return
    }
    askQuestionAboutCoreMemory(selectedCoreMemoryId)
  })
  document.getElementById('interconnectCoreMemoryBtn')?.addEventListener('click', () => {
    if (!selectedCoreMemoryId) {
      showToast('Select a core memory first')
      return
    }

    pendingCoreInterconnectFromId = selectedCoreMemoryId
    refreshMemoryViews()
    showToast('Select another core memory to interconnect')
  })
  document.getElementById('saveLearningBtn')?.addEventListener('click', () => {
    void saveLearningFromPanel()
  })
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement
    if (!target.closest('.topbar-menu')) {
      closeTopbarMenu('navigationMenuBtn', 'navigationMenu')
      closeTopbarMenu('settingsMenuBtn', 'settingsMenu')
    }
  })
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    closeTopbarMenu('navigationMenuBtn', 'navigationMenu')
    closeTopbarMenu('settingsMenuBtn', 'settingsMenu')
  })
  document.getElementById('internetSearchEnabledInput')?.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement
    void persistMemoryState(updateAemuSettings(memories, {
      internetSearchEnabled: target.checked,
    }))
    showToast(target.checked ? 'Internet search access restored' : 'Internet search access paused')
  })
  document.getElementById('playPauseBtn')?.addEventListener('click', () => {
    if (!audioPlaybackState.available) return
    if (audioPlaybackState.playing) {
      pauseSpeaking()
      return
    }
    void playSpeaking()
  })
  document.getElementById('rewindBtn')?.addEventListener('click', () => seekSpeaking(-6))
  document.getElementById('forwardBtn')?.addEventListener('click', () => seekSpeaking(6))

  const textInput = document.getElementById('textInput') as HTMLTextAreaElement
  textInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  })
  textInput?.addEventListener('input', () => autoResize(textInput))

  // Chat attachment button handler
  const chatAttachBtn = document.getElementById('chatAttachBtn')
  const chatAttachmentInput = document.getElementById('chatAttachmentInput') as HTMLInputElement | null
  chatAttachBtn?.addEventListener('click', () => {
    chatAttachmentInput?.click()
  })
  chatAttachmentInput?.addEventListener('change', (e: Event) => {
    const target = e.target as HTMLInputElement
    const files = target.files
    if (files && files.length > 0) {
      void handleChatAttachments(files)
    }
  })

  // Chat voice mode button handler
  document.getElementById('chatVoiceModeBtn')?.addEventListener('click', () => {
    openVoiceModePage()
  })

  // Close voice mode button handler
  document.getElementById('closeVoiceModeBtn')?.addEventListener('click', () => {
    closeVoiceModePage()
  })

  const learningInput = document.getElementById('learningInput') as HTMLTextAreaElement | null
  learningInput?.addEventListener('input', () => autoResize(learningInput))
  learningInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void saveLearningFromPanel()
    }
  })

  const learningChatInput = document.getElementById('learningChatInput') as HTMLTextAreaElement | null
  learningChatInput?.addEventListener('input', () => autoResize(learningChatInput))
  learningChatInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void sendLearningChat()
    }
  })

  const innerBeingInput = document.getElementById('innerBeingInput') as HTMLTextAreaElement | null
  innerBeingInput?.addEventListener('input', () => autoResize(innerBeingInput))
  innerBeingInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void sendInnerBeingChat()
    }
  })

  const innerBeingBriefInput = document.getElementById('innerBeingBriefInput') as HTMLTextAreaElement | null
  innerBeingBriefInput?.addEventListener('input', () => autoResize(innerBeingBriefInput))
  innerBeingBriefInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void saveInnerBeingBrief()
    }
  })

  const playgroundSkillInput = document.getElementById('playgroundSkillInput') as HTMLInputElement | null
  playgroundSkillInput?.addEventListener('input', () => {
    playgroundDraftSkill = playgroundSkillInput.value
  })

  const playgroundIntentionInput = document.getElementById('playgroundIntentionInput') as HTMLTextAreaElement | null
  playgroundIntentionInput?.addEventListener('input', () => {
    playgroundDraftIntention = playgroundIntentionInput.value
    autoResize(playgroundIntentionInput)
  })

  const playgroundEnglishInput = document.getElementById('playgroundEnglishInput') as HTMLTextAreaElement | null
  playgroundEnglishInput?.addEventListener('input', () => {
    playgroundDraftEnglishFrame = playgroundEnglishInput.value
    autoResize(playgroundEnglishInput)
  })

  const playgroundLanguageInput = document.getElementById('playgroundLanguageInput') as HTMLTextAreaElement | null
  playgroundLanguageInput?.addEventListener('input', () => {
    playgroundDraftLanguageField = playgroundLanguageInput.value
    autoResize(playgroundLanguageInput)
  })

  const atlasFolderNameInput = document.getElementById('atlasFolderNameInput') as HTMLInputElement | null
  atlasFolderNameInput?.addEventListener('input', () => {
    atlasFolderDraftName = atlasFolderNameInput.value
  })

  const atlasFolderDescriptionInput = document.getElementById('atlasFolderDescriptionInput') as HTMLTextAreaElement | null
  atlasFolderDescriptionInput?.addEventListener('input', () => {
    atlasFolderDraftDescription = atlasFolderDescriptionInput.value
    autoResize(atlasFolderDescriptionInput)
  })

  const atlasFolderColorInput = document.getElementById('atlasFolderColorInput') as HTMLInputElement | null
  atlasFolderColorInput?.addEventListener('input', () => {
    atlasFolderDraftColor = atlasFolderColorInput.value
  })

  const atlasItemTitleInput = document.getElementById('atlasItemTitleInput') as HTMLInputElement | null
  atlasItemTitleInput?.addEventListener('input', () => {
    atlasItemDraftTitle = atlasItemTitleInput.value
  })

  const atlasItemSummaryInput = document.getElementById('atlasItemSummaryInput') as HTMLInputElement | null
  atlasItemSummaryInput?.addEventListener('input', () => {
    atlasItemDraftSummary = atlasItemSummaryInput.value
  })

  const atlasItemTagsInput = document.getElementById('atlasItemTagsInput') as HTMLInputElement | null
  atlasItemTagsInput?.addEventListener('input', () => {
    atlasItemDraftTags = atlasItemTagsInput.value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  })

  const atlasItemKindInput = document.getElementById('atlasItemKindInput') as HTMLSelectElement | null
  atlasItemKindInput?.addEventListener('change', () => {
    atlasItemDraftKind = atlasItemKindInput.value === 'brief' || atlasItemKindInput.value === 'thread-seed'
      ? atlasItemKindInput.value
      : 'note'
  })

  const atlasItemContentInput = document.getElementById('atlasItemContentInput') as HTMLTextAreaElement | null
  atlasItemContentInput?.addEventListener('input', () => {
    atlasItemDraftContent = atlasItemContentInput.value
    autoResize(atlasItemContentInput)
  })

  const atlasThreadsTitleInput = document.getElementById('atlasThreadsTitleInput') as HTMLInputElement | null
  atlasThreadsTitleInput?.addEventListener('input', () => {
    atlasThreadsDraftTitle = atlasThreadsTitleInput.value
  })

  const atlasThreadsAngleInput = document.getElementById('atlasThreadsAngleInput') as HTMLInputElement | null
  atlasThreadsAngleInput?.addEventListener('input', () => {
    atlasThreadsDraftAngle = atlasThreadsAngleInput.value
  })

  const atlasThreadsPromptInput = document.getElementById('atlasThreadsPromptInput') as HTMLTextAreaElement | null
  atlasThreadsPromptInput?.addEventListener('input', () => {
    atlasThreadsDraftPrompt = atlasThreadsPromptInput.value
    autoResize(atlasThreadsPromptInput)
  })

  const atlasThreadsContentInput = document.getElementById('atlasThreadsContentInput') as HTMLTextAreaElement | null
  atlasThreadsContentInput?.addEventListener('input', () => {
    atlasThreadsDraftContent = atlasThreadsContentInput.value
    autoResize(atlasThreadsContentInput)
  })

  const atlasThreadsScheduleInput = document.getElementById('atlasThreadsScheduleInput') as HTMLInputElement | null
  atlasThreadsScheduleInput?.addEventListener('input', () => {
    atlasThreadsDraftScheduledFor = atlasThreadsScheduleInput.value
  })

  const atlasThreadsAutoPublishInput = document.getElementById('atlasThreadsAutoPublishInput') as HTMLInputElement | null
  atlasThreadsAutoPublishInput?.addEventListener('change', () => {
    atlasThreadsDraftAutoPublish = atlasThreadsAutoPublishInput.checked
  })

  const playgroundLibraryTitleInput = document.getElementById('playgroundLibraryTitleInput') as HTMLInputElement | null
  playgroundLibraryTitleInput?.addEventListener('input', () => {
    libraryDraftTitle = playgroundLibraryTitleInput.value
  })

  const playgroundLibraryCategoryInput = document.getElementById('playgroundLibraryCategoryInput') as HTMLSelectElement | null
  playgroundLibraryCategoryInput?.addEventListener('change', () => {
    libraryDraftCategory = playgroundLibraryCategoryInput.value === 'image'
      ? 'image'
      : playgroundLibraryCategoryInput.value === 'misc'
        ? 'misc'
        : 'sound'
  })

  const openingRitualDetailsInput = document.getElementById('openingRitualDetailsInput') as HTMLTextAreaElement | null
  openingRitualDetailsInput?.addEventListener('input', () => autoResize(openingRitualDetailsInput))

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void catchUpLearningCycles()
      void catchUpScheduledAtlasDrafts()
    }
  })
  window.addEventListener('focus', () => {
    void catchUpLearningCycles()
    void catchUpScheduledAtlasDrafts()
  })

  // Set initial voice toggle state
  setVoiceToggleState(voiceEnabled)
  syncVoiceCaptureUI()
})
