export interface Message {
  role: 'aemu' | 'atlas'
  content: string
  timestamp: Date
  choices?: string[]
  soundCues?: SoundCue[]
}

export type MemorySource = 'inferred' | 'direct' | 'feedback'
export type FeedbackSentiment = 'positive' | 'negative' | 'instruction'
export type CoreMemorySource = 'manual' | 'conversation'
export type PlaygroundResonance = 'resonant' | 'mixed' | 'dissonant'
export type PlaygroundDecision = 'continue' | 'pivot' | 'dissonant'
export type MediaLibraryCategory = 'sound' | 'image' | 'misc'
export type MediaLibraryContentKind = 'sound' | 'image' | 'calendar' | 'document' | 'spreadsheet' | 'text' | 'data' | 'other'
export type MediaLibraryReadability = 'readable' | 'binary' | 'unsupported' | 'error'
export type MediaLibraryStorage = 'upstash' | 'browser'
export type MediaLibrarySaveMode = 'local' | 'cloud' | 'both'
export type LearningDestination = 'guidance' | 'identity' | 'preference' | 'project' | 'reflection' | 'language' | 'wisdom'
export type AtlasOrganizerItemKind = 'note' | 'brief' | 'thread-seed'
export type AtlasThreadsDraftStatus = 'draft' | 'ready' | 'scheduled' | 'published' | 'failed'
export type LearningCycleStatus = 'completed' | 'failed'
export type NotificationKind = 'learning' | 'reminder' | 'threads'
export type InnerBeingActionKind = 'inspect' | 'edit' | 'research' | 'log' | 'heal' | 'error'
export type InnerBeingBackend = 'native' | 'claw'

export interface ReadableDocumentSection {
  id: string
  label: string
  content: string
}

export interface MemoryItem {
  id: string
  content: string
  createdAt: string
  updatedAt: string
  source: MemorySource
}

export interface FeedbackItem {
  id: string
  feedback: string
  createdAt: string
  updatedAt: string
  sentiment: FeedbackSentiment
  targetExcerpt?: string
}

export interface MemoryStats {
  totalExchanges: number
  lastSessionAt?: string
  lastUserMessage?: string
}

export interface OpeningSessionRitual {
  title: string
  details: string
  enabled: boolean
  autoPlay: boolean
  ritualSoundItemIds?: string[]
  soundItemId?: string
  homeSoundItemId?: string
  updatedAt?: string
}

export interface AemuSettings {
  internetSearchEnabled: boolean
  voiceVolume: number
  /** LLM provider preference: 'ollama' | 'anthropic' */
  llmProvider?: 'ollama' | 'anthropic'
  /** Selected Ollama model name */
  ollamaModel?: string
}

export interface CoreMemoryPosition {
  x: number
  y: number
}

export interface CoreSubMemoryItem {
  id: string
  title: string
  details: string
  createdAt: string
  updatedAt: string
  sourceMemoryId?: string
}

export interface CoreMemoryItem {
  id: string
  title: string
  details: string
  rayHue: string
  scale: number
  createdAt: string
  updatedAt: string
  position: CoreMemoryPosition
  source: CoreMemorySource
  sourceExcerpt?: string
  intermergeCoherence: boolean
  subMemories: CoreSubMemoryItem[]
}

export interface CoreMemoryLink {
  id: string
  fromId: string
  toId: string
  label: string
  createdAt: string
  updatedAt: string
}

export interface PlaygroundContemplationResult {
  suggestedSkill: string
  intention?: string
  englishFrame?: string
  languageField?: string
  resonance: PlaygroundResonance
  decision: PlaygroundDecision
  rationale: string
  learningPath: string
  pivotDirection?: string
  coreAwareness: string
  languageBridge: string
  integrationWitness: string
  coherenceAnchors: string[]
  troubleshootingProtocols: string[]
  relatedCoreMemoryIds: string[]
}

export interface PlaygroundSession extends PlaygroundContemplationResult {
  id: string
  createdAt: string
  updatedAt: string
  actionTaken?: PlaygroundDecision
  crystallizedCoreMemoryId?: string
  crystallizedToCoreMemoryAt?: string
}

export interface MediaLibraryItem {
  id: string
  title: string
  category: MediaLibraryCategory
  storage?: MediaLibraryStorage
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  updatedAt: string
  assetUrl?: string
  contentKind?: MediaLibraryContentKind
  readability?: MediaLibraryReadability
  extractedSource?: string
  extractedText?: string
  extractedPreview?: string
  extractedTextLength?: number
  extractedAt?: string
  extractionError?: string
  documentSections?: ReadableDocumentSection[]
  documentOutline?: string[]
  documentPageCount?: number
  documentTruncated?: boolean
  blob?: Blob
}

