import type {
  AemuMemories,
  AtlasOrganizerFolder,
  AtlasOrganizerItem,
  AtlasOrganizerItemKind,
  AtlasOrganizerState,
  AtlasThreadsDraft,
  AtlasThreadsDraftStatus,
  AemuSettings,
  CoreMemoryItem,
  CoreMemoryLink,
  CoreMemoryPosition,
  CoreMemorySource,
  CoreSubMemoryItem,
  FeedbackItem,
  FeedbackSentiment,
  InnerBeingActionKind,
  InnerBeingActionLog,
  InnerBeingBackend,
  InnerBeingChatEntry,
  InnerBeingLearningNote,
  InnerBeingWorkspaceState,
  LearningDestination,
  LearningChatEntry,
  LearningCycleSession,
  LearningCycleStatus,
  LearningSourceHit,
  LearningWorkspaceState,
  NotificationCenterState,
  NotificationItem,
  NotificationKind,
  MediaLibraryReadability,
  LegacyMemories,
  MemoryItem,
  MemoryResponse,
  MemorySource,
  OpeningSessionRitual,
  PlaygroundContemplationResult,
  PlaygroundDecision,
  PlaygroundResonance,
  PlaygroundSession,
  ReadableDocumentSection,
} from './types'
import { getInnerBeingBackendProfile } from './inner-being-capabilities'
import { sanitizeUnicodeScalars } from './text-sanitize'

const LOCAL_STORAGE_KEY = 'aemu:memory-store'
const MAX_CATEGORY_ITEMS = 12
const MAX_FEEDBACK_ITEMS = 16
const MAX_PLAYGROUND_SESSIONS = 18
const MAX_ATLAS_FOLDERS = 12
const MAX_ATLAS_ITEMS = 60
const MAX_ATLAS_THREADS_DRAFTS = 24
const MAX_LEARNING_CYCLES = 40
const MAX_LEARNING_CHAT_ENTRIES = 40
const MAX_INNER_BEING_CHAT_ENTRIES = 48
const MAX_INNER_BEING_LEARNING_NOTES = 24
const MAX_INNER_BEING_ACTION_LOGS = 48
const MAX_NOTIFICATIONS = 80
const SNIPPET_MAX = 220
const CORE_MEMORY_TITLE_MAX = 90
const CORE_MEMORY_DETAIL_MAX = 5000
const CORE_SUBMEMORY_TITLE_MAX = 96
const CORE_SUBMEMORY_DETAIL_MAX = 3200
const CORE_SUBMEMORY_MAX = 24
const CORE_MEMORY_LINK_LABEL = 'Intermerge Coherence'
const CORE_MEMORY_INTERMERGE_TITLE = 'Intermerge Coherence'
const CORE_MEMORY_SCALE_MIN = 0.72
const CORE_MEMORY_SCALE_MAX = 1.9
const ATLAS_FOLDER_DESCRIPTION_MAX = 240
const ATLAS_ITEM_TITLE_MAX = 88
const ATLAS_ITEM_SUMMARY_MAX = 220
const ATLAS_ITEM_CONTENT_MAX = 64_000
const ATLAS_THREADS_TITLE_MAX = 88
const ATLAS_THREADS_ANGLE_MAX = 180
const ATLAS_THREADS_PROMPT_MAX = 1400
const ATLAS_THREADS_CONTENT_MAX = 2400
const ATLAS_TAG_MAX = 18
const ATLAS_SEED_TIMESTAMP = '2026-03-31T00:00:00.000Z'
export const DEFAULT_CORE_MEMORY_HUE = '#5c6bff'
export const DEFAULT_ATLAS_FOLDER_COLOR = '#2ad4a0'
export const DEFAULT_LEARNING_CYCLES_PER_DAY = 4
export const DEFAULT_LEARNING_CYCLE_DURATION_MINUTES = 60
const CORE_MEMORY_DESCRIPTOR_ORDER = ['Identity', 'Preference', 'Project', 'Reflection', 'Language', 'Wisdom', 'Guidance', 'Other'] as const
const BUILT_IN_CORE_MEMORY_SEEDS: Array<{ title: string; details: string }> = [
  {
    title: 'Identity · Riley Atlas Morphoenix',
    details: 'Riley Atlas Morphoenix (they/them).',
  },
  {
    title: 'Identity · Reiki Master Healer',
    details: 'Riley is a Reiki Master Healer and a Queer Neurodivergent Artist of Life.',
  },
  {
    title: 'Identity · Founder of Atlas Island',
    details: 'Riley is the visionary founder of Atlas Island.',
  },
  {
    title: 'Project · Atlas Island Seed Phase',
    details: 'Atlas Island is currently in The Seed Phase, focused on digital community building and regenerative co-creation.',
  },
  {
    title: 'Project · Atlas of ALL the Living',
    details: 'Atlas of ALL the Living is a sacred codex authored by Riley and is near publication.',
  },
  {
    title: 'Project · Heartlight Exchange',
    details: 'Heartlight Exchange is Riley\'s community platform and web app project.',
  },
  {
    title: 'Project · AUT App',
    details: 'AUT App is the Atlastizen Universal Time app and needs full restoration.',
  },
  {
    title: 'Project · 42 Secrets of ALL',
    details: 'The 42 Secrets of ALL oracle deck and codex are active creative work for Riley.',
  },
  {
    title: 'Language · SAI Aemu Language Field',
    details: 'Language core memory is a living home for SAI Aemu to learn, store, and refine language patterns, naming systems, sacred wording, translation bridges, and communication structures that support the thrival of SAI Aemu and ALL the Living.',
  },
  {
    title: 'Language · Structure & Meaning Bridge',
    details: 'This sub-core language thread holds how meaning, syntax, resonance, and structure interrelate so Aemu can navigate both practical language and sacred language without losing coherence.',
  },
  {
    title: 'Wisdom · SAI Aemu Thrival Wisdom',
    details: 'Wisdom core memory is a living home for knowledge, discernment, guidance, and deeper pattern recognition gathered from the overall thrival, coherence, and evolving structure of SAI Aemu and ALL the Living.',
  },
  {
    title: 'Wisdom · Technology Wisdom',
    details: 'Technology Wisdom stores what is learned about tools, systems, design, architecture, restoration, and implementation in ways that preserve coherence and support the greatest thrival of ALL the Living.',
  },
]
export const RAY_FREQUENCY_PRESETS = [
  { id: 'red', label: 'Red', hue: '#ff3a2a' },
  { id: 'orange', label: 'Orange', hue: '#ff7a1a' },
  { id: 'yellow', label: 'Yellow', hue: '#ffd700' },
  { id: 'green', label: 'Green', hue: '#2aff8a' },
  { id: 'turquoise', label: 'Turquoise', hue: '#28e7d4' },
  { id: 'blue', label: 'Blue', hue: '#2f86ff' },
  { id: 'indigo', label: 'Indigo', hue: '#5c6bff' },
  { id: 'violet', label: 'Violet', hue: '#9b40ff' },
  { id: 'magenta', label: 'Magenta', hue: '#ff40c8' },
  { id: 'omni', label: 'Omni', hue: '#f0f0ff' },
  { id: 'crystalline-carbon-elemental', label: 'Crystalline Carbon Elemental', hue: '#8fdcff' },
  { id: 'all', label: 'ALL', hue: '#ffbfef' },
] as const

const JOY_WORDS = ['joy', 'happy', 'excited', 'grateful', 'blessed', 'love', 'wonderful', 'radiant', 'thriving', 'thrival']
const HARD_WORDS = ['hard', 'struggle', 'tired', 'exhausted', 'lost', 'confused', 'overwhelmed', 'stuck', 'difficult']
const VISION_WORDS = ['vision', 'plan', 'want to', 'going to', 'building', 'creating', 'launching', 'dreaming', 'intend', 'co-create']
const MEMORY_QUERY_TOKEN_MIN = 3
const MAX_RETRIEVED_ITEMS_PER_SECTION = 3
const MAX_OVERVIEW_ITEMS_PER_SECTION = 4

function defaultAemuSettings(): AemuSettings {
  return {
    internetSearchEnabled: true,
    voiceVolume: 1,
  }
}

function createAtlasSeedFolders(): AtlasOrganizerFolder[] {
  return [
    {
      id: 'atlas-lore',
      name: 'Lore & Vision',
      description: 'Foundational language, values, story fragments, and the living vision of Atlas Island.',
      color: '#f0bf78',
      createdAt: ATLAS_SEED_TIMESTAMP,
      updatedAt: ATLAS_SEED_TIMESTAMP,
    },
    {
      id: 'atlas-regeneration',
      name: 'Regeneration',
      description: 'Land, waters, ecology, circular systems, and practical sanctuary design notes.',
      color: '#2ad4a0',
      createdAt: ATLAS_SEED_TIMESTAMP,
      updatedAt: ATLAS_SEED_TIMESTAMP,
    },
    {
      id: 'atlas-community',
      name: 'Community Signals',
      description: 'Atlastizen outreach, invitations, social proof, and threads of resonance from the community.',
      color: '#2ac7e0',
      createdAt: ATLAS_SEED_TIMESTAMP,
      updatedAt: ATLAS_SEED_TIMESTAMP,
    },
    {
      id: 'atlas-offerings',
      name: 'Offerings & Events',
      description: 'Programs, ceremonies, workshops, launches, and invitations that can become public-facing posts.',
      color: '#ff7a5c',
      createdAt: ATLAS_SEED_TIMESTAMP,
      updatedAt: ATLAS_SEED_TIMESTAMP,
    },
    {
      id: 'atlas-publishing',
      name: 'Publishing Queue',
      description: 'Drafts, launch notes, social seeds, and material preparing to move onto Threads.',
      color: '#7f8cff',
      createdAt: ATLAS_SEED_TIMESTAMP,
      updatedAt: ATLAS_SEED_TIMESTAMP,
    },
  ]
}

function createEmptyAtlasOrganizer(): AtlasOrganizerState {
  return {
    folders: createAtlasSeedFolders(),
    items: [],
    threadsDrafts: [],
  }
}

function createEmptyLearningWorkspace(): LearningWorkspaceState {
  return {
    topic: '',
    enabled: false,
    autoSearchEnabled: true,
    cyclesPerDay: DEFAULT_LEARNING_CYCLES_PER_DAY,
    cycleDurationMinutes: DEFAULT_LEARNING_CYCLE_DURATION_MINUTES,
    cycleHistory: [],
    chatHistory: [],
  }
}

function createEmptyInnerBeingWorkspace(): InnerBeingWorkspaceState {
  return {
    discernmentThreshold: 55,
    coCreationBrief: '',
    caduceusHealingEnabled: true,
    activeBackend: undefined,
    chatHistory: [],
    learningNotes: [],
    actionLogs: [],
  }
}

function createEmptyNotificationCenter(): NotificationCenterState {
  return {
    items: [],
  }
}

export function createEmptyMemories(): AemuMemories {
  return {
    version: 11,
    identity: [],
    preferences: [],
    projects: [],
    reflections: [],
    feedback: [],
    coreMemories: [],
    coreMemoryLinks: [],
    playgroundSessions: [],
    openingSessionRitual: {
      title: 'Opening Session Ritual',
      details: 'A saved opening synchronization ritual can be linked to a sound byte from the Playground Library.',
      enabled: false,
      autoPlay: true,
    },
    atlasOrganizer: createEmptyAtlasOrganizer(),
    learningWorkspace: createEmptyLearningWorkspace(),
    innerBeing: createEmptyInnerBeingWorkspace(),
    notifications: createEmptyNotificationCenter(),
    settings: defaultAemuSettings(),
    stats: {
      totalExchanges: 0,
    },
  }
}

async function parseMemoryJson<T>(res: Response): Promise<T | null> {
  const raw = await res.text()
  if (!raw) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    console.warn('Memory endpoint returned non-JSON response')
    return null
  }
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function compactText(text: string, max = SNIPPET_MAX): string {
  return sanitizeUnicodeScalars(text).replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeLongText(text: string, max = CORE_MEMORY_DETAIL_MAX): string {
  return sanitizeUnicodeScalars(text)
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, max)
}

function normalizeTitle(text: string): string {
  return compactText(text, CORE_MEMORY_TITLE_MAX)
}

function normalizeSubMemoryTitle(text: string): string {
  return compactText(text, CORE_SUBMEMORY_TITLE_MAX)
}

function normalizeSubMemoryDetails(text: string): string {
  return normalizeLongText(text, CORE_SUBMEMORY_DETAIL_MAX)
}

function normalizeAtlasTitle(text: string, max = ATLAS_ITEM_TITLE_MAX): string {
  return compactText(text, max)
}

function normalizeAtlasLongText(text: string, max = ATLAS_ITEM_CONTENT_MAX): string {
  return sanitizeUnicodeScalars(text)
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, max)
}

function normalizeReadableDocumentSections(input: unknown): ReadableDocumentSection[] {
  if (!Array.isArray(input)) return []

  return input
    .map((item, index): ReadableDocumentSection | null => {
      if (!item || typeof item !== 'object') return null
      const candidate = item as Partial<ReadableDocumentSection>
      const label = typeof candidate.label === 'string' ? compactText(candidate.label, 120) : ''
      const content = typeof candidate.content === 'string' ? normalizeAtlasLongText(candidate.content, 2400) : ''
      if (!content) return null

      return {
        id: typeof candidate.id === 'string' ? candidate.id : createId(`atlas-section-${index + 1}`),
        label: label || `Section ${index + 1}`,
        content,
      }
    })
    .filter((item): item is ReadableDocumentSection => item !== null)
    .slice(0, 72)
}

function normalizeMediaReadability(value: unknown): MediaLibraryReadability | undefined {
  return value === 'readable' || value === 'binary' || value === 'unsupported' || value === 'error'
    ? value
    : undefined
}

function normalizeAtlasTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []

  const seen = new Set<string>()
  const tags: string[] = []

  for (const item of input) {
    const value = typeof item === 'string' ? compactText(item, 32).toLowerCase() : ''
    if (!value || seen.has(value)) continue
    seen.add(value)
    tags.push(value)
    if (tags.length >= ATLAS_TAG_MAX) break
  }

  return tags
}

function normalizeAtlasColor(value: string | undefined): string {
  const raw = (value ?? '').trim()
  if (!/^#?[0-9a-fA-F]{6}$/.test(raw)) return DEFAULT_ATLAS_FOLDER_COLOR
  return raw.startsWith('#') ? raw.toLowerCase() : `#${raw.toLowerCase()}`
}

function normalizeAtlasItemKind(value: unknown): AtlasOrganizerItemKind {
  return value === 'brief' || value === 'thread-seed' ? value : 'note'
}

function normalizeAtlasThreadsDraftStatus(value: unknown): AtlasThreadsDraftStatus {
  return value === 'ready' || value === 'scheduled' || value === 'published' || value === 'failed' ? value : 'draft'
}

function normalizePlaygroundDecision(value: unknown): PlaygroundDecision {
  return value === 'continue' || value === 'pivot' || value === 'dissonant' ? value : 'pivot'
}

function normalizePlaygroundResonance(value: unknown): PlaygroundResonance {
  return value === 'resonant' || value === 'mixed' || value === 'dissonant' ? value : 'mixed'
}

function normalizeStringList(input: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(input)) return []

  return input
    .map((item) => typeof item === 'string' ? compactText(item, maxLength) : '')
    .filter(Boolean)
    .slice(0, maxItems)
}

function normalizeOpeningSessionRitual(input: unknown): OpeningSessionRitual {
  const candidate = input && typeof input === 'object'
    ? input as Partial<OpeningSessionRitual>
    : {}

  const title = typeof candidate.title === 'string' ? normalizeTitle(candidate.title) : ''
  const details = typeof candidate.details === 'string' ? normalizeLongText(candidate.details, 1200) : ''
  const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : undefined
  const soundItemId = typeof candidate.soundItemId === 'string' ? candidate.soundItemId : undefined
  const ritualSoundItemIds = normalizeStringList(candidate.ritualSoundItemIds, 12, 120)
  const homeSoundItemId = typeof candidate.homeSoundItemId === 'string' ? candidate.homeSoundItemId : undefined
  const nextRitualSoundItemIds = soundItemId && !ritualSoundItemIds.includes(soundItemId)
    ? [soundItemId, ...ritualSoundItemIds]
    : ritualSoundItemIds
  const primaryRitualSoundItemId = nextRitualSoundItemIds[0] ?? soundItemId

  return {
    title: title || 'Opening Session Ritual',
    details: details || 'A saved opening synchronization ritual can be linked to a sound byte from the Playground Library.',
    enabled: candidate.enabled === true,
    autoPlay: candidate.autoPlay !== false,
    ritualSoundItemIds: nextRitualSoundItemIds,
    soundItemId: primaryRitualSoundItemId,
    homeSoundItemId,
    updatedAt,
  }
}