export interface LibraryRequest {
  category: MediaLibraryCategory
  title: string
  purpose?: string
}

export interface SoundCue {
  title: string
  description?: string
  libraryTitle?: string
  autoPlay?: boolean
}

export interface AtlasOrganizerFolder {
  id: string
  name: string
  description: string
  color: string
  createdAt: string
  updatedAt: string
}

export interface AtlasOrganizerItem {
  id: string
  folderId: string
  title: string
  summary: string
  content: string
  kind: AtlasOrganizerItemKind
  tags: string[]
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
  createdAt: string
  updatedAt: string
}

export interface AtlasThreadsDraft {
  id: string
  folderId?: string
  sourceItemId?: string
  title: string
  angle: string
  prompt: string
  content: string
  status: AtlasThreadsDraftStatus
  createdAt: string
  updatedAt: string
  autoPublish?: boolean
  scheduledFor?: string
  lastPublishAttemptAt?: string
  publishedAt?: string
  publishResult?: string
}

export interface AtlasOrganizerState {
  folders: AtlasOrganizerFolder[]
  items: AtlasOrganizerItem[]
  threadsDrafts: AtlasThreadsDraft[]
}

export interface LearningSourceHit {
  title: string
  url: string
  snippet?: string
}

export interface LearningCycleSession {
  id: string
  topic: string
  query: string
  provider?: string
  summary: string
  memoryNote: string
  keyPoints: string[]
  openQuestions: string[]
  sources: LearningSourceHit[]
  status: LearningCycleStatus
  createdAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

export interface LearningChatEntry {
  id: string
  role: 'atlas' | 'aemu'
  content: string
  createdAt: string
}

export interface LearningWorkspaceState {
  topic: string
  enabled: boolean
  autoSearchEnabled: boolean
  cyclesPerDay: number
  cycleDurationMinutes: number
  lastCycleStartedAt?: string
  lastCycleCompletedAt?: string
  nextCycleAt?: string
  cycleHistory: LearningCycleSession[]
  chatHistory: LearningChatEntry[]
}

export interface InnerBeingChatEntry {
  id: string
  role: 'atlas' | 'aemu'
  content: string
  createdAt: string
  backend?: InnerBeingBackend
  discernment?: number
  action?: InnerBeingActionKind
  filePath?: string
  editedFilePath?: string
  researchUsed?: boolean
}

export interface InnerBeingLearningNote {
  id: string
  title: string
  note: string
  createdAt: string
  updatedAt: string
  backend?: InnerBeingBackend
  filePath?: string
  discernment?: number
}

export interface InnerBeingActionLog {
  id: string
  kind: InnerBeingActionKind
  message: string
  status: 'ok' | 'blocked' | 'error'
  createdAt: string
  backend?: InnerBeingBackend
  index?: number
  filePath?: string
  promptExcerpt?: string
  resourceSummary?: string
  discernment?: number
}

export interface InnerBeingWorkspaceState {
  discernmentThreshold: number
  coCreationBrief: string
  caduceusHealingEnabled: boolean
  activeBackend?: InnerBeingBackend
  selectedFilePath?: string
  selectedLogPath?: string
  chatHistory: InnerBeingChatEntry[]
  learningNotes: InnerBeingLearningNote[]
  actionLogs: InnerBeingActionLog[]
}

export interface NotificationItem {
  id: string
  kind: NotificationKind
  title: string
  body: string
  createdAt: string
  updatedAt: string
  readAt?: string
  sourceId?: string
  scheduledFor?: string
}

export interface NotificationCenterState {
  items: NotificationItem[]
}

export interface AemuMemories {
  version: 11
  identity: MemoryItem[]
  preferences: MemoryItem[]
  projects: MemoryItem[]
  reflections: MemoryItem[]
  feedback: FeedbackItem[]
  coreMemories: CoreMemoryItem[]
  coreMemoryLinks: CoreMemoryLink[]
  playgroundSessions: PlaygroundSession[]
  openingSessionRitual: OpeningSessionRitual
  atlasOrganizer: AtlasOrganizerState
  learningWorkspace: LearningWorkspaceState
  innerBeing: InnerBeingWorkspaceState
  notifications: NotificationCenterState
  settings: AemuSettings
  stats: MemoryStats
}

export interface LegacyMemories {
  [key: string]: string
}

export interface ApiResponse {
  reply?: string
  error?: string
}

export interface MemoryResponse {
  memories?: AemuMemories | LegacyMemories | null
  ok?: boolean
  error?: string
  storage?: 'upstash' | 'browser'
}

export interface MediaLibraryResponse {
  items?: MediaLibraryItem[] | null
  ok?: boolean
  error?: string
  storage?: MediaLibraryStorage
}

export interface SpeakResponse {
  error?: string
}