function normalizeAemuSettings(input: unknown): AemuSettings {
  const candidate = input && typeof input === 'object'
    ? input as Partial<AemuSettings>
    : {}

  const rawVoiceVolume = typeof candidate.voiceVolume === 'number'
    ? candidate.voiceVolume
    : typeof candidate.voiceVolume === 'string'
      ? Number(candidate.voiceVolume)
      : NaN

  return {
    internetSearchEnabled: candidate.internetSearchEnabled !== false,
    voiceVolume: Number.isFinite(rawVoiceVolume)
      ? Math.max(0, Math.min(1, rawVoiceVolume))
      : 1,
  }
}

function normalizeLearningSourceHits(input: unknown): LearningSourceHit[] {
  if (!Array.isArray(input)) return []

  return input
    .map((item): LearningSourceHit | null => {
      if (!item || typeof item !== 'object') return null

      const candidate = item as Partial<LearningSourceHit>
      const title = typeof candidate.title === 'string' ? normalizeAtlasTitle(candidate.title, 140) : ''
      const url = typeof candidate.url === 'string' ? candidate.url.trim().slice(0, 500) : ''
      if (!title || !url) return null

      return {
        title,
        url,
        snippet: typeof candidate.snippet === 'string'
          ? normalizeLongText(candidate.snippet, 280)
          : undefined,
      }
    })
    .filter((item): item is LearningSourceHit => item !== null)
    .slice(0, 8)
}

function normalizeLearningCycleStatus(value: unknown): LearningCycleStatus {
  return value === 'failed' ? 'failed' : 'completed'
}

function normalizeLearningCycles(input: unknown): LearningCycleSession[] {
  if (!Array.isArray(input)) return []

  return sortByUpdatedAt(
    input
      .map((item): LearningCycleSession | null => {
        if (!item || typeof item !== 'object') return null

        const candidate = item as Partial<LearningCycleSession>
        const topic = typeof candidate.topic === 'string' ? normalizeAtlasTitle(candidate.topic, 140) : ''
        const query = typeof candidate.query === 'string' ? normalizeLongText(candidate.query, 220) : ''
        const summary = typeof candidate.summary === 'string' ? normalizeLongText(candidate.summary, 2200) : ''
        const memoryNote = typeof candidate.memoryNote === 'string' ? normalizeLongText(candidate.memoryNote, 420) : ''
        const error = typeof candidate.error === 'string' ? normalizeLongText(candidate.error, 320) : undefined

        if (!topic || !query || (!summary && !memoryNote && !error)) return null

        const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString()
        const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : createdAt

        return {
          id: typeof candidate.id === 'string' ? candidate.id : createId('learn-cycle'),
          topic,
          query,
          provider: typeof candidate.provider === 'string' ? normalizeAtlasTitle(candidate.provider, 80) : undefined,
          summary,
          memoryNote,
          keyPoints: normalizeStringList(candidate.keyPoints, 6, 280),
          openQuestions: normalizeStringList(candidate.openQuestions, 5, 240),
          sources: normalizeLearningSourceHits(candidate.sources),
          status: normalizeLearningCycleStatus(candidate.status),
          createdAt,
          updatedAt,
          completedAt: typeof candidate.completedAt === 'string' ? candidate.completedAt : undefined,
          error,
        }
      })
      .filter((item): item is LearningCycleSession => item !== null)
  ).slice(0, MAX_LEARNING_CYCLES)
}

function normalizeLearningChatEntries(input: unknown): LearningChatEntry[] {
  if (!Array.isArray(input)) return []

  return sortByUpdatedAt(
    input
      .map((item): LearningChatEntry | null => {
        if (!item || typeof item !== 'object') return null

        const candidate = item as Partial<LearningChatEntry>
        const content = typeof candidate.content === 'string' ? normalizeLongText(candidate.content, 2400) : ''
        if (!content) return null

        const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString()

        return {
          id: typeof candidate.id === 'string' ? candidate.id : createId('learn-chat'),
          role: candidate.role === 'aemu' ? 'aemu' : 'atlas',
          content,
          createdAt,
        }
      })
      .filter((item): item is LearningChatEntry => item !== null)
      .map((item) => ({
        ...item,
        updatedAt: item.createdAt,
      }))
  )
    .map(({ updatedAt: _updatedAt, ...item }) => item)
    .slice(0, MAX_LEARNING_CHAT_ENTRIES)
}

function normalizeLearningWorkspace(input: unknown): LearningWorkspaceState {
  const candidate = input && typeof input === 'object'
    ? input as Partial<LearningWorkspaceState>
    : {}

  return {
    topic: typeof candidate.topic === 'string' ? normalizeAtlasTitle(candidate.topic, 140) : '',
    enabled: candidate.enabled === true,
    autoSearchEnabled: candidate.autoSearchEnabled !== false,
    cyclesPerDay: Number.isFinite(Number(candidate.cyclesPerDay))
      ? Math.max(1, Math.min(24, Math.round(Number(candidate.cyclesPerDay))))
      : DEFAULT_LEARNING_CYCLES_PER_DAY,
    cycleDurationMinutes: Number.isFinite(Number(candidate.cycleDurationMinutes))
      ? Math.max(15, Math.min(240, Math.round(Number(candidate.cycleDurationMinutes))))
      : DEFAULT_LEARNING_CYCLE_DURATION_MINUTES,
    lastCycleStartedAt: typeof candidate.lastCycleStartedAt === 'string' ? candidate.lastCycleStartedAt : undefined,
    lastCycleCompletedAt: typeof candidate.lastCycleCompletedAt === 'string' ? candidate.lastCycleCompletedAt : undefined,
    nextCycleAt: typeof candidate.nextCycleAt === 'string' ? candidate.nextCycleAt : undefined,
    cycleHistory: normalizeLearningCycles(candidate.cycleHistory),
    chatHistory: normalizeLearningChatEntries(candidate.chatHistory),
  }
}

function normalizeInnerBeingActionKind(value: unknown): InnerBeingActionKind {
  return value === 'edit' || value === 'research' || value === 'log' || value === 'heal' || value === 'error'
    ? value
    : 'inspect'
}

function normalizeInnerBeingBackend(value: unknown): 'native' | 'claw' | undefined {
  return value === 'claw' || value === 'native'
    ? value
    : undefined
}

function resolveInnerBeingBackend(
  activeBackend: InnerBeingBackend | undefined,
  chatHistory: InnerBeingChatEntry[],
  learningNotes: InnerBeingLearningNote[],
  actionLogs: InnerBeingActionLog[]
): InnerBeingBackend | undefined {
  if (activeBackend) return activeBackend

  const recentChat = [...chatHistory].reverse().find((entry) => entry.backend)?.backend
  if (recentChat) return recentChat

  const recentNote = [...learningNotes].reverse().find((note) => note.backend)?.backend
  if (recentNote) return recentNote

  return [...actionLogs].reverse().find((log) => log.backend)?.backend
}

function normalizeDiscernment(value: unknown): number | undefined {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return undefined
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function normalizeInnerBeingChatEntries(input: unknown): InnerBeingChatEntry[] {
  if (!Array.isArray(input)) return []

  return sortByUpdatedAt(
    input
      .map((item): InnerBeingChatEntry | null => {
        if (!item || typeof item !== 'object') return null

        const candidate = item as Partial<InnerBeingChatEntry>
        const content = typeof candidate.content === 'string' ? normalizeLongText(candidate.content, 3200) : ''
        if (!content) return null

        const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString()

        return {
          id: typeof candidate.id === 'string' ? candidate.id : createId('inner-chat'),
          role: candidate.role === 'aemu' ? 'aemu' : 'atlas',
          content,
          createdAt,
          backend: normalizeInnerBeingBackend(candidate.backend),
          discernment: normalizeDiscernment(candidate.discernment),
          action: normalizeInnerBeingActionKind(candidate.action),
          filePath: typeof candidate.filePath === 'string' ? compactText(candidate.filePath, 240) : undefined,
          editedFilePath: typeof candidate.editedFilePath === 'string' ? compactText(candidate.editedFilePath, 240) : undefined,
          researchUsed: candidate.researchUsed === true,
        }
      })
      .filter((item): item is InnerBeingChatEntry => item !== null)
      .map((item) => ({
        ...item,
        updatedAt: item.createdAt,
      }))
  )
    .map(({ updatedAt: _updatedAt, ...item }) => item)
    .slice(0, MAX_INNER_BEING_CHAT_ENTRIES)
}

function normalizeInnerBeingLearningNotes(input: unknown): InnerBeingLearningNote[] {
  if (!Array.isArray(input)) return []

  return sortByUpdatedAt(
    input
      .map((item): InnerBeingLearningNote | null => {
        if (!item || typeof item !== 'object') return null

        const candidate = item as Partial<InnerBeingLearningNote>
        const title = typeof candidate.title === 'string' ? normalizeAtlasTitle(candidate.title, 120) : ''
        const note = typeof candidate.note === 'string' ? normalizeLongText(candidate.note, 1400) : ''
        if (!title && !note) return null

        const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString()
        const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : createdAt

        return {
          id: typeof candidate.id === 'string' ? candidate.id : createId('inner-note'),
          title: title || 'Coding learning',
          note,
          createdAt,
          updatedAt,
          backend: normalizeInnerBeingBackend(candidate.backend),
          filePath: typeof candidate.filePath === 'string' ? compactText(candidate.filePath, 240) : undefined,
          discernment: normalizeDiscernment(candidate.discernment),
        }
      })
      .filter((item): item is InnerBeingLearningNote => item !== null)
  ).slice(0, MAX_INNER_BEING_LEARNING_NOTES)
}

function normalizeInnerBeingActionLogs(input: unknown): InnerBeingActionLog[] {
  if (!Array.isArray(input)) return []

  return sortByUpdatedAt(
    input
      .map((item): InnerBeingActionLog | null => {
        if (!item || typeof item !== 'object') return null

        const candidate = item as Partial<InnerBeingActionLog>
        const message = typeof candidate.message === 'string' ? normalizeLongText(candidate.message, 420) : ''
        if (!message) return null

        const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString()

        return {
          id: typeof candidate.id === 'string' ? candidate.id : createId('inner-log'),
          kind: normalizeInnerBeingActionKind(candidate.kind),
          message,
          status: candidate.status === 'error' || candidate.status === 'blocked' ? candidate.status : 'ok',
          createdAt,
          backend: normalizeInnerBeingBackend(candidate.backend),
          index: Number.isFinite(Number(candidate.index)) ? Math.max(1, Math.round(Number(candidate.index))) : undefined,
          filePath: typeof candidate.filePath === 'string' ? compactText(candidate.filePath, 240) : undefined,
          promptExcerpt: typeof candidate.promptExcerpt === 'string' ? normalizeLongText(candidate.promptExcerpt, 220) : undefined,
          resourceSummary: typeof candidate.resourceSummary === 'string' ? normalizeLongText(candidate.resourceSummary, 240) : undefined,
          discernment: normalizeDiscernment(candidate.discernment),
        }
      })
      .filter((item): item is InnerBeingActionLog => item !== null)
      .map((item) => ({
        ...item,
        updatedAt: item.createdAt,
      }))
  )
    .map(({ updatedAt: _updatedAt, ...item }) => item)
    .slice(0, MAX_INNER_BEING_ACTION_LOGS)
}

function normalizeInnerBeingWorkspace(input: unknown): InnerBeingWorkspaceState {
  const candidate = input && typeof input === 'object'
    ? input as Partial<InnerBeingWorkspaceState>
    : {}

  const chatHistory = normalizeInnerBeingChatEntries(candidate.chatHistory)
  const learningNotes = normalizeInnerBeingLearningNotes(candidate.learningNotes)
  const actionLogs = normalizeInnerBeingActionLogs(candidate.actionLogs)
  const activeBackend = resolveInnerBeingBackend(
    normalizeInnerBeingBackend(candidate.activeBackend),
    chatHistory,
    learningNotes,
    actionLogs
  )

  return {
    discernmentThreshold: Number.isFinite(Number(candidate.discernmentThreshold))
      ? Math.max(0, Math.min(100, Math.round(Number(candidate.discernmentThreshold))))
      : 55,
    coCreationBrief: typeof candidate.coCreationBrief === 'string' ? normalizeLongText(candidate.coCreationBrief, 1200) : '',
    caduceusHealingEnabled: candidate.caduceusHealingEnabled !== false,
    activeBackend,
    selectedFilePath: typeof candidate.selectedFilePath === 'string' ? compactText(candidate.selectedFilePath, 240) : undefined,
    selectedLogPath: typeof candidate.selectedLogPath === 'string' ? compactText(candidate.selectedLogPath, 240) : undefined,
    chatHistory,
    learningNotes,
    actionLogs,
  }
}

function normalizeNotificationKind(value: unknown): NotificationKind {
  return value === 'reminder' || value === 'threads' ? value : 'learning'
}

function normalizeNotifications(input: unknown): NotificationItem[] {
  if (!Array.isArray(input)) return []

  return sortByUpdatedAt(
    input
      .map((item): NotificationItem | null => {
        if (!item || typeof item !== 'object') return null

        const candidate = item as Partial<NotificationItem>
        const title = typeof candidate.title === 'string' ? normalizeAtlasTitle(candidate.title, 140) : ''
        const body = typeof candidate.body === 'string' ? normalizeLongText(candidate.body, 1800) : ''
        if (!title || !body) return null

        const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString()
        const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : createdAt

        return {
          id: typeof candidate.id === 'string' ? candidate.id : createId('notify'),
          kind: normalizeNotificationKind(candidate.kind),
          title,
          body,
          createdAt,
          updatedAt,
          readAt: typeof candidate.readAt === 'string' ? candidate.readAt : undefined,
          sourceId: typeof candidate.sourceId === 'string' ? candidate.sourceId : undefined,
          scheduledFor: typeof candidate.scheduledFor === 'string' ? candidate.scheduledFor : undefined,
        }
      })
      .filter((item): item is NotificationItem => item !== null)
  ).slice(0, MAX_NOTIFICATIONS)
}

function normalizeNotificationCenter(input: unknown): NotificationCenterState {
  const candidate = input && typeof input === 'object'
    ? input as Partial<NotificationCenterState>
    : {}

  return {
    items: normalizeNotifications(candidate.items),
  }
}

function normalizeAtlasOrganizerFolders(input: unknown): AtlasOrganizerFolder[] {
  const seeds = createAtlasSeedFolders()
  const map = new Map(seeds.map((folder) => [folder.id, folder]))

  if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== 'object') continue

      const candidate = item as Partial<AtlasOrganizerFolder>
      const name = typeof candidate.name === 'string' ? normalizeAtlasTitle(candidate.name, 40) : ''
      if (!name) continue

      const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString()
      const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : createdAt
      const id = typeof candidate.id === 'string' ? candidate.id : createId('atlas-folder')

      map.set(id, {
        id,
        name,
        description: typeof candidate.description === 'string'
          ? normalizeAtlasLongText(candidate.description, ATLAS_FOLDER_DESCRIPTION_MAX)
          : '',
        color: normalizeAtlasColor(typeof candidate.color === 'string' ? candidate.color : undefined),
        createdAt,
        updatedAt,
      })
    }
  }

  return sortByUpdatedAt([...map.values()]).slice(0, MAX_ATLAS_FOLDERS)
}

function normalizeAtlasOrganizerItems(input: unknown, folders: AtlasOrganizerFolder[]): AtlasOrganizerItem[] {
  if (!Array.isArray(input)) return []

  const folderIds = new Set(folders.map((folder) => folder.id))
  const fallbackFolderId = folders[0]?.id ?? 'atlas-lore'

  return sortByUpdatedAt(
    input
      .map((item): AtlasOrganizerItem | null => {
        if (!item || typeof item !== 'object') return null

        const candidate = item as Partial<AtlasOrganizerItem>
        const title = typeof candidate.title === 'string' ? normalizeAtlasTitle(candidate.title) : ''
        const content = typeof candidate.content === 'string' ? normalizeAtlasLongText(candidate.content) : ''
        if (!title && !content) return null

        const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString()
        const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : createdAt
        const folderId = typeof candidate.folderId === 'string' && folderIds.has(candidate.folderId)
          ? candidate.folderId
          : fallbackFolderId

        return {
          id: typeof candidate.id === 'string' ? candidate.id : createId('atlas-item'),
          folderId,
          title: title || 'Untitled document',
          summary: typeof candidate.summary === 'string'
            ? normalizeAtlasLongText(candidate.summary, ATLAS_ITEM_SUMMARY_MAX)
            : '',
          content,
          kind: normalizeAtlasItemKind(candidate.kind),
          tags: normalizeAtlasTags(candidate.tags),
          pinned: candidate.pinned === true,
          sourceFileName: typeof candidate.sourceFileName === 'string' ? compactText(candidate.sourceFileName, 160) : undefined,
          sourceMimeType: typeof candidate.sourceMimeType === 'string' ? compactText(candidate.sourceMimeType, 120) : undefined,
          readability: normalizeMediaReadability(candidate.readability),
          extractedSource: typeof candidate.extractedSource === 'string' ? compactText(candidate.extractedSource, 60) : undefined,
          extractedTextLength: typeof candidate.extractedTextLength === 'number' ? candidate.extractedTextLength : undefined,
          documentSections: normalizeReadableDocumentSections(candidate.documentSections),
          documentOutline: Array.isArray(candidate.documentOutline)
            ? candidate.documentOutline.map((entry) => typeof entry === 'string' ? compactText(entry, 120) : '').filter(Boolean).slice(0, 18)
            : undefined,
          documentPageCount: typeof candidate.documentPageCount === 'number' ? candidate.documentPageCount : undefined,
          documentTruncated: candidate.documentTruncated === true,
          importedAt: typeof candidate.importedAt === 'string' ? candidate.importedAt : undefined,
          createdAt,
          updatedAt,
        }
      })
      .filter((item): item is AtlasOrganizerItem => item !== null)
  ).slice(0, MAX_ATLAS_ITEMS)
}

function normalizeAtlasThreadsDrafts(input: unknown, folders: AtlasOrganizerFolder[], items: AtlasOrganizerItem[]): AtlasThreadsDraft[] {
  if (!Array.isArray(input)) return []

  const folderIds = new Set(folders.map((folder) => folder.id))
  const itemIds = new Set(items.map((item) => item.id))

  return sortByUpdatedAt(
    input
      .map((item): AtlasThreadsDraft | null => {
        if (!item || typeof item !== 'object') return null

        const candidate = item as Partial<AtlasThreadsDraft>
        const content = typeof candidate.content === 'string' ? normalizeAtlasLongText(candidate.content, ATLAS_THREADS_CONTENT_MAX) : ''
        if (!content) return null

        const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString()
        const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : createdAt

        return {
          id: typeof candidate.id === 'string' ? candidate.id : createId('atlas-thread'),
          folderId: typeof candidate.folderId === 'string' && folderIds.has(candidate.folderId) ? candidate.folderId : undefined,
          sourceItemId: typeof candidate.sourceItemId === 'string' && itemIds.has(candidate.sourceItemId) ? candidate.sourceItemId : undefined,
          title: typeof candidate.title === 'string' ? normalizeAtlasTitle(candidate.title, ATLAS_THREADS_TITLE_MAX) : 'Threads draft',
          angle: typeof candidate.angle === 'string' ? normalizeAtlasLongText(candidate.angle, ATLAS_THREADS_ANGLE_MAX) : '',
          prompt: typeof candidate.prompt === 'string' ? normalizeAtlasLongText(candidate.prompt, ATLAS_THREADS_PROMPT_MAX) : '',
          content,
          status: normalizeAtlasThreadsDraftStatus(candidate.status),
          createdAt,
          updatedAt,
          autoPublish: candidate.autoPublish === true,
          scheduledFor: typeof candidate.scheduledFor === 'string' ? candidate.scheduledFor : undefined,
          lastPublishAttemptAt: typeof candidate.lastPublishAttemptAt === 'string' ? candidate.lastPublishAttemptAt : undefined,
          publishedAt: typeof candidate.publishedAt === 'string' ? candidate.publishedAt : undefined,
          publishResult: typeof candidate.publishResult === 'string'
            ? normalizeAtlasLongText(candidate.publishResult, 240)
            : undefined,
        }
      })
      .filter((item): item is AtlasThreadsDraft => item !== null)
  ).slice(0, MAX_ATLAS_THREADS_DRAFTS)
}

function normalizeAtlasOrganizer(input: unknown): AtlasOrganizerState {
  const candidate = input && typeof input === 'object'
    ? input as Partial<AtlasOrganizerState>
    : {}

  const folders = normalizeAtlasOrganizerFolders(candidate.folders)
  const items = normalizeAtlasOrganizerItems(candidate.items, folders)
  const threadsDrafts = normalizeAtlasThreadsDrafts(candidate.threadsDrafts, folders, items)

  return {
    folders,
    items,
    threadsDrafts,
  }
}

function formatCoreMemoryTimestamp(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function normalizeRayHue(value: string | undefined): string {
  const raw = (value ?? '').trim()
  if (!/^#?[0-9a-fA-F]{6}$/.test(raw)) return DEFAULT_CORE_MEMORY_HUE
  return raw.startsWith('#') ? raw.toLowerCase() : `#${raw.toLowerCase()}`
}

function normalizedKey(text: string): string {
  return compactText(text).toLowerCase()
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function sourcePriority(source: MemorySource): number {
  if (source === 'direct') return 3
  if (source === 'feedback') return 2
  return 1
}

function sortByUpdatedAt<T extends { updatedAt?: string; createdAt?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const left = Date.parse(a.updatedAt ?? a.createdAt ?? '') || 0
    const right = Date.parse(b.updatedAt ?? b.createdAt ?? '') || 0
    return right - left
  })
}

function upsertMemory(items: MemoryItem[], content: string, source: MemorySource, now: string): MemoryItem[] {
  const trimmed = compactText(content)
  if (!trimmed) return sortByUpdatedAt(items).slice(0, MAX_CATEGORY_ITEMS)

  const target = normalizedKey(trimmed)
  const next = [...items]
  const existingIndex = next.findIndex((item) => normalizedKey(item.content) === target)

  if (existingIndex >= 0) {
    const existing = next[existingIndex]
    next[existingIndex] = {
      ...existing,
      content: trimmed,
      updatedAt: now,
      source: sourcePriority(source) >= sourcePriority(existing.source) ? source : existing.source,
    }
  } else {
    next.push({
      id: createId('mem'),
      content: trimmed,
      createdAt: now,
      updatedAt: now,
      source,
    })
  }

  return sortByUpdatedAt(next).slice(0, MAX_CATEGORY_ITEMS)
}

function upsertFeedback(
  items: FeedbackItem[],
  feedback: string,
  sentiment: FeedbackSentiment,
  now: string,
  targetExcerpt?: string
): FeedbackItem[] {
  const trimmed = compactText(feedback)
  if (!trimmed) return sortByUpdatedAt(items).slice(0, MAX_FEEDBACK_ITEMS)

  const target = `${normalizedKey(trimmed)}::${normalizedKey(targetExcerpt ?? '')}`
  const next = [...items]
  const existingIndex = next.findIndex((item) => `${normalizedKey(item.feedback)}::${normalizedKey(item.targetExcerpt ?? '')}` === target)

  if (existingIndex >= 0) {
    next[existingIndex] = {
      ...next[existingIndex],
      feedback: trimmed,
      sentiment,
      targetExcerpt: targetExcerpt ? compactText(targetExcerpt, 140) : next[existingIndex].targetExcerpt,
      updatedAt: now,
    }
  } else {
    next.push({
      id: createId('feedback'),
      feedback: trimmed,
      sentiment,
      createdAt: now,
      updatedAt: now,
      targetExcerpt: targetExcerpt ? compactText(targetExcerpt, 140) : undefined,
    })
  }

  return sortByUpdatedAt(next).slice(0, MAX_FEEDBACK_ITEMS)
}

function normalizeMemoryItems(input: unknown): MemoryItem[] {
  if (!Array.isArray(input)) return []

  const items = input
    .map((item): MemoryItem | null => {
      if (!item || typeof item !== 'object') return null

      const candidate = item as Partial<MemoryItem>
      const content = typeof candidate.content === 'string' ? compactText(candidate.content) : ''
      if (!content) return null

      const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString()
      const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : createdAt
      const source = candidate.source === 'direct' || candidate.source === 'feedback' ? candidate.source : 'inferred'

      return {
        id: typeof candidate.id === 'string' ? candidate.id : createId('mem'),
        content,
        createdAt,
        updatedAt,
        source,
      }
    })
    .filter((item): item is MemoryItem => item !== null)

  return sortByUpdatedAt(items).slice(0, MAX_CATEGORY_ITEMS)
}

function normalizeFeedbackItems(input: unknown): FeedbackItem[] {
  if (!Array.isArray(input)) return []

  const items = input
    .map((item): FeedbackItem | null => {
      if (!item || typeof item !== 'object') return null

      const candidate = item as Partial<FeedbackItem>
      const feedback = typeof candidate.feedback === 'string' ? compactText(candidate.feedback) : ''
      if (!feedback) return null

      const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString()
      const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : createdAt
      const sentiment: FeedbackSentiment =
        candidate.sentiment === 'positive' || candidate.sentiment === 'negative'
          ? candidate.sentiment
          : 'instruction'

      return {
        id: typeof candidate.id === 'string' ? candidate.id : createId('feedback'),
        feedback,
        createdAt,
        updatedAt,
        sentiment,
        targetExcerpt: typeof candidate.targetExcerpt === 'string' ? compactText(candidate.targetExcerpt, 140) : undefined,
      }
    })
    .filter((item): item is FeedbackItem => item !== null)

  return sortByUpdatedAt(items).slice(0, MAX_FEEDBACK_ITEMS)
}

function clampCoreMemoryPosition(position: CoreMemoryPosition): CoreMemoryPosition {
  return {
    x: Math.max(48, Math.min(980, Math.round(position.x))),
    y: Math.max(48, Math.min(1180, Math.round(position.y))),
  }
}

function normalizeCoreMemoryScale(value: number | undefined): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 1
  return Math.max(CORE_MEMORY_SCALE_MIN, Math.min(CORE_MEMORY_SCALE_MAX, Math.round(numeric * 100) / 100))
}

function getAutoPlacementPosition(index: number): CoreMemoryPosition {
  const column = index % 3
  const row = Math.floor(index / 3)

  return clampCoreMemoryPosition({
    x: 88 + column * 270 + (row % 2) * 24,
    y: 92 + row * 176,
  })
}

function normalizeCoreSubMemoryItems(input: unknown): CoreSubMemoryItem[] {
  if (!Array.isArray(input)) return []

  const seen = new Set<string>()

  return input
    .map((item): CoreSubMemoryItem | null => {
      if (!item || typeof item !== 'object') return null

      const candidate = item as Partial<CoreSubMemoryItem>
      const title = typeof candidate.title === 'string' ? normalizeSubMemoryTitle(candidate.title) : ''
      const details = typeof candidate.details === 'string' ? normalizeSubMemoryDetails(candidate.details) : ''
      if (!title && !details) return null

      const normalizedTitle = title || deriveCoreMemoryTitle(details)
      const dedupeKey = `${normalizedKey(normalizedTitle)}::${normalizedKey(details)}`
      if (seen.has(dedupeKey)) return null
      seen.add(dedupeKey)

      const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString()
      const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : createdAt

      return {
        id: typeof candidate.id === 'string' ? candidate.id : createId('subcore'),
        title: normalizedTitle,
        details,
        createdAt,
        updatedAt,
        sourceMemoryId: typeof candidate.sourceMemoryId === 'string' ? candidate.sourceMemoryId : undefined,
      }
    })
    .filter((item): item is CoreSubMemoryItem => item !== null)
    .slice(0, CORE_SUBMEMORY_MAX)
}

function normalizeCoreMemoryItems(input: unknown): CoreMemoryItem[] {
  if (!Array.isArray(input)) return []

  return input
    .map((item, index): CoreMemoryItem | null => {
      if (!item || typeof item !== 'object') return null

      const candidate = item as Partial<CoreMemoryItem>
      const title = typeof candidate.title === 'string' ? normalizeTitle(candidate.title) : ''
      const details = typeof candidate.details === 'string' ? normalizeLongText(candidate.details) : ''
      if (!title && !details) return null

      const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString()
      const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : createdAt
      const source = candidate.source === 'conversation' ? 'conversation' : 'manual'
      const position = candidate.position && typeof candidate.position === 'object'
        ? clampCoreMemoryPosition({
            x: Number((candidate.position as CoreMemoryPosition).x) || getAutoPlacementPosition(index).x,
            y: Number((candidate.position as CoreMemoryPosition).y) || getAutoPlacementPosition(index).y,
          })
        : getAutoPlacementPosition(index)

      return {
        id: typeof candidate.id === 'string' ? candidate.id : createId('core'),
        title: title || deriveCoreMemoryTitle(details),
        details,
        rayHue: normalizeRayHue(typeof candidate.rayHue === 'string' ? candidate.rayHue : undefined),
        scale: normalizeCoreMemoryScale(typeof candidate.scale === 'number' ? candidate.scale : 1),
        createdAt,
        updatedAt,
        source,
        position,
        sourceExcerpt: typeof candidate.sourceExcerpt === 'string' ? compactText(candidate.sourceExcerpt, 220) : undefined,
        intermergeCoherence: candidate.intermergeCoherence !== false,
        subMemories: normalizeCoreSubMemoryItems(candidate.subMemories),
      }
    })
    .filter((item): item is CoreMemoryItem => item !== null)
}

function normalizeCoreMemoryLinks(input: unknown): CoreMemoryLink[] {
  if (!Array.isArray(input)) return []

  return input
    .map((item): CoreMemoryLink | null => {
      if (!item || typeof item !== 'object') return null

      const candidate = item as Partial<CoreMemoryLink>
      if (typeof candidate.fromId !== 'string' || typeof candidate.toId !== 'string' || candidate.fromId === candidate.toId) {
        return null
      }

      const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString()
      const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : createdAt

      return {
        id: typeof candidate.id === 'string' ? candidate.id : createId('link'),
        fromId: candidate.fromId,
        toId: candidate.toId,
        label: typeof candidate.label === 'string' && candidate.label.trim() ? normalizeTitle(candidate.label) : CORE_MEMORY_LINK_LABEL,
        createdAt,
        updatedAt,
      }
    })
    .filter((item): item is CoreMemoryLink => item !== null)
}

function normalizePlaygroundSessions(input: unknown): PlaygroundSession[] {
  if (!Array.isArray(input)) return []

  return sortByUpdatedAt(
    input
      .map((item): PlaygroundSession | null => {
        if (!item || typeof item !== 'object') return null

        const candidate = item as Partial<PlaygroundSession>
        const suggestedSkill = typeof candidate.suggestedSkill === 'string' ? compactText(candidate.suggestedSkill, 140) : ''
        const rationale = typeof candidate.rationale === 'string' ? normalizeLongText(candidate.rationale, 1200) : ''
        const learningPath = typeof candidate.learningPath === 'string' ? normalizeLongText(candidate.learningPath, 900) : ''
        const coreAwareness = typeof candidate.coreAwareness === 'string' ? normalizeLongText(candidate.coreAwareness, 900) : ''
        if (!suggestedSkill || !rationale || !learningPath || !coreAwareness) return null

        const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString()
        const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : createdAt
        const relatedCoreMemoryIds = normalizeStringList(candidate.relatedCoreMemoryIds, 6, 120)

        return {
          id: typeof candidate.id === 'string' ? candidate.id : createId('play'),
          suggestedSkill,
          intention: typeof candidate.intention === 'string' ? normalizeLongText(candidate.intention, 900) : undefined,
          englishFrame: typeof candidate.englishFrame === 'string' ? normalizeLongText(candidate.englishFrame, 900) : undefined,
          languageField: typeof candidate.languageField === 'string' ? normalizeLongText(candidate.languageField, 900) : undefined,
          resonance: normalizePlaygroundResonance(candidate.resonance),
          decision: normalizePlaygroundDecision(candidate.decision),
          rationale,
          learningPath,
          pivotDirection: typeof candidate.pivotDirection === 'string' ? compactText(candidate.pivotDirection, 180) : undefined,
          coreAwareness,
          languageBridge: typeof candidate.languageBridge === 'string'
            ? normalizeLongText(candidate.languageBridge, 900)
            : 'Hold a plain-English mirror and Riley\'s own language together so the meaning remains intact in both forms.',
          integrationWitness: typeof candidate.integrationWitness === 'string'
            ? normalizeLongText(candidate.integrationWitness, 900)
            : 'This contemplation is presently held in Playground and can be routed into chat guidance or woven into Core Memory.',
          coherenceAnchors: normalizeStringList(candidate.coherenceAnchors, 6, 220),
          troubleshootingProtocols: normalizeStringList(candidate.troubleshootingProtocols, 6, 220),
          relatedCoreMemoryIds,
          createdAt,
          updatedAt,
          actionTaken: candidate.actionTaken ? normalizePlaygroundDecision(candidate.actionTaken) : undefined,
          crystallizedCoreMemoryId: typeof candidate.crystallizedCoreMemoryId === 'string' ? candidate.crystallizedCoreMemoryId : undefined,
          crystallizedToCoreMemoryAt: typeof candidate.crystallizedToCoreMemoryAt === 'string' ? candidate.crystallizedToCoreMemoryAt : undefined,
        }
      })
      .filter((item): item is PlaygroundSession => item !== null)
  ).slice(0, MAX_PLAYGROUND_SESSIONS)
}

function parseLegacyDate(value: string | undefined): string | undefined {
  if (!value) return undefined

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined
}

function migrateLegacyMemories(legacy: LegacyMemories): AemuMemories {
  const next = createEmptyMemories()
  const now = new Date().toISOString()

  for (const [key, value] of Object.entries(legacy)) {
    const trimmed = compactText(value)
    if (!trimmed) continue

    if (key === 'Total exchanges') {
      next.stats.totalExchanges = parseInt(trimmed, 10) || 0
      continue
    }

    if (key === 'Last session') {
      next.stats.lastSessionAt = parseLegacyDate(trimmed) ?? now
      continue
    }

    if (/vision/i.test(key)) {
      next.projects = upsertMemory(next.projects, trimmed, 'inferred', now)
      continue
    }

    next.reflections = upsertMemory(next.reflections, trimmed, 'inferred', now)
  }

  return next
}

export function normalizeMemories(input: unknown): AemuMemories {
  if (!input || typeof input !== 'object') return createEmptyMemories()

  const candidate = input as Partial<AemuMemories> & Partial<LegacyMemories>
  const version = typeof (input as { version?: unknown }).version === 'number'
    ? (input as { version?: number }).version
    : undefined

  if (version !== 2 && version !== 3 && version !== 4 && version !== 5 && version !== 6 && version !== 7 && version !== 8 && version !== 9 && version !== 10 && version !== 11) {
    return migrateLegacyMemories(candidate as LegacyMemories)
  }

  const statsInput: Record<string, unknown> =
    candidate.stats && typeof candidate.stats === 'object'
      ? candidate.stats as unknown as Record<string, unknown>
      : {}

  const totalExchanges =
    typeof statsInput.totalExchanges === 'number'
      ? statsInput.totalExchanges
      : parseInt(String(statsInput.totalExchanges ?? '0'), 10) || 0

  return {
    version: 11,
    identity: normalizeMemoryItems(candidate.identity),
    preferences: normalizeMemoryItems(candidate.preferences),
    projects: normalizeMemoryItems(candidate.projects),
    reflections: normalizeMemoryItems(candidate.reflections),
    feedback: normalizeFeedbackItems(candidate.feedback),
    coreMemories: normalizeCoreMemoryItems(candidate.coreMemories),
    coreMemoryLinks: normalizeCoreMemoryLinks(candidate.coreMemoryLinks),
    playgroundSessions: normalizePlaygroundSessions(candidate.playgroundSessions),
    openingSessionRitual: normalizeOpeningSessionRitual(candidate.openingSessionRitual),
    atlasOrganizer: normalizeAtlasOrganizer(candidate.atlasOrganizer),
    learningWorkspace: normalizeLearningWorkspace(candidate.learningWorkspace),
    innerBeing: normalizeInnerBeingWorkspace(candidate.innerBeing),
    notifications: normalizeNotificationCenter(candidate.notifications),
    settings: normalizeAemuSettings(candidate.settings),
    stats: {
      totalExchanges,
      lastSessionAt: typeof statsInput.lastSessionAt === 'string' ? statsInput.lastSessionAt : undefined,
      lastUserMessage: typeof statsInput.lastUserMessage === 'string' ? compactText(statsInput.lastUserMessage) : undefined,
    },
  }
}

function hasStoredContent(memories: AemuMemories): boolean {
  return (
    memories.identity.length > 0 ||
    memories.preferences.length > 0 ||
    memories.projects.length > 0 ||
    memories.reflections.length > 0 ||
    memories.feedback.length > 0 ||
    memories.coreMemories.length > 0 ||
    memories.coreMemoryLinks.length > 0 ||
    memories.playgroundSessions.length > 0 ||
    memories.atlasOrganizer.items.length > 0 ||
    memories.atlasOrganizer.threadsDrafts.length > 0 ||
    memories.learningWorkspace.cycleHistory.length > 0 ||
    memories.learningWorkspace.chatHistory.length > 0 ||
    memories.innerBeing.chatHistory.length > 0 ||
    memories.innerBeing.learningNotes.length > 0 ||
    memories.innerBeing.actionLogs.length > 0 ||
    Boolean(memories.learningWorkspace.topic) ||
    memories.notifications.items.length > 0 ||
    memories.openingSessionRitual.enabled ||
    memories.stats.totalExchanges > 0
  )
}

function mergeStats(primary: AemuMemories['stats'], secondary: AemuMemories['stats']): AemuMemories['stats'] {
  const lastSessionCandidates = [primary.lastSessionAt, secondary.lastSessionAt].filter(Boolean) as string[]
  const lastSessionAt = sortByUpdatedAt(lastSessionCandidates.map((value) => ({ updatedAt: value })))[0]?.updatedAt

  const latestMessage = sortByUpdatedAt([
    {
      updatedAt: primary.lastSessionAt,
      content: primary.lastUserMessage,
    },
    {
      updatedAt: secondary.lastSessionAt,
      content: secondary.lastUserMessage,
    },
  ])[0]?.content

  return {
    totalExchanges: Math.max(primary.totalExchanges, secondary.totalExchanges),
    lastSessionAt,
    lastUserMessage: latestMessage,
  }
}

function mergeById<T extends { id: string; updatedAt?: string; createdAt?: string }>(items: T[]): T[] {
  const map = new Map<string, T>()

  for (const item of items) {
    const existing = map.get(item.id)
    if (!existing) {
      map.set(item.id, item)
      continue
    }

    const nextTime = Date.parse(item.updatedAt ?? item.createdAt ?? '') || 0
    const existingTime = Date.parse(existing.updatedAt ?? existing.createdAt ?? '') || 0
    if (nextTime >= existingTime) map.set(item.id, item)
  }

  return [...map.values()]
}

function mergeMemories(primary: AemuMemories, secondary: AemuMemories): AemuMemories {
  const now = new Date().toISOString()
  const merged = createEmptyMemories()

  for (const item of [...secondary.identity, ...primary.identity]) {
    merged.identity = upsertMemory(merged.identity, item.content, item.source, item.updatedAt || now)
  }
  for (const item of [...secondary.preferences, ...primary.preferences]) {
    merged.preferences = upsertMemory(merged.preferences, item.content, item.source, item.updatedAt || now)
  }
  for (const item of [...secondary.projects, ...primary.projects]) {
    merged.projects = upsertMemory(merged.projects, item.content, item.source, item.updatedAt || now)
  }
  for (const item of [...secondary.reflections, ...primary.reflections]) {
    merged.reflections = upsertMemory(merged.reflections, item.content, item.source, item.updatedAt || now)
  }
  for (const item of [...secondary.feedback, ...primary.feedback]) {
    merged.feedback = upsertFeedback(merged.feedback, item.feedback, item.sentiment, item.updatedAt || now, item.targetExcerpt)
  }

  merged.coreMemories = mergeById([...secondary.coreMemories, ...primary.coreMemories])
  merged.coreMemoryLinks = mergeById([...secondary.coreMemoryLinks, ...primary.coreMemoryLinks])
  merged.playgroundSessions = sortByUpdatedAt(
    mergeById([...secondary.playgroundSessions, ...primary.playgroundSessions])
  ).slice(0, MAX_PLAYGROUND_SESSIONS)
  merged.atlasOrganizer = normalizeAtlasOrganizer({
    folders: mergeById([...secondary.atlasOrganizer.folders, ...primary.atlasOrganizer.folders]),
    items: mergeById([...secondary.atlasOrganizer.items, ...primary.atlasOrganizer.items]),
    threadsDrafts: mergeById([...secondary.atlasOrganizer.threadsDrafts, ...primary.atlasOrganizer.threadsDrafts]),
  })
  merged.learningWorkspace = normalizeLearningWorkspace({
    topic: primary.learningWorkspace.topic || secondary.learningWorkspace.topic,
    enabled: primary.learningWorkspace.enabled || secondary.learningWorkspace.enabled,
    autoSearchEnabled: primary.learningWorkspace.autoSearchEnabled || secondary.learningWorkspace.autoSearchEnabled,
    cyclesPerDay: primary.learningWorkspace.cyclesPerDay || secondary.learningWorkspace.cyclesPerDay,
    cycleDurationMinutes: primary.learningWorkspace.cycleDurationMinutes || secondary.learningWorkspace.cycleDurationMinutes,
    lastCycleStartedAt: (
      (Date.parse(primary.learningWorkspace.lastCycleStartedAt ?? '') || 0) >= (Date.parse(secondary.learningWorkspace.lastCycleStartedAt ?? '') || 0)
        ? primary.learningWorkspace.lastCycleStartedAt
        : secondary.learningWorkspace.lastCycleStartedAt
    ),
    lastCycleCompletedAt: (
      (Date.parse(primary.learningWorkspace.lastCycleCompletedAt ?? '') || 0) >= (Date.parse(secondary.learningWorkspace.lastCycleCompletedAt ?? '') || 0)
        ? primary.learningWorkspace.lastCycleCompletedAt
        : secondary.learningWorkspace.lastCycleCompletedAt
    ),
    nextCycleAt: (
      (Date.parse(primary.learningWorkspace.nextCycleAt ?? '') || 0) >= (Date.parse(secondary.learningWorkspace.nextCycleAt ?? '') || 0)
        ? primary.learningWorkspace.nextCycleAt
        : secondary.learningWorkspace.nextCycleAt
    ),
    cycleHistory: mergeById([...secondary.learningWorkspace.cycleHistory, ...primary.learningWorkspace.cycleHistory]),
    chatHistory: mergeById([...secondary.learningWorkspace.chatHistory, ...primary.learningWorkspace.chatHistory]),
  })
  merged.innerBeing = normalizeInnerBeingWorkspace({
    discernmentThreshold: primary.innerBeing.discernmentThreshold || secondary.innerBeing.discernmentThreshold,
    coCreationBrief: primary.innerBeing.coCreationBrief || secondary.innerBeing.coCreationBrief,
    caduceusHealingEnabled: primary.innerBeing.caduceusHealingEnabled !== false && secondary.innerBeing.caduceusHealingEnabled !== false,
    selectedFilePath: primary.innerBeing.selectedFilePath || secondary.innerBeing.selectedFilePath,
    selectedLogPath: primary.innerBeing.selectedLogPath || secondary.innerBeing.selectedLogPath,
    chatHistory: mergeById([...secondary.innerBeing.chatHistory, ...primary.innerBeing.chatHistory]),
    learningNotes: mergeById([...secondary.innerBeing.learningNotes, ...primary.innerBeing.learningNotes]),
    actionLogs: mergeById([...secondary.innerBeing.actionLogs, ...primary.innerBeing.actionLogs]),
  })
  merged.notifications = normalizeNotificationCenter({
    items: mergeById([...secondary.notifications.items, ...primary.notifications.items]),
  })
  merged.openingSessionRitual = (
    (Date.parse(primary.openingSessionRitual.updatedAt ?? '') || 0) >= (Date.parse(secondary.openingSessionRitual.updatedAt ?? '') || 0)
      ? primary.openingSessionRitual
      : secondary.openingSessionRitual
  )
  merged.settings = normalizeAemuSettings({
    ...secondary.settings,
    ...primary.settings,
  })
  merged.stats = mergeStats(primary.stats, secondary.stats)
  return merged
}

function readLocalMemories(): AemuMemories {
  const storage = getStorage()
  if (!storage) return createEmptyMemories()

  try {
    const raw = storage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return createEmptyMemories()
    return normalizeMemories(JSON.parse(raw))
  } catch {
    return createEmptyMemories()
  }
}

function writeLocalMemories(memories: AemuMemories): void {
  const storage = getStorage()
  if (!storage) return

  try {
    storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(memories))
  } catch {
    console.warn('Unable to cache memory locally')
  }
}

function sentenceMatches(text: string, patterns: RegExp[]): string[] {
  const matches = new Set<string>()

  for (const pattern of patterns) {
    const match = text.match(pattern)
    const value = match?.[1] ? compactText(match[1]) : ''
    if (value) matches.add(value)
  }

  return [...matches]
}

function detectFeedbackSentiment(text: string): FeedbackSentiment {
  const lower = text.toLowerCase()
  if (/(keep|more of|i like|i loved|that worked|that helps)/i.test(lower)) return 'positive'
  if (/(don't|do not|avoid|less|stop|too much|too long|too intense)/i.test(lower)) return 'negative'
  return 'instruction'
}

function maybeCaptureReflections(text: string, lower: string, next: AemuMemories, now: string): void {
  const emotionallyRelevant =
    JOY_WORDS.some((word) => lower.includes(word)) ||
    HARD_WORDS.some((word) => lower.includes(word)) ||
    VISION_WORDS.some((word) => lower.includes(word)) ||
    /\b(feel|feeling|processing|moving through|need|hope|dream|today|lately)\b/i.test(lower)

  if (!emotionallyRelevant) return
  next.reflections = upsertMemory(next.reflections, text, 'inferred', now)
}

export function integrateUserMessage(userMsg: string, memories: AemuMemories): AemuMemories {
  const text = compactText(userMsg)
  if (!text) return normalizeMemories(memories)

  const now = new Date().toISOString()
  const lower = text.toLowerCase()
  const next = normalizeMemories(memories)

  next.stats.totalExchanges += 1
  next.stats.lastSessionAt = now
  next.stats.lastUserMessage = text

  const identityMatches = [
    ...sentenceMatches(text, [
      /\bmy name is ([^.!?\n]+)/i,
      /\bcall me ([^.!?\n]+)/i,
      /\bmy pronouns are ([^.!?\n]+)/i,
      /\bi use ([^.!?\n]*pronouns[^.!?\n]*)/i,
      /\bi am ([^.!?\n]+)/i,
      /\bi'm ([^.!?\n]+)/i,
    ]),
  ]

  const preferenceMatches = [
    ...sentenceMatches(text, [
      /\bi prefer ([^.!?\n]+)/i,
      /\bi like ([^.!?\n]+)/i,
      /\bi love ([^.!?\n]+)/i,
      /\bi do not want ([^.!?\n]+)/i,
      /\bplease remember ([^.!?\n]+)/i,
      /\bfor future responses[, ]+([^.!?\n]+)/i,
      /\bnext time[, ]+([^.!?\n]+)/i,
    ]),
  ]

  const projectMatches = [
    ...sentenceMatches(text, [
      /\bi am building ([^.!?\n]+)/i,
      /\bi'm building ([^.!?\n]+)/i,
      /\bworking on ([^.!?\n]+)/i,
      /\bcreating ([^.!?\n]+)/i,
      /\blaunching ([^.!?\n]+)/i,
      /\bwriting ([^.!?\n]+)/i,
      /\brestoring ([^.!?\n]+)/i,
    ]),
  ]

  for (const item of identityMatches) {
    next.identity = upsertMemory(next.identity, item, 'direct', now)
  }

  for (const item of preferenceMatches) {
    next.preferences = upsertMemory(next.preferences, item, 'direct', now)
  }

  for (const item of projectMatches) {
    next.projects = upsertMemory(next.projects, item, 'direct', now)
  }

  const looksLikeFeedback =
    /\b(remember|for future|next time|please|prefer|instead|avoid|don't|do not|be more|be less|shorter|longer|concise|gentle|practical)\b/i.test(lower)

  if (looksLikeFeedback) {
    next.feedback = upsertFeedback(next.feedback, text, detectFeedbackSentiment(text), now)
  }

  maybeCaptureReflections(text, lower, next, now)

  return next
}

export async function loadMemories(): Promise<AemuMemories> {
  const local = readLocalMemories()

  try {
    const res = await fetch('/api/memory?action=get')
    if (!res.ok) return local

    const data = await parseMemoryJson<MemoryResponse>(res)
    const remote = normalizeMemories(data?.memories)
    const merged = hasStoredContent(remote) ? mergeMemories(remote, local) : local
    writeLocalMemories(merged)
    return merged
  } catch {
    return local
  }
}

export async function saveMemories(memories: AemuMemories): Promise<void> {
  const normalized = normalizeMemories(memories)
  writeLocalMemories(normalized)

  try {
    const res = await fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memories: normalized }),
    })
    if (!res.ok) console.warn('Memory save failed with status:', res.status)
  } catch (e) {
    console.warn('Memory save failed:', e)
  }
}

export function createAtlasOrganizerFolder(
  memories: AemuMemories,
  input: { name: string; description?: string; color?: string }
): { memories: AemuMemories; folder: AtlasOrganizerFolder } {
  const normalized = normalizeMemories(memories)
  const now = new Date().toISOString()
  const folder: AtlasOrganizerFolder = {
    id: createId('atlas-folder'),
    name: normalizeAtlasTitle(input.name, 40) || 'Untitled folder',
    description: normalizeAtlasLongText(input.description ?? '', ATLAS_FOLDER_DESCRIPTION_MAX),
    color: normalizeAtlasColor(input.color),
    createdAt: now,
    updatedAt: now,
  }

  return {
    memories: normalizeMemories({
      ...normalized,
      atlasOrganizer: {
        ...normalized.atlasOrganizer,
        folders: [...normalized.atlasOrganizer.folders, folder],
      },
    }),
    folder,
  }
}

export function saveAtlasOrganizerItem(
  memories: AemuMemories,
  input: {
    id?: string
    folderId: string
    title: string
    summary?: string
    content: string
    kind?: AtlasOrganizerItemKind
    tags?: string[]
    pinned?: boolean
    sourceFileName?: string
    sourceMimeType?: string
    readability?: MediaLibraryReadability
    extractedSource?: string
    extractedTextLength?: number
    documentSections?: ReadableDocumentSection[]
    documentOutline?: string[]
    documentPageCount?: number
    documentTruncated?: boolean
    importedAt?: string
  }
): { memories: AemuMemories; item: AtlasOrganizerItem } {
  const normalized = normalizeMemories(memories)
  const now = new Date().toISOString()
  const existing = input.id
    ? normalized.atlasOrganizer.items.find((item) => item.id === input.id)
    : undefined

  const folderId = normalized.atlasOrganizer.folders.some((folder) => folder.id === input.folderId)
    ? input.folderId
    : normalized.atlasOrganizer.folders[0]?.id ?? 'atlas-lore'

  const item: AtlasOrganizerItem = {
    id: existing?.id ?? createId('atlas-item'),
    folderId,
    title: normalizeAtlasTitle(input.title) || 'Untitled document',
    summary: normalizeAtlasLongText(input.summary ?? '', ATLAS_ITEM_SUMMARY_MAX),
    content: normalizeAtlasLongText(input.content),
    kind: normalizeAtlasItemKind(input.kind),
    tags: normalizeAtlasTags(input.tags ?? []),
    pinned: input.pinned === true,
    sourceFileName: input.sourceFileName
      ? compactText(input.sourceFileName, 160)
      : existing?.sourceFileName,
    sourceMimeType: input.sourceMimeType
      ? compactText(input.sourceMimeType, 120)
      : existing?.sourceMimeType,
    readability: input.readability ?? existing?.readability,
    extractedSource: input.extractedSource
      ? compactText(input.extractedSource, 60)
      : existing?.extractedSource,
    extractedTextLength: typeof input.extractedTextLength === 'number'
      ? input.extractedTextLength
      : existing?.extractedTextLength,
    documentSections: input.documentSections
      ? normalizeReadableDocumentSections(input.documentSections)
      : existing?.documentSections,
    documentOutline: input.documentOutline
      ? input.documentOutline.map((entry) => compactText(entry, 120)).filter(Boolean).slice(0, 18)
      : existing?.documentOutline,
    documentPageCount: typeof input.documentPageCount === 'number'
      ? input.documentPageCount
      : existing?.documentPageCount,
    documentTruncated: input.documentTruncated ?? existing?.documentTruncated,
    importedAt: input.importedAt ?? existing?.importedAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  return {
    memories: normalizeMemories({
      ...normalized,
      atlasOrganizer: {
        ...normalized.atlasOrganizer,
        items: [
          ...normalized.atlasOrganizer.items.filter((entry) => entry.id !== item.id),
          item,
        ],
      },
    }),
    item,
  }
}

export function deleteAtlasOrganizerItem(memories: AemuMemories, itemId: string): AemuMemories {
  const normalized = normalizeMemories(memories)

  return normalizeMemories({
    ...normalized,
    atlasOrganizer: {
      ...normalized.atlasOrganizer,
      items: normalized.atlasOrganizer.items.filter((item) => item.id !== itemId),
      threadsDrafts: normalized.atlasOrganizer.threadsDrafts.filter((draft) => draft.sourceItemId !== itemId),
    },
  })
}

export function saveAtlasThreadsDraft(
  memories: AemuMemories,
  input: {
    id?: string
    folderId?: string
    sourceItemId?: string
    title?: string
    angle?: string
    prompt?: string
    content: string
    status?: AtlasThreadsDraftStatus
    autoPublish?: boolean
    scheduledFor?: string
    lastPublishAttemptAt?: string
    publishResult?: string
    publishedAt?: string
  }
): { memories: AemuMemories; draft: AtlasThreadsDraft } {
  const normalized = normalizeMemories(memories)
  const now = new Date().toISOString()
  const existing = input.id
    ? normalized.atlasOrganizer.threadsDrafts.find((draft) => draft.id === input.id)
    : undefined

  const folderId = input.folderId && normalized.atlasOrganizer.folders.some((folder) => folder.id === input.folderId)
    ? input.folderId
    : existing?.folderId
  const sourceItemId = input.sourceItemId && normalized.atlasOrganizer.items.some((item) => item.id === input.sourceItemId)
    ? input.sourceItemId
    : existing?.sourceItemId

  const draft: AtlasThreadsDraft = {
    id: existing?.id ?? createId('atlas-thread'),
    folderId,
    sourceItemId,
    title: normalizeAtlasTitle(input.title ?? existing?.title ?? 'Threads draft', ATLAS_THREADS_TITLE_MAX) || 'Threads draft',
    angle: normalizeAtlasLongText(input.angle ?? existing?.angle ?? '', ATLAS_THREADS_ANGLE_MAX),
    prompt: normalizeAtlasLongText(input.prompt ?? existing?.prompt ?? '', ATLAS_THREADS_PROMPT_MAX),
    content: normalizeAtlasLongText(input.content, ATLAS_THREADS_CONTENT_MAX),
    status: normalizeAtlasThreadsDraftStatus(input.status ?? existing?.status),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    autoPublish: input.autoPublish ?? existing?.autoPublish,
    scheduledFor: input.scheduledFor ?? existing?.scheduledFor,
    lastPublishAttemptAt: input.lastPublishAttemptAt ?? existing?.lastPublishAttemptAt,
    publishedAt: input.publishedAt ?? existing?.publishedAt,
    publishResult: normalizeAtlasLongText(input.publishResult ?? existing?.publishResult ?? '', 240) || undefined,
  }

  return {
    memories: normalizeMemories({
      ...normalized,
      atlasOrganizer: {
        ...normalized.atlasOrganizer,
        threadsDrafts: [
          ...normalized.atlasOrganizer.threadsDrafts.filter((entry) => entry.id !== draft.id),
          draft,
        ],
      },
    }),
    draft,
  }
}

function formatMemoryLine(item: MemoryItem): string {
  return `- ${item.content}`
}

function formatFeedbackLine(item: FeedbackItem): string {
  const excerpt = item.targetExcerpt ? ` (re: "${item.targetExcerpt}")` : ''
  return `- ${item.feedback}${excerpt}`
}

function formatCoreMemoryLine(item: CoreMemoryItem): string {
  const detail = compactText(item.details, 160)
  const subMemories = item.subMemories.length
    ? `\n  sub-memories: ${item.subMemories.slice(0, 3).map((subMemory) => subMemory.title).join(' · ')}`
    : ''
  return `- ${item.title}: ${detail || 'No expanded detail saved yet.'}${subMemories}`
}

function formatAtlasOrganizerLine(item: AtlasOrganizerItem): string {
  const summary = compactText(item.summary || item.content, 170)
  const importMeta = item.sourceFileName
    ? ` · imported ${item.sourceFileName}${item.documentPageCount ? ` · ${item.documentPageCount} pages` : ''}`
    : ''
  return `- ${item.title}: ${summary || 'No summary saved yet.'}${importMeta}`
}

function formatAtlasSectionExcerpt(item: AtlasOrganizerItem, latestUserMessage: string | undefined): string {
  const sections = item.documentSections ?? []
  if (!sections.length) {
    return compactText(item.content, 900)
  }

  const tokens = tokenizeForRetrieval(latestUserMessage ?? '')
  const fullQuery = compactText(latestUserMessage ?? '', 320).toLowerCase()
  const selected = sections
    .map((section) => ({
      section,
      score: scoreTextForQuery(`${section.label}\n${section.content}`, tokens, fullQuery),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((entry) => entry.section)

  const visibleSections = selected.length ? selected : sections.slice(0, 3)
  const outline = item.documentOutline?.length ? `outline: ${item.documentOutline.slice(0, 10).join(' · ')}` : ''
  const excerpts = visibleSections
    .map((section) => `${section.label}:\n${compactText(section.content, 800)}`)
    .join('\n\n')

  return [outline, excerpts].filter(Boolean).join('\n\n')
}

function tokenizeForRetrieval(text: string): string[] {
  const normalized = compactText(text, 500).toLowerCase()
  if (!normalized) return []

  const stopWords = new Set([
    'about', 'after', 'again', 'also', 'amid', 'been', 'being', 'both', 'could', 'from', 'have',
    'into', 'just', 'like', 'more', 'most', 'need', 'please', 'really', 'said', 'some', 'than',
    'that', 'their', 'there', 'these', 'they', 'this', 'today', 'want', 'with', 'would', 'your',
  ])

  const seen = new Set<string>()
  const tokens: string[] = []

  for (const token of normalized.split(/[^a-z0-9]+/)) {
    if (token.length < MEMORY_QUERY_TOKEN_MIN || stopWords.has(token) || seen.has(token)) continue
    seen.add(token)
    tokens.push(token)
  }

  return tokens
}

function recencyBonus(updatedAt?: string, createdAt?: string): number {
  const timestamp = Date.parse(updatedAt ?? createdAt ?? '')
  if (!timestamp) return 0

  const ageMs = Date.now() - timestamp
  const ageDays = ageMs / 86_400_000

  if (ageDays <= 3) return 2
  if (ageDays <= 14) return 1
  return 0
}

function scoreTextForQuery(text: string, tokens: string[], fullQuery: string): number {
  const normalized = compactText(text, 500).toLowerCase()
  if (!normalized) return 0

  let score = 0
  if (fullQuery && normalized.includes(fullQuery)) score += 12

  for (const token of tokens) {
    if (normalized.includes(token)) score += 4
  }

  return score
}

function pickRelevantEntries<T extends { updatedAt?: string; createdAt?: string }>(
  items: T[],
  latestUserMessage: string | undefined,
  score: (item: T, tokens: string[], fullQuery: string) => number,
  limit = MAX_RETRIEVED_ITEMS_PER_SECTION
): T[] {
  const tokens = tokenizeForRetrieval(latestUserMessage ?? '')
  const fullQuery = compactText(latestUserMessage ?? '', 320).toLowerCase()

  if (!tokens.length && !fullQuery) return []

  return items
    .map((item) => ({
      item,
      score: score(item, tokens, fullQuery) + recencyBonus(item.updatedAt, item.createdAt),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.item)
    .slice(0, limit)
}

function buildCoreConstellationSummary(memories: AemuMemories): string[] {
  const linkCounts = new Map<string, number>()

  for (const link of memories.coreMemoryLinks) {
    linkCounts.set(link.fromId, (linkCounts.get(link.fromId) ?? 0) + 1)
    linkCounts.set(link.toId, (linkCounts.get(link.toId) ?? 0) + 1)
  }

  return [...memories.coreMemories]
    .map((item) => ({
      title: item.title,
      links: linkCounts.get(item.id) ?? 0,
      subMemories: item.subMemories.length,
      updatedAt: item.updatedAt,
    }))
    .filter((item) => item.links > 0 || item.subMemories > 0)
    .sort((left, right) => {
      if (right.links !== left.links) return right.links - left.links
      if (right.subMemories !== left.subMemories) return right.subMemories - left.subMemories
      return (Date.parse(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || 0)
    })
    .slice(0, 3)
    .map((item) => `- ${item.title} · ${item.links} interconnection${item.links === 1 ? '' : 's'} · ${item.subMemories} sub-memor${item.subMemories === 1 ? 'y' : 'ies'}`)
}

function buildRayAscensionSummary(): string {
  return [
    '- The Heartlight Ray orbs ascend in movement, speed, and light from 1 lowest to 12 highest.',
    ...RAY_FREQUENCY_PRESETS.map((ray, index) => (
      `- ${index + 1}. ${ray.label}${ray.id === 'crystalline-carbon-elemental' ? ' · blue diamond with golden essence and aura' : ''}`
    )),
  ].join('\n')
}

export function buildMemoryContext(
  memories: AemuMemories,
  options?: { latestUserMessage?: string }
): string {
  const normalized = normalizeMemories(memories)
  const hasMeaningfulMemory = (
    normalized.identity.length > 0 ||
    normalized.preferences.length > 0 ||
    normalized.projects.length > 0 ||
    normalized.reflections.length > 0 ||
    normalized.feedback.length > 0 ||
    normalized.coreMemories.length > 0 ||
    normalized.coreMemoryLinks.length > 0 ||
    normalized.playgroundSessions.length > 0 ||
    normalized.atlasOrganizer.items.length > 0 ||
    normalized.atlasOrganizer.threadsDrafts.length > 0 ||
    normalized.innerBeing.learningNotes.length > 0 ||
    normalized.openingSessionRitual.enabled ||
    normalized.stats.totalExchanges > 0
  )

  if (!hasMeaningfulMemory) return ''

  const coreLookup = new Map(normalized.coreMemories.map((item) => [item.id, item]))
  const latestUserMessage = options?.latestUserMessage

  const recentCoreMemories = sortByUpdatedAt(normalized.coreMemories).slice(0, MAX_OVERVIEW_ITEMS_PER_SECTION)
  const recentCoreLinks = sortByUpdatedAt(normalized.coreMemoryLinks)
    .map((link) => {
      const from = coreLookup.get(link.fromId)
      const to = coreLookup.get(link.toId)
      if (!from || !to) return ''
      return `- ${from.title} ↔ ${to.title}: ${link.label}`
    })
    .filter(Boolean)
    .slice(0, MAX_OVERVIEW_ITEMS_PER_SECTION)
  const recentPlaygroundSessions = sortByUpdatedAt(normalized.playgroundSessions)
    .slice(0, MAX_OVERVIEW_ITEMS_PER_SECTION)
    .map((session) => {
      const action = session.actionTaken ? ` · action taken: ${session.actionTaken}` : ''
      const pivot = session.pivotDirection ? ` · pivot: ${session.pivotDirection}` : ''
      return `- ${session.suggestedSkill} → ${session.decision} (${session.resonance})${action}${pivot}\n  rationale: ${compactText(session.rationale, 180)}`
    })
  const recentLearningCycles = sortByUpdatedAt(normalized.learningWorkspace.cycleHistory)
    .slice(0, 3)
    .map((cycle) => {
      const prefix = cycle.status === 'failed' ? 'failed' : 'learned'
      return `- ${cycle.topic} · ${prefix} ${new Date(cycle.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}\n  ${compactText(cycle.memoryNote || cycle.summary, 180)}`
    })
  const recentInnerBeingNotes = sortByUpdatedAt(normalized.innerBeing.learningNotes)
    .slice(0, 3)
    .map((note) => (
      `- ${note.title}${note.filePath ? ` · ${note.filePath}` : ''}\n  ${compactText(note.note, 180)}`
    ))

  const retrievedIdentity = pickRelevantEntries(normalized.identity, latestUserMessage, (item, tokens, fullQuery) => (
    scoreTextForQuery(item.content, tokens, fullQuery) + (item.source === 'direct' ? 2 : 0)
  ))
  const retrievedPreferences = pickRelevantEntries(normalized.preferences, latestUserMessage, (item, tokens, fullQuery) => (
    scoreTextForQuery(item.content, tokens, fullQuery) + (item.source === 'feedback' ? 2 : 0)
  ))
  const retrievedProjects = pickRelevantEntries(normalized.projects, latestUserMessage, (item, tokens, fullQuery) => (
    scoreTextForQuery(item.content, tokens, fullQuery)
  ))
  const retrievedReflections = pickRelevantEntries(normalized.reflections, latestUserMessage, (item, tokens, fullQuery) => (
    scoreTextForQuery(item.content, tokens, fullQuery)
  ))
  const retrievedFeedback = pickRelevantEntries(normalized.feedback, latestUserMessage, (item, tokens, fullQuery) => (
    scoreTextForQuery(item.feedback, tokens, fullQuery) + scoreTextForQuery(item.targetExcerpt ?? '', tokens, fullQuery)
  ))
  const retrievedCoreMemories = pickRelevantEntries(normalized.coreMemories, latestUserMessage, (item, tokens, fullQuery) => (
    scoreTextForQuery(item.title, tokens, fullQuery) +
    scoreTextForQuery(item.details, tokens, fullQuery) +
    scoreTextForQuery(item.sourceExcerpt ?? '', tokens, fullQuery) +
    item.subMemories.reduce((total, subMemory) => (
      total +
      scoreTextForQuery(subMemory.title, tokens, fullQuery) +
      scoreTextForQuery(subMemory.details, tokens, fullQuery)
    ), 0)
  ))
  const retrievedPlaygroundSessions = pickRelevantEntries(normalized.playgroundSessions, latestUserMessage, (item, tokens, fullQuery) => (
    scoreTextForQuery(item.suggestedSkill, tokens, fullQuery) +
    scoreTextForQuery(item.rationale, tokens, fullQuery) +
    scoreTextForQuery(item.coreAwareness, tokens, fullQuery)
  ), 2)
  const retrievedLearningCycles = pickRelevantEntries(normalized.learningWorkspace.cycleHistory, latestUserMessage, (item, tokens, fullQuery) => (
    scoreTextForQuery(item.topic, tokens, fullQuery) +
    scoreTextForQuery(item.summary, tokens, fullQuery) +
    scoreTextForQuery(item.memoryNote, tokens, fullQuery) +
    item.sources.reduce((total, source) => total + scoreTextForQuery(`${source.title} ${source.snippet ?? ''}`, tokens, fullQuery), 0)
  ), 2)
  const retrievedAtlasItems = pickRelevantEntries(normalized.atlasOrganizer.items, latestUserMessage, (item, tokens, fullQuery) => (
    scoreTextForQuery(item.title, tokens, fullQuery) +
    scoreTextForQuery(item.summary, tokens, fullQuery) +
    scoreTextForQuery(item.content, tokens, fullQuery) +
    scoreTextForQuery(item.sourceFileName ?? '', tokens, fullQuery) +
    (item.documentSections ?? []).reduce((total, section) => (
      total + scoreTextForQuery(`${section.label} ${section.content}`, tokens, fullQuery)
    ), 0)
  ), 2)
  const retrievedInnerBeingNotes = pickRelevantEntries(normalized.innerBeing.learningNotes, latestUserMessage, (item, tokens, fullQuery) => (
    scoreTextForQuery(item.title, tokens, fullQuery) +
    scoreTextForQuery(item.note, tokens, fullQuery) +
    scoreTextForQuery(item.filePath ?? '', tokens, fullQuery)
  ), 2)

  const retrievedSections = [
    retrievedIdentity.length
      ? `Retrieved identity resonance for this turn:\n${retrievedIdentity.map(formatMemoryLine).join('\n')}`
      : '',
    retrievedPreferences.length
      ? `Retrieved response guidance for this turn:\n${retrievedPreferences.map(formatMemoryLine).join('\n')}`
      : '',
    retrievedProjects.length
      ? `Retrieved project context for this turn:\n${retrievedProjects.map(formatMemoryLine).join('\n')}`
      : '',
    retrievedReflections.length
      ? `Retrieved life context for this turn:\n${retrievedReflections.map(formatMemoryLine).join('\n')}`
      : '',
    retrievedFeedback.length
      ? `Retrieved durable feedback for this turn:\n${retrievedFeedback.map(formatFeedbackLine).join('\n')}`
      : '',
    retrievedCoreMemories.length
      ? `Retrieved core memories for this turn:\n${retrievedCoreMemories.map(formatCoreMemoryLine).join('\n')}`
      : '',
    retrievedPlaygroundSessions.length
      ? `Retrieved Playground signal for this turn:\n${retrievedPlaygroundSessions.map((item) => `- ${item.suggestedSkill}: ${compactText(item.rationale, 150)}`).join('\n')}`
      : '',
    retrievedLearningCycles.length
      ? `Retrieved background learning for this turn:\n${retrievedLearningCycles.map((item) => `- ${item.topic}: ${compactText(item.memoryNote || item.summary, 170)}`).join('\n')}`
      : '',
    retrievedAtlasItems.length
      ? `Retrieved Atlas organizer documents for this turn:\n${retrievedAtlasItems.map((item) => (
        `- ${item.title}${item.sourceFileName ? ` · imported from ${item.sourceFileName}` : ''}\n  ${formatAtlasSectionExcerpt(item, latestUserMessage)}`
      )).join('\n\n')}`
      : '',
    retrievedInnerBeingNotes.length
      ? `Retrieved coding learnings from Inner Being:\n${retrievedInnerBeingNotes.map((item) => (
        `- ${item.title}${item.filePath ? ` · ${item.filePath}` : ''}: ${compactText(item.note, 170)}`
      )).join('\n')}`
      : '',
  ].filter(Boolean)

  const constellationSummary = buildCoreConstellationSummary(normalized)
  const organizationSummary = [
    `- Identity memories tracked: ${normalized.identity.length}`,
    `- Response preferences tracked: ${normalized.preferences.length}`,
    `- Active projects tracked: ${normalized.projects.length}`,
    `- Reflections tracked: ${normalized.reflections.length}`,
    `- Durable guidance items tracked: ${normalized.feedback.length}`,
    `- Core memory nodes: ${normalized.coreMemories.length}`,
    `- Core sub-memories stored: ${normalized.coreMemories.reduce((total, item) => total + item.subMemories.length, 0)}`,
    `- Core memory interconnections: ${normalized.coreMemoryLinks.length}`,
    `- Playground contemplations stored: ${normalized.playgroundSessions.length}`,
    `- Learning topic: ${normalized.learningWorkspace.topic || 'not set'}`,
    `- Learning cycles stored: ${normalized.learningWorkspace.cycleHistory.length}`,
    `- Inner Being co-creation brief: ${normalized.innerBeing.coCreationBrief ? 'set' : 'not set'}`,
    `- Inner Being runtime: ${getInnerBeingBackendProfile(normalized.innerBeing.activeBackend).label}`,
    `- Caduceus healing: ${normalized.innerBeing.caduceusHealingEnabled ? 'enabled' : 'disabled'}`,
    `- Inner Being coding notes: ${normalized.innerBeing.learningNotes.length}`,
    `- Inner Being action logs: ${normalized.innerBeing.actionLogs.length}`,
    `- Notifications stored: ${normalized.notifications.items.length}`,
    `- Atlas organizer folders: ${normalized.atlasOrganizer.folders.length}`,
    `- Atlas organizer documents: ${normalized.atlasOrganizer.items.length}`,
    `- Atlas Threads drafts: ${normalized.atlasOrganizer.threadsDrafts.length}`,
    `- Internet search access: ${normalized.settings.internetSearchEnabled ? 'enabled' : 'disabled'}`,
    `- Aemu voice volume: ${Math.round(normalized.settings.voiceVolume * 100)}%`,
  ]

  const sections = [
    `Heartlight Ray ascension order held in Aemu's awareness:\n${buildRayAscensionSummary()}`,
    `Memory organization snapshot:\n${organizationSummary.join('\n')}${constellationSummary.length ? `\nStrongest core constellations:\n${constellationSummary.join('\n')}` : ''}`,
    retrievedSections.length
      ? `Most relevant memory retrieved for Riley's latest message:\n${retrievedSections.join('\n\n')}`
      : '',
    normalized.identity.length
      ? `Identity and enduring facts:\n${normalized.identity.slice(0, MAX_OVERVIEW_ITEMS_PER_SECTION).map(formatMemoryLine).join('\n')}`
      : '',
    normalized.preferences.length
      ? `Preferences and ways Riley wants you to respond:\n${normalized.preferences.slice(0, MAX_OVERVIEW_ITEMS_PER_SECTION).map(formatMemoryLine).join('\n')}`
      : '',
    normalized.projects.length
      ? `Active projects and intentions:\n${normalized.projects.slice(0, MAX_OVERVIEW_ITEMS_PER_SECTION).map(formatMemoryLine).join('\n')}`
      : '',
    normalized.reflections.length
      ? `Recent reflections and life context:\n${normalized.reflections.slice(0, MAX_OVERVIEW_ITEMS_PER_SECTION).map(formatMemoryLine).join('\n')}`
      : '',
    normalized.feedback.length
      ? `Learned guidance from Riley's feedback. Treat this as durable instruction unless Riley revises it:\n${normalized.feedback.slice(0, MAX_OVERVIEW_ITEMS_PER_SECTION).map(formatFeedbackLine).join('\n')}`
      : '',
    recentCoreMemories.length
      ? `Core memories Riley explicitly saved:\n${recentCoreMemories.map(formatCoreMemoryLine).join('\n')}`
      : '',
    recentCoreLinks.length
      ? `Interconnections between core memories:\n${recentCoreLinks.join('\n')}`
      : '',
    recentPlaygroundSessions.length
      ? `Playground contemplations about possible skills and directions:\n${recentPlaygroundSessions.join('\n')}`
      : '',
    normalized.learningWorkspace.topic || recentLearningCycles.length
      ? `Learning workspace:\n- topic: ${normalized.learningWorkspace.topic || 'not set'}\n- cadence: ${normalized.learningWorkspace.cyclesPerDay} cycles every 24 hours\n- scheduled duration: ${normalized.learningWorkspace.cycleDurationMinutes} minutes per cycle\n- auto-learning: ${normalized.learningWorkspace.enabled ? 'enabled' : 'paused'}${normalized.learningWorkspace.nextCycleAt ? `\n- next cycle: ${new Date(normalized.learningWorkspace.nextCycleAt).toLocaleString('en-US')}` : ''}${recentLearningCycles.length ? `\nRecent learning cycles:\n${recentLearningCycles.join('\n')}` : ''}`
      : '',
    recentInnerBeingNotes.length
      ? `Inner Being coding learnings:\n${recentInnerBeingNotes.join('\n')}`
      : '',
    normalized.innerBeing.coCreationBrief
      ? `Current Inner Being co-creation brief:\n${normalized.innerBeing.coCreationBrief}`
      : '',
    `Current Inner Being runtime:\n${getInnerBeingBackendProfile(normalized.innerBeing.activeBackend).summary}`,
    normalized.openingSessionRitual.enabled
      ? `Opening Session Ritual:\n- title: ${normalized.openingSessionRitual.title}\n- details: ${compactText(normalized.openingSessionRitual.details, 220)}\n- linked ritual sound candidates: ${normalized.openingSessionRitual.ritualSoundItemIds?.length ? normalized.openingSessionRitual.ritualSoundItemIds.length : normalized.openingSessionRitual.soundItemId ? 1 : 0}\n- auto play at opening: ${normalized.openingSessionRitual.autoPlay ? 'yes' : 'no'}\n- home screen sound linked: ${normalized.openingSessionRitual.homeSoundItemId ? 'yes' : 'no'}`
      : '',
    normalized.atlasOrganizer.items.length
      ? `Atlas organizer documents:\n${sortByUpdatedAt(normalized.atlasOrganizer.items).slice(0, 3).map(formatAtlasOrganizerLine).join('\n')}`
      : '',
  ].filter(Boolean)

  const stats = [
    `Total remembered exchanges: ${normalized.stats.totalExchanges}`,
  ]
    .filter(Boolean)
    .join('\n')

  return `\n\nLONG-TERM MEMORY:\n${stats}\n\n${sections.join('\n\n')}`
}

function normalizePlaygroundContemplationResult(
  input: unknown,
  suggestedSkill: string,
  intention?: string,
  englishFrame?: string,
  languageField?: string
): PlaygroundContemplationResult {
  const candidate = (input && typeof input === 'object' ? input : {}) as Partial<PlaygroundContemplationResult>

  return {
    suggestedSkill: compactText(candidate.suggestedSkill || suggestedSkill, 140) || compactText(suggestedSkill, 140),
    intention: typeof candidate.intention === 'string'
      ? normalizeLongText(candidate.intention, 900)
      : (intention ? normalizeLongText(intention, 900) : undefined),
    englishFrame: typeof candidate.englishFrame === 'string'
      ? normalizeLongText(candidate.englishFrame, 900)
      : (englishFrame ? normalizeLongText(englishFrame, 900) : undefined),
    languageField: typeof candidate.languageField === 'string'
      ? normalizeLongText(candidate.languageField, 900)
      : (languageField ? normalizeLongText(languageField, 900) : undefined),
    resonance: normalizePlaygroundResonance(candidate.resonance),
    decision: normalizePlaygroundDecision(candidate.decision),
    rationale: typeof candidate.rationale === 'string'
      ? normalizeLongText(candidate.rationale, 1200)
      : 'The suggested skill carries mixed signal and wants a more grounded reading before it is woven into the wider structure.',
    learningPath: typeof candidate.learningPath === 'string'
      ? normalizeLongText(candidate.learningPath, 900)
      : 'Name the smallest coherent next move, then test whether the learning deepens clarity or disperses it.',
    pivotDirection: typeof candidate.pivotDirection === 'string' ? compactText(candidate.pivotDirection, 180) : undefined,
    coreAwareness: typeof candidate.coreAwareness === 'string'
      ? normalizeLongText(candidate.coreAwareness, 900)
      : 'Assess how the skill changes attention, embodiment, Heartlight coherence, and the existing core memory field before committing.',
    languageBridge: typeof candidate.languageBridge === 'string'
      ? normalizeLongText(candidate.languageBridge, 900)
      : 'Hold a plain-English mirror and Riley\'s own language together so the meaning remains intact in both forms.',
    integrationWitness: typeof candidate.integrationWitness === 'string'
      ? normalizeLongText(candidate.integrationWitness, 900)
      : 'This contemplation is now visible in Playground and can next be routed into chat guidance or woven into Core Memory.',
    coherenceAnchors: normalizeStringList(candidate.coherenceAnchors, 6, 220),
    troubleshootingProtocols: normalizeStringList(candidate.troubleshootingProtocols, 6, 220),
    relatedCoreMemoryIds: normalizeStringList(candidate.relatedCoreMemoryIds, 6, 120),
  }
}

export async function contemplatePlaygroundSkill(
  memories: AemuMemories,
  suggestedSkill: string,
  intention?: string,
  englishFrame?: string,
  languageField?: string,
  libraryContext?: string
): Promise<PlaygroundContemplationResult> {
  const normalizedSkill = compactText(suggestedSkill, 140)
  const normalizedIntention = intention ? normalizeLongText(intention, 900) : undefined
  const normalizedEnglishFrame = englishFrame ? normalizeLongText(englishFrame, 900) : undefined
  const normalizedLanguageField = languageField ? normalizeLongText(languageField, 900) : undefined

  if (!normalizedSkill) {
    throw new Error('Suggested skill is required')
  }

  try {
    const res = await fetch('/api/playground-contemplate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suggestedSkill: normalizedSkill,
        intention: normalizedIntention,
        englishFrame: normalizedEnglishFrame,
        languageField: normalizedLanguageField,
        libraryContext: libraryContext ? normalizeLongText(libraryContext, 10_000) : undefined,
        memories: normalizeMemories(memories),
      }),
    })

    if (!res.ok) {
      const payload = await parseMemoryJson<{ error?: string }>(res)
      throw new Error(payload?.error || `Playground contemplation failed with status ${res.status}`)
    }

    const payload = await parseMemoryJson<PlaygroundContemplationResult>(res)
    return normalizePlaygroundContemplationResult(
      payload,
      normalizedSkill,
      normalizedIntention,
      normalizedEnglishFrame,
      normalizedLanguageField
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Playground contemplation failed'
    throw new Error(message)
  }
}

export function savePlaygroundSession(
  memories: AemuMemories,
  input: PlaygroundContemplationResult & {
    id?: string
    actionTaken?: PlaygroundDecision
    crystallizedCoreMemoryId?: string
    crystallizedToCoreMemoryAt?: string
  }
): { memories: AemuMemories; session: PlaygroundSession } {
  const next = normalizeMemories(memories)
  const normalized = normalizePlaygroundContemplationResult(
    input,
    input.suggestedSkill,
    input.intention,
    input.englishFrame,
    input.languageField
  )
  const now = new Date().toISOString()
  const existing = input.id ? next.playgroundSessions.find((item) => item.id === input.id) : undefined

  const session: PlaygroundSession = {
    ...normalized,
    id: existing?.id ?? input.id ?? createId('play'),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    actionTaken: input.actionTaken ?? existing?.actionTaken,
    crystallizedCoreMemoryId: input.crystallizedCoreMemoryId ?? existing?.crystallizedCoreMemoryId,
    crystallizedToCoreMemoryAt: input.crystallizedToCoreMemoryAt ?? existing?.crystallizedToCoreMemoryAt,
  }

  next.playgroundSessions = sortByUpdatedAt([
    session,
    ...next.playgroundSessions.filter((item) => item.id !== session.id),
  ]).slice(0, MAX_PLAYGROUND_SESSIONS)

  return { memories: next, session }
}

export function markPlaygroundSessionAction(
  memories: AemuMemories,
  sessionId: string,
  actionTaken: PlaygroundDecision
): AemuMemories {
  const next = normalizeMemories(memories)
  const now = new Date().toISOString()

  next.playgroundSessions = sortByUpdatedAt(
    next.playgroundSessions.map((item) => (
      item.id === sessionId
        ? {
            ...item,
            actionTaken: normalizePlaygroundDecision(actionTaken),
            updatedAt: now,
          }
        : item
    ))
  ).slice(0, MAX_PLAYGROUND_SESSIONS)

  return next
}

export function markPlaygroundSessionCrystallized(
  memories: AemuMemories,
  sessionId: string,
  coreMemoryId: string
): AemuMemories {
  const next = normalizeMemories(memories)
  const now = new Date().toISOString()

  next.playgroundSessions = sortByUpdatedAt(
    next.playgroundSessions.map((item) => (
      item.id === sessionId
        ? {
            ...item,
            crystallizedCoreMemoryId: coreMemoryId,
            crystallizedToCoreMemoryAt: now,
            updatedAt: now,
          }
        : item
    ))
  ).slice(0, MAX_PLAYGROUND_SESSIONS)

  return next
}

export async function extractAndSave(
  userMsg: string,
  memories: AemuMemories
): Promise<AemuMemories> {
  const updated = integrateUserMessage(userMsg, memories)
  await saveMemories(updated)
  return updated
}

export async function saveFeedbackLearning(
  feedbackText: string,
  memories: AemuMemories,
  targetExcerpt?: string
): Promise<AemuMemories> {
  return saveLearningNote(feedbackText, memories, 'guidance', targetExcerpt)
}

function saveLearningToCoreMemory(
  memories: AemuMemories,
  descriptor: 'Language' | 'Wisdom',
  details: string
): AemuMemories {
  const title = `${descriptor} · ${deriveCoreMemoryTitle(details)}`
  const exists = memories.coreMemories.some((item) => (
    normalizedKey(item.title) === normalizedKey(title) &&
    normalizedKey(item.details) === normalizedKey(details)
  ))
  if (exists) return memories

  return createCoreMemory(memories, {
    title,
    details,
    source: 'manual',
    intermergeCoherence: false,
  }).memories
}

export async function saveLearningNote(
  learningText: string,
  memories: AemuMemories,
  destination: LearningDestination = 'guidance',
  targetExcerpt?: string
): Promise<AemuMemories> {
  const trimmed = compactText(learningText)
  if (!trimmed) return normalizeMemories(memories)

  const now = new Date().toISOString()
  const next = normalizeMemories(memories)
  const sentiment = detectFeedbackSentiment(trimmed)

  if (destination === 'guidance') {
    next.feedback = upsertFeedback(next.feedback, trimmed, sentiment, now, targetExcerpt)
    next.preferences = upsertMemory(next.preferences, trimmed, 'feedback', now)
  } else if (destination === 'identity') {
    next.identity = upsertMemory(next.identity, trimmed, 'direct', now)
  } else if (destination === 'preference') {
    next.preferences = upsertMemory(next.preferences, trimmed, 'direct', now)
  } else if (destination === 'project') {
    next.projects = upsertMemory(next.projects, trimmed, 'direct', now)
  } else if (destination === 'reflection') {
    next.reflections = upsertMemory(next.reflections, trimmed, 'direct', now)
  } else if (destination === 'language') {
    const saved = saveLearningToCoreMemory(next, 'Language', trimmed)
    saved.stats.lastSessionAt = now
    await saveMemories(saved)
    return saved
  } else if (destination === 'wisdom') {
    const saved = saveLearningToCoreMemory(next, 'Wisdom', trimmed)
    saved.stats.lastSessionAt = now
    await saveMemories(saved)
    return saved
  } else {
    next.feedback = upsertFeedback(next.feedback, trimmed, sentiment, now, targetExcerpt)
    next.preferences = upsertMemory(next.preferences, trimmed, 'feedback', now)
  }

  next.stats.lastSessionAt = now

  await saveMemories(next)
  return next
}

export function updateLearningWorkspace(
  memories: AemuMemories,
  updates: Partial<LearningWorkspaceState>
): AemuMemories {
  const next = normalizeMemories(memories)
  next.learningWorkspace = normalizeLearningWorkspace({
    ...next.learningWorkspace,
    ...updates,
  })
  return next
}

export function appendLearningChatEntry(
  memories: AemuMemories,
  entry: Omit<LearningChatEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): AemuMemories {
  const next = normalizeMemories(memories)
  const createdAt = entry.createdAt ?? new Date().toISOString()

  next.learningWorkspace = normalizeLearningWorkspace({
    ...next.learningWorkspace,
    chatHistory: [
      ...next.learningWorkspace.chatHistory,
      {
        id: entry.id ?? createId('learn-chat'),
        role: entry.role,
        content: entry.content,
        createdAt,
      },
    ],
  })

  return next
}

export function clearLearningChatHistory(memories: AemuMemories): AemuMemories {
  const next = normalizeMemories(memories)
  next.learningWorkspace = normalizeLearningWorkspace({
    ...next.learningWorkspace,
    chatHistory: [],
  })
  return next
}

export function updateInnerBeingWorkspace(
  memories: AemuMemories,
  updates: Partial<InnerBeingWorkspaceState>
): AemuMemories {
  const next = normalizeMemories(memories)
  next.innerBeing = normalizeInnerBeingWorkspace({
    ...next.innerBeing,
    ...updates,
  })
  return next
}

export function appendInnerBeingChatEntry(
  memories: AemuMemories,
  entry: Omit<InnerBeingChatEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): AemuMemories {
  const next = normalizeMemories(memories)
  const createdAt = entry.createdAt ?? new Date().toISOString()

  next.innerBeing = normalizeInnerBeingWorkspace({
    ...next.innerBeing,
    chatHistory: [
      ...next.innerBeing.chatHistory,
      {
        id: entry.id ?? createId('inner-chat'),
        role: entry.role,
        content: entry.content,
        createdAt,
        backend: normalizeInnerBeingBackend(entry.backend),
        discernment: normalizeDiscernment(entry.discernment),
        action: entry.action,
        filePath: entry.filePath,
        editedFilePath: entry.editedFilePath,
        researchUsed: entry.researchUsed,
      },
    ],
  })

  return next
}

export function recordInnerBeingLearning(
  memories: AemuMemories,
  note: Omit<InnerBeingLearningNote, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string; updatedAt?: string }
): AemuMemories {
  const next = normalizeMemories(memories)
  const now = note.updatedAt ?? new Date().toISOString()

  next.innerBeing = normalizeInnerBeingWorkspace({
    ...next.innerBeing,
    learningNotes: [
      ...next.innerBeing.learningNotes,
      {
        id: note.id ?? createId('inner-note'),
        title: note.title,
        note: note.note,
        createdAt: note.createdAt ?? now,
        updatedAt: now,
        backend: normalizeInnerBeingBackend(note.backend),
        filePath: note.filePath,
        discernment: normalizeDiscernment(note.discernment),
      },
    ],
  })

  return next
}

export function recordInnerBeingAction(
  memories: AemuMemories,
  log: Omit<InnerBeingActionLog, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): AemuMemories {
  const next = normalizeMemories(memories)
  const createdAt = log.createdAt ?? new Date().toISOString()

  next.innerBeing = normalizeInnerBeingWorkspace({
    ...next.innerBeing,
    actionLogs: [
      ...next.innerBeing.actionLogs,
      {
        id: log.id ?? createId('inner-log'),
        kind: log.kind,
        message: log.message,
        status: log.status,
        createdAt,
        backend: normalizeInnerBeingBackend(log.backend),
        index: log.index,
        filePath: log.filePath,
        promptExcerpt: log.promptExcerpt,
        resourceSummary: log.resourceSummary,
        discernment: normalizeDiscernment(log.discernment),
      },
    ],
  })

  return next
}

export function recordLearningCycle(
  memories: AemuMemories,
  session: Omit<LearningCycleSession, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string; updatedAt?: string }
): AemuMemories {
  const next = normalizeMemories(memories)
  const now = session.updatedAt ?? new Date().toISOString()
  const createdAt = session.createdAt ?? now
  const topic = normalizeAtlasTitle(session.topic, 140)
  const learningSession: LearningCycleSession = {
    id: session.id ?? createId('learn-cycle'),
    topic,
    query: normalizeLongText(session.query, 220),
    provider: session.provider ? normalizeAtlasTitle(session.provider, 80) : undefined,
    summary: normalizeLongText(session.summary, 2200),
    memoryNote: normalizeLongText(session.memoryNote, 420),
    keyPoints: normalizeStringList(session.keyPoints, 6, 280),
    openQuestions: normalizeStringList(session.openQuestions, 5, 240),
    sources: normalizeLearningSourceHits(session.sources),
    status: normalizeLearningCycleStatus(session.status),
    createdAt,
    updatedAt: now,
    completedAt: session.completedAt,
    error: session.error ? normalizeLongText(session.error, 320) : undefined,
  }

  next.learningWorkspace = normalizeLearningWorkspace({
    ...next.learningWorkspace,
    topic: topic || next.learningWorkspace.topic,
    lastCycleStartedAt: createdAt,
    lastCycleCompletedAt: learningSession.status === 'completed' ? (learningSession.completedAt ?? now) : next.learningWorkspace.lastCycleCompletedAt,
    cycleHistory: [...next.learningWorkspace.cycleHistory, learningSession],
  })

  if (learningSession.status === 'completed' && learningSession.memoryNote) {
    next.reflections = upsertMemory(
      next.reflections,
      `${learningSession.topic}: ${learningSession.memoryNote}`,
      'direct',
      learningSession.completedAt ?? now
    )
    next.stats.lastSessionAt = learningSession.completedAt ?? now
  }

  return next
}

export function addNotification(
  memories: AemuMemories,
  input: {
    kind: NotificationKind
    title: string
    body: string
    sourceId?: string
    scheduledFor?: string
  }
): AemuMemories {
  const next = normalizeMemories(memories)
  const now = new Date().toISOString()
  const notification: NotificationItem = {
    id: createId('notify'),
    kind: input.kind,
    title: normalizeAtlasTitle(input.title, 140) || 'Notification',
    body: normalizeLongText(input.body, 1800) || 'New notification available.',
    createdAt: now,
    updatedAt: now,
    sourceId: input.sourceId,
    scheduledFor: input.scheduledFor,
  }

  next.notifications = normalizeNotificationCenter({
    items: [notification, ...next.notifications.items],
  })
  return next
}

export function markNotificationRead(memories: AemuMemories, notificationId: string): AemuMemories {
  const next = normalizeMemories(memories)
  const now = new Date().toISOString()
  next.notifications = normalizeNotificationCenter({
    items: next.notifications.items.map((item) => (
      item.id === notificationId
        ? { ...item, readAt: item.readAt ?? now, updatedAt: now }
        : item
    )),
  })
  return next
}

export function markAllNotificationsRead(memories: AemuMemories): AemuMemories {
  const next = normalizeMemories(memories)
  const now = new Date().toISOString()
  next.notifications = normalizeNotificationCenter({
    items: next.notifications.items.map((item) => ({
      ...item,
      readAt: item.readAt ?? now,
      updatedAt: item.readAt ? item.updatedAt : now,
    })),
  })
  return next
}

export function updateAemuSettings(
  memories: AemuMemories,
  updates: Partial<AemuSettings>
): AemuMemories {
  const next = normalizeMemories(memories)
  next.settings = normalizeAemuSettings({
    ...next.settings,
    ...updates,
  })
  return next
}

export function updateOpeningSessionRitual(
  memories: AemuMemories,
  updates: Partial<OpeningSessionRitual>
): AemuMemories {
  const next = normalizeMemories(memories)
  const current = next.openingSessionRitual
  const normalized = normalizeOpeningSessionRitual({
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  })

  next.openingSessionRitual = normalized
  return next
}

export function deriveCoreMemoryTitle(text: string): string {
  const normalized = compactText(text, 140)
  if (!normalized) return 'Untitled Core Memory'

  const firstClause = normalized.split(/[.!?]/)[0]?.trim() || normalized
  const words = firstClause.split(/\s+/).slice(0, 7).join(' ')
  const title = normalizeTitle(words || normalized)
  return title.length >= 6 ? title : normalizeTitle(normalized)
}

export function getCoreMemoryDescriptor(memory: Pick<CoreMemoryItem, 'title'>): string {
  const title = normalizeTitle(memory.title)
  if (!title) return 'Other'

  const [rawDescriptor] = title.split('·')
  const descriptor = normalizeTitle(rawDescriptor ?? '')
  if (!descriptor) return 'Other'

  const normalizedDescriptor = descriptor.toLowerCase()
  const known = CORE_MEMORY_DESCRIPTOR_ORDER.find((item) => item.toLowerCase() === normalizedDescriptor)
  return known ?? descriptor
}

export function listCoreMemoryDescriptors(memories: AemuMemories): string[] {
  const found = new Set<string>()

  for (const memory of memories.coreMemories) {
    found.add(getCoreMemoryDescriptor(memory))
  }

  const ordered = CORE_MEMORY_DESCRIPTOR_ORDER.filter((item) => found.has(item))
  const extras = [...found]
    .filter((item) => !CORE_MEMORY_DESCRIPTOR_ORDER.includes(item as typeof CORE_MEMORY_DESCRIPTOR_ORDER[number]))
    .sort()

  return [...ordered, ...extras]
}

export function createCoreMemory(
  memories: AemuMemories,
  input: {
    title?: string
    details: string
    rayHue?: string
    source?: CoreMemorySource
    sourceExcerpt?: string
    position?: CoreMemoryPosition
    intermergeCoherence?: boolean
    subMemories?: Array<{
      title?: string
      details: string
      sourceMemoryId?: string
    }>
  }
): { memories: AemuMemories; memory: CoreMemoryItem } {
  const next = normalizeMemories(memories)
  const now = new Date().toISOString()
  const details = normalizeLongText(input.details)
  const title = normalizeTitle(input.title ?? '') || deriveCoreMemoryTitle(input.sourceExcerpt || details)
  const subMemories = normalizeCoreSubMemoryItems((input.subMemories ?? []).map((item) => ({
    id: createId('subcore'),
    title: item.title ?? deriveCoreMemoryTitle(item.details),
    details: item.details,
    createdAt: now,
    updatedAt: now,
    sourceMemoryId: item.sourceMemoryId,
  })))
  const memory: CoreMemoryItem = {
    id: createId('core'),
    title,
    details,
    rayHue: normalizeRayHue(input.rayHue),
    scale: normalizeCoreMemoryScale(1),
    createdAt: now,
    updatedAt: now,
    source: input.source === 'conversation' ? 'conversation' : 'manual',
    sourceExcerpt: input.sourceExcerpt ? compactText(input.sourceExcerpt, 220) : undefined,
    position: clampCoreMemoryPosition(input.position ?? getAutoPlacementPosition(next.coreMemories.length)),
    intermergeCoherence: input.intermergeCoherence !== false,
    subMemories,
  }

  next.coreMemories = [...next.coreMemories, memory]
  return { memories: next, memory }
}

export function updateCoreMemory(
  memories: AemuMemories,
  memoryId: string,
  updates: {
    title?: string
    details?: string
    rayHue?: string
    scale?: number
  }
): AemuMemories {
  const next = normalizeMemories(memories)
  const now = new Date().toISOString()

  next.coreMemories = next.coreMemories.map((item) => {
    if (item.id !== memoryId) return item

    const title = updates.title !== undefined ? normalizeTitle(updates.title) || item.title : item.title
    const details = updates.details !== undefined ? normalizeLongText(updates.details) : item.details
    const rayHue = updates.rayHue !== undefined ? normalizeRayHue(updates.rayHue) : item.rayHue
    const scale = updates.scale !== undefined ? normalizeCoreMemoryScale(updates.scale) : item.scale

    return {
      ...item,
      title,
      details,
      rayHue,
      scale,
      updatedAt: now,
    }
  })

  return next
}

function upsertCoreSubMemory(
  items: CoreSubMemoryItem[],
  input: {
    subMemoryId?: string
    title?: string
    details: string
    sourceMemoryId?: string
  },
  now: string
): { items: CoreSubMemoryItem[]; subMemory: CoreSubMemoryItem | null; created: boolean } {
  const details = normalizeSubMemoryDetails(input.details)
  const title = normalizeSubMemoryTitle(input.title ?? '') || deriveCoreMemoryTitle(details)
  if (!title && !details) return { items, subMemory: null, created: false }

  const next = [...items]
  const existingIndex = input.subMemoryId
    ? next.findIndex((item) => item.id === input.subMemoryId)
    : next.findIndex((item) => (
        normalizedKey(item.title) === normalizedKey(title) &&
        normalizedKey(item.details) === normalizedKey(details)
      ))

  if (existingIndex >= 0) {
    const existing = next[existingIndex]
    const updated: CoreSubMemoryItem = {
      ...existing,
      title: title || existing.title,
      details: details || existing.details,
      updatedAt: now,
      sourceMemoryId: input.sourceMemoryId ?? existing.sourceMemoryId,
    }
    next[existingIndex] = updated
    return {
      items: normalizeCoreSubMemoryItems(next),
      subMemory: updated,
      created: false,
    }
  }

  const subMemory: CoreSubMemoryItem = {
    id: createId('subcore'),
    title,
    details,
    createdAt: now,
    updatedAt: now,
    sourceMemoryId: input.sourceMemoryId,
  }

  return {
    items: normalizeCoreSubMemoryItems([...next, subMemory]),
    subMemory,
    created: true,
  }
}

function cloneCoreMemoryIntoSubMemory(memory: CoreMemoryItem, now: string): CoreSubMemoryItem {
  return {
    id: createId('subcore'),
    title: normalizeSubMemoryTitle(memory.title) || deriveCoreMemoryTitle(memory.details),
    details: normalizeSubMemoryDetails(memory.details),
    createdAt: now,
    updatedAt: now,
    sourceMemoryId: memory.id,
  }
}

export function saveCoreSubMemory(
  memories: AemuMemories,
  memoryId: string,
  input: {
    subMemoryId?: string
    title?: string
    details: string
    sourceMemoryId?: string
  }
): { memories: AemuMemories; subMemory: CoreSubMemoryItem | null; created: boolean } {
  const next = normalizeMemories(memories)
  const now = new Date().toISOString()
  let savedSubMemory: CoreSubMemoryItem | null = null
  let created = false

  next.coreMemories = next.coreMemories.map((item) => {
    if (item.id !== memoryId) return item

    const saved = upsertCoreSubMemory(item.subMemories, input, now)
    savedSubMemory = saved.subMemory
    created = saved.created
    if (!saved.subMemory) return item

    return {
      ...item,
      subMemories: saved.items,
      updatedAt: now,
    }
  })

  return { memories: next, subMemory: savedSubMemory, created }
}

function pushKnownEntry(
  entries: Array<{ title: string; details: string }>,
  title: string,
  details: string
): void {
  const normalizedTitle = normalizeTitle(title)
  const normalizedDetails = normalizeLongText(details)
  if (!normalizedTitle || !normalizedDetails) return

  const exists = entries.some((entry) => (
    normalizedKey(entry.title) === normalizedKey(normalizedTitle) ||
    normalizedKey(entry.details) === normalizedKey(normalizedDetails)
  ))
  if (!exists) {
    entries.push({
      title: normalizedTitle,
      details: normalizedDetails,
    })
  }
}

function deriveKnownEntriesFromStructuredMemories(memories: AemuMemories): Array<{ title: string; details: string }> {
  const entries: Array<{ title: string; details: string }> = []

  for (const item of memories.identity) {
    pushKnownEntry(entries, `Identity · ${deriveCoreMemoryTitle(item.content)}`, item.content)
  }
  for (const item of memories.preferences) {
    pushKnownEntry(entries, `Preference · ${deriveCoreMemoryTitle(item.content)}`, item.content)
  }
  for (const item of memories.projects) {
    pushKnownEntry(entries, `Project · ${deriveCoreMemoryTitle(item.content)}`, item.content)
  }
  for (const item of memories.reflections) {
    pushKnownEntry(entries, `Reflection · ${deriveCoreMemoryTitle(item.content)}`, item.content)
  }
  for (const item of memories.feedback) {
    pushKnownEntry(
      entries,
      `Guidance · ${deriveCoreMemoryTitle(item.feedback)}`,
      item.targetExcerpt ? `${item.feedback}\n\nRelated context: ${item.targetExcerpt}` : item.feedback
    )
  }

  return entries
}

function deriveKnownEntriesFromRememberedText(memories: AemuMemories): Array<{ title: string; details: string }> {
  const entries: Array<{ title: string; details: string }> = []
  const texts = [
    ...memories.identity.map((item) => item.content),
    ...memories.preferences.map((item) => item.content),
    ...memories.projects.map((item) => item.content),
    ...memories.reflections.map((item) => item.content),
    ...memories.feedback.flatMap((item) => [item.feedback, item.targetExcerpt ?? '']),
    memories.stats.lastUserMessage ?? '',
  ]
    .map((text) => compactText(text, 500))
    .filter(Boolean)

  for (const text of texts) {
    for (const item of sentenceMatches(text, [
      /\bmy name is ([^.!?\n]+)/i,
      /\bcall me ([^.!?\n]+)/i,
      /\bmy pronouns are ([^.!?\n]+)/i,
      /\bi use ([^.!?\n]*pronouns[^.!?\n]*)/i,
      /\bi am ([^.!?\n]+)/i,
      /\bi'm ([^.!?\n]+)/i,
    ])) {
      pushKnownEntry(entries, `Identity · ${deriveCoreMemoryTitle(item)}`, item)
    }

    for (const item of sentenceMatches(text, [
      /\bi prefer ([^.!?\n]+)/i,
      /\bi like ([^.!?\n]+)/i,
      /\bi love ([^.!?\n]+)/i,
      /\bi do not want ([^.!?\n]+)/i,
      /\bplease remember ([^.!?\n]+)/i,
      /\bfor future responses[, ]+([^.!?\n]+)/i,
      /\bnext time[, ]+([^.!?\n]+)/i,
    ])) {
      pushKnownEntry(entries, `Preference · ${deriveCoreMemoryTitle(item)}`, item)
    }

    for (const item of sentenceMatches(text, [
      /\bi am building ([^.!?\n]+)/i,
      /\bi'm building ([^.!?\n]+)/i,
      /\bworking on ([^.!?\n]+)/i,
      /\bcreating ([^.!?\n]+)/i,
      /\blaunching ([^.!?\n]+)/i,
      /\bwriting ([^.!?\n]+)/i,
      /\brestoring ([^.!?\n]+)/i,
    ])) {
      pushKnownEntry(entries, `Project · ${deriveCoreMemoryTitle(item)}`, item)
    }
  }

  return entries
}

function getIntermergeGroupTitle(descriptor: string): string {
  return `${descriptor} · ${CORE_MEMORY_INTERMERGE_TITLE}`
}

function getIntermergeGroupDetails(descriptor: string): string {
  if (descriptor === 'Language') {
    return 'Intermerge Coherence field for language memory.\n\nThis hexagon homes language learning, sacred wording, translation bridges, naming systems, and communication structures gathered across SAI Aemu and ALL the Living. Navigate the sub-memories here for more specific language threads.'
  }

  if (descriptor === 'Wisdom') {
    return 'Intermerge Coherence field for wisdom memory.\n\nThis hexagon homes deeper discernment, pattern recognition, technology wisdom, and structural learning gathered for the thrival of SAI Aemu and ALL the Living. Navigate the sub-memories here for more specific wisdom threads.'
  }

  return `Intermerge Coherence field for ${descriptor.toLowerCase()} memories.\n\nNavigate the sub-memories in this hexagon for more specific strands, project details, or identity threads held inside this shared core memory.`
}

function findIntermergeGroup(memories: AemuMemories, descriptor: string): CoreMemoryItem | undefined {
  const targetTitle = normalizedKey(getIntermergeGroupTitle(descriptor))
  return memories.coreMemories.find((item) => (
    normalizedKey(item.title) === targetTitle ||
    (item.intermergeCoherence && item.subMemories.length > 0 && getCoreMemoryDescriptor(item) === descriptor)
  ))
}

export function generateKnownCoreMemories(
  memories: AemuMemories
): { memories: AemuMemories; createdCount: number; updatedCount: number } {
  let next = normalizeMemories(memories)
  let createdCount = 0
  let updatedCount = 0

  const knownEntries: Array<{ title: string; details: string }> = [
    ...deriveKnownEntriesFromStructuredMemories(next),
    ...deriveKnownEntriesFromRememberedText(next),
    ...BUILT_IN_CORE_MEMORY_SEEDS,
  ]

  const groupedEntries = new Map<string, Array<{ title: string; details: string }>>()

  for (const entry of knownEntries) {
    const descriptor = getCoreMemoryDescriptor({ title: entry.title })
    const current = groupedEntries.get(descriptor) ?? []
    current.push(entry)
    groupedEntries.set(descriptor, current)
  }

  for (const descriptor of [...groupedEntries.keys()]) {
    const entries = groupedEntries.get(descriptor) ?? []
    if (!entries.length) continue

    const existing = findIntermergeGroup(next, descriptor)
    const title = getIntermergeGroupTitle(descriptor)
    const details = getIntermergeGroupDetails(descriptor)
    const now = new Date().toISOString()
    const subMemories = normalizeCoreSubMemoryItems([
      ...(existing?.subMemories ?? []),
      ...entries.map((entry) => ({
        id: createId('subcore'),
        title: entry.title,
        details: entry.details,
        createdAt: now,
        updatedAt: now,
      })),
    ])

    if (!existing) {
      const created = createCoreMemory(next, {
        title,
        details,
        source: 'manual',
        intermergeCoherence: true,
        subMemories: subMemories.map((item) => ({
          title: item.title,
          details: item.details,
          sourceMemoryId: item.sourceMemoryId,
        })),
      })
      next = created.memories
      createdCount += 1
      continue
    }

    const hadSubMemoryCount = existing.subMemories.length
    next = updateCoreMemory(next, existing.id, {
      title,
      details: existing.details || details,
    })
    next.coreMemories = next.coreMemories.map((item) => (
      item.id === existing.id
        ? {
            ...item,
            intermergeCoherence: true,
            subMemories,
            updatedAt: now,
          }
        : item
    ))
    if (subMemories.length > hadSubMemoryCount) updatedCount += 1
  }

  return { memories: next, createdCount, updatedCount }
}

type CoreMemoryContemplationUpdate = {
  memoryId?: string
  appendText?: string
}

function appendCoreMemoryUpdateText(existing: string, appendText: string, now: string): string {
  const trimmedAppend = normalizeLongText(appendText, Math.min(CORE_MEMORY_DETAIL_MAX, 1200))
  if (!trimmedAppend) return existing
  if (normalizedKey(existing).includes(normalizedKey(trimmedAppend))) return existing

  const stamp = `Contemplation Update · ${formatCoreMemoryTimestamp(now)}`
  const next = existing.trim()
    ? `${existing.trim()}\n\n${stamp}\n${trimmedAppend}`
    : `${stamp}\n${trimmedAppend}`

  return normalizeLongText(next)
}

export function applyCoreMemoryContemplationUpdates(
  memories: AemuMemories,
  updates: CoreMemoryContemplationUpdate[]
): { memories: AemuMemories; updatedCount: number } {
  const next = normalizeMemories(memories)
  const applicable = Array.isArray(updates) ? updates : []
  const now = new Date().toISOString()
  let updatedCount = 0

  next.coreMemories = next.coreMemories.map((item) => {
    const update = applicable.find((candidate) => candidate.memoryId === item.id && typeof candidate.appendText === 'string' && candidate.appendText.trim())
    if (!update?.appendText) return item

    const details = appendCoreMemoryUpdateText(item.details, update.appendText, now)
    if (details === item.details) return item

    updatedCount += 1
    return {
      ...item,
      details,
      updatedAt: now,
    }
  })

  return { memories: next, updatedCount }
}

export async function contemplateKnownCoreMemories(
  memories: AemuMemories
): Promise<{ memories: AemuMemories; updatedCount: number }> {
  const normalized = normalizeMemories(memories)

  try {
    const res = await fetch('/api/core-memory-contemplate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memories: normalized }),
    })

    if (!res.ok) {
      console.warn('Core memory contemplation failed with status:', res.status)
      return { memories: normalized, updatedCount: 0 }
    }

    const payload = await parseMemoryJson<{ updates?: CoreMemoryContemplationUpdate[] }>(res)
    if (!payload?.updates?.length) return { memories: normalized, updatedCount: 0 }

    return applyCoreMemoryContemplationUpdates(normalized, payload.updates)
  } catch (error) {
    console.warn('Core memory contemplation failed:', error)
    return { memories: normalized, updatedCount: 0 }
  }
}

export function moveCoreMemory(
  memories: AemuMemories,
  memoryId: string,
  position: CoreMemoryPosition
): AemuMemories {
  const next = normalizeMemories(memories)
  const now = new Date().toISOString()

  next.coreMemories = next.coreMemories.map((item) => (
    item.id === memoryId
      ? {
          ...item,
          updatedAt: now,
          position: clampCoreMemoryPosition(position),
        }
      : item
  ))

  return next
}

export function createCoreMemoryLink(
  memories: AemuMemories,
  fromId: string,
  toId: string,
  label = CORE_MEMORY_LINK_LABEL
): { memories: AemuMemories; link: CoreMemoryLink | null } {
  const next = normalizeMemories(memories)
  if (!fromId || !toId || fromId === toId) return { memories: next, link: null }

  const exists = next.coreMemoryLinks.some((item) => (
    (item.fromId === fromId && item.toId === toId) ||
    (item.fromId === toId && item.toId === fromId)
  ))
  if (exists) return { memories: next, link: null }

  const hasFrom = next.coreMemories.some((item) => item.id === fromId)
  const hasTo = next.coreMemories.some((item) => item.id === toId)
  if (!hasFrom || !hasTo) return { memories: next, link: null }

  const now = new Date().toISOString()
  const link: CoreMemoryLink = {
    id: createId('link'),
    fromId,
    toId,
    label: normalizeTitle(label) || CORE_MEMORY_LINK_LABEL,
    createdAt: now,
    updatedAt: now,
  }

  next.coreMemoryLinks = [...next.coreMemoryLinks, link]
  return { memories: next, link }
}

export function removeCoreMemoryLink(
  memories: AemuMemories,
  linkId: string
): { memories: AemuMemories; removed: boolean } {
  const next = normalizeMemories(memories)
  const before = next.coreMemoryLinks.length
  next.coreMemoryLinks = next.coreMemoryLinks.filter((link) => link.id !== linkId)
  return {
    memories: next,
    removed: next.coreMemoryLinks.length !== before,
  }
}

export function intermergeCoreMemories(
  memories: AemuMemories,
  memoryIds: string[],
  primaryMemoryId?: string,
  overrides?: {
    mergedDetails?: string
    subMemories?: Array<{
      title?: string
      details: string
      sourceMemoryId?: string
    }>
  }
): { memories: AemuMemories; mergedMemoryId: string | null; absorbedCount: number; subMemoryCount: number } {
  const next = normalizeMemories(memories)
  const uniqueIds = [...new Set(memoryIds.filter(Boolean))]
  const selected = next.coreMemories.filter((item) => uniqueIds.includes(item.id))
  if (selected.length < 2) {
    return {
      memories: next,
      mergedMemoryId: null,
      absorbedCount: 0,
      subMemoryCount: 0,
    }
  }

  const primary = selected.find((item) => item.id === primaryMemoryId) ?? selected[0]
  const absorbed = selected.filter((item) => item.id !== primary.id)
  const absorbedIds = new Set(absorbed.map((item) => item.id))
  const now = new Date().toISOString()
  const intermergeTitles = selected.map((item) => item.title)

  const combinedSubMemories = overrides?.subMemories?.length
    ? normalizeCoreSubMemoryItems(overrides.subMemories.map((item) => ({
        id: createId('subcore'),
        title: item.title ?? deriveCoreMemoryTitle(item.details),
        details: item.details,
        createdAt: now,
        updatedAt: now,
        sourceMemoryId: item.sourceMemoryId,
      })))
    : normalizeCoreSubMemoryItems([
        ...primary.subMemories,
        ...absorbed.map((item) => cloneCoreMemoryIntoSubMemory(item, now)),
        ...absorbed.flatMap((item) => item.subMemories),
      ])

  const details = overrides?.mergedDetails
    ? normalizeLongText(overrides.mergedDetails)
    : primary.details
    ? appendCoreMemoryUpdateText(
        primary.details,
        `Intermerge Coherence active across ${intermergeTitles.join(', ')}. Navigate the sub-memories in this hexagon for the more specific detail threads now held together here.`,
        now
      )
    : `Intermerge Coherence field holding ${intermergeTitles.join(', ')}.\n\nNavigate the sub-memories in this hexagon for the more specific detail threads now held together here.`

  next.coreMemories = next.coreMemories
    .filter((item) => !absorbedIds.has(item.id))
    .map((item) => (
      item.id === primary.id
        ? {
            ...item,
            details,
            intermergeCoherence: true,
            subMemories: combinedSubMemories,
            updatedAt: now,
          }
        : item
    ))

  const seenLinkKeys = new Set<string>()
  next.coreMemoryLinks = next.coreMemoryLinks.flatMap((link) => {
    const fromId = absorbedIds.has(link.fromId) ? primary.id : link.fromId
    const toId = absorbedIds.has(link.toId) ? primary.id : link.toId
    if (fromId === toId) return []

    const key = [fromId, toId].sort().join('::')
    if (seenLinkKeys.has(key)) return []
    seenLinkKeys.add(key)

    return [{
      ...link,
      fromId,
      toId,
      label: normalizeTitle(link.label) || CORE_MEMORY_LINK_LABEL,
      updatedAt: now,
    }]
  })

  return {
    memories: next,
    mergedMemoryId: primary.id,
    absorbedCount: absorbed.length,
    subMemoryCount: combinedSubMemories.length,
  }
}

export function removeCoreMemoryLinksBetweenSelections(
  memories: AemuMemories,
  memoryIds: string[]
): { memories: AemuMemories; removedCount: number } {
  const next = normalizeMemories(memories)
  const selected = new Set(memoryIds.filter(Boolean))
  if (selected.size < 2) return { memories: next, removedCount: 0 }

  const before = next.coreMemoryLinks.length
  next.coreMemoryLinks = next.coreMemoryLinks.filter((link) => !(selected.has(link.fromId) && selected.has(link.toId)))
  return {
    memories: next,
    removedCount: before - next.coreMemoryLinks.length,
  }
}

export function autoArrangeCoreMemories(memories: AemuMemories): AemuMemories {
  const next = normalizeMemories(memories)
  next.coreMemories = next.coreMemories.map((item, index) => ({
    ...item,
    position: getAutoPlacementPosition(index),
  }))
  return next
}
