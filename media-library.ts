import { upload } from '@vercel/blob/client'
import {
  describeMediaLibraryReadability,
  extractMediaLibraryFile,
  isMediaLibraryItemReadable,
} from './library-file-reading'
import type { MediaLibraryCategory, MediaLibraryItem, MediaLibraryResponse, MediaLibrarySaveMode, MediaLibraryStorage, OpeningSessionRitual } from './types'

const DB_NAME = 'aemu-media-library'
const STORE_NAME = 'items'
const DB_VERSION = 1
const REMOTE_LIBRARY_URL = '/api/library'
const REMOTE_LIBRARY_UPLOAD_URL = '/api/library-upload'
const MAX_LIBRARY_TITLE = 96
const MAX_LIBRARY_CONTEXT_ITEMS = 10
const MAX_READABLE_LIBRARY_PREVIEWS = 6
const MAX_RELEVANT_LIBRARY_ITEMS = 2
const MAX_RELEVANT_ITEM_CHARS_CHAT = 3_200
const MAX_RELEVANT_ITEM_CHARS_PLAYGROUND = 4_000
const REMOTE_MULTIPART_BYTES = 4_500_000
const REMOTE_UPLOAD_TIMEOUT_MS = 15_000
const LIBRARY_SAVE_MODE_STORAGE_KEY = 'aemu:library-save-mode'

type MediaLibraryRecord = MediaLibraryItem
let remoteLibraryStorageMode: MediaLibraryStorage | null = null
let cachedLibrarySaveMode: MediaLibrarySaveMode | null = null

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function normalizeStorage(value: unknown): MediaLibraryStorage | undefined {
  return value === 'upstash' || value === 'browser' ? value : undefined
}

function normalizeSaveMode(value: unknown): MediaLibrarySaveMode | undefined {
  return value === 'local' || value === 'cloud' || value === 'both' ? value : undefined
}

function readLibrarySaveMode(): MediaLibrarySaveMode {
  if (typeof window === 'undefined') return 'both'

  try {
    return normalizeSaveMode(window.localStorage.getItem(LIBRARY_SAVE_MODE_STORAGE_KEY)) ?? 'both'
  } catch {
    return 'both'
  }
}

export function getMediaLibrarySaveMode(): MediaLibrarySaveMode {
  if (!cachedLibrarySaveMode) {
    cachedLibrarySaveMode = readLibrarySaveMode()
  }

  return cachedLibrarySaveMode
}

export function setMediaLibrarySaveMode(mode: MediaLibrarySaveMode): void {
  cachedLibrarySaveMode = mode

  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(LIBRARY_SAVE_MODE_STORAGE_KEY, mode)
  } catch {
    console.warn('Unable to persist Library save mode')
  }
}

export function getMediaLibraryStatus(): {
  cloudAvailable: boolean
  storageBackend: MediaLibraryStorage
  saveMode: MediaLibrarySaveMode
} {
  const storageBackend = remoteLibraryStorageMode === 'upstash' ? 'upstash' : 'browser'
  return {
    cloudAvailable: storageBackend === 'upstash',
    storageBackend,
    saveMode: getMediaLibrarySaveMode(),
  }
}

function sanitizeRemoteFileSegment(value: string): string {
  const trimmed = normalizeWhitespace(value).toLowerCase()
  const sanitized = trimmed.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return sanitized || 'file'
}

function buildRemoteLibraryPathname(itemId: string, fileName: string): string {
  return `aemu-library/${itemId}-${sanitizeRemoteFileSegment(fileName)}`
}

function serializeMediaLibraryItem(item: MediaLibraryItem): Omit<MediaLibraryItem, 'blob'> {
  const { blob, ...serializable } = item
  void blob
  return serializable
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('Media library storage is unavailable in this browser'))
      return
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(request.error ?? new Error('Unable to open the media library'))
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('category', 'category', { unique: false })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
  })
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void
): Promise<T> {
  return openDatabase().then((db) => (
    new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode)
      const store = transaction.objectStore(STORE_NAME)

      transaction.onabort = () => {
        reject(transaction.error ?? new Error('Media library transaction aborted'))
      }
      transaction.onerror = () => {
        reject(transaction.error ?? new Error('Media library transaction failed'))
      }
      transaction.oncomplete = () => {
        db.close()
      }

      executor(store, resolve, reject)
    })
  ))
}

export function normalizeMediaLibraryCategory(value: string | undefined): MediaLibraryCategory {
  if (value === 'sound' || value === 'image') return value
  return 'misc'
}

export function normalizeMediaTitle(value: string): string {
  return normalizeWhitespace(value).slice(0, MAX_LIBRARY_TITLE)
}

export function formatMediaLibraryBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
}

export function sortMediaLibraryItems(items: MediaLibraryItem[]): MediaLibraryItem[] {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt) || 0
    const rightTime = Date.parse(right.updatedAt) || 0
    return rightTime - leftTime
  })
}

async function loadLocalMediaLibrary(): Promise<MediaLibraryItem[]> {
  return runTransaction<MediaLibraryItem[]>('readonly', (store, resolve, reject) => {
    const request = store.getAll()
    request.onerror = () => reject(request.error ?? new Error('Unable to load the media library'))
    request.onsuccess = () => {
      const result = Array.isArray(request.result) ? request.result as MediaLibraryRecord[] : []
      resolve(sortMediaLibraryItems(result.map(normalizeMediaLibraryItem)))
    }
  })
}

async function saveLocalMediaLibraryItem(item: MediaLibraryItem): Promise<MediaLibraryItem> {
  return runTransaction<MediaLibraryItem>('readwrite', (store, resolve, reject) => {
    const request = store.put(item)
    request.onerror = () => reject(request.error ?? new Error('Unable to save the library item'))
    request.onsuccess = () => resolve(normalizeMediaLibraryItem(item))
  })
}

async function replaceLocalMediaLibraryItems(items: MediaLibraryItem[]): Promise<void> {
  return runTransaction<void>('readwrite', (store, resolve, reject) => {
    const clearRequest = store.clear()
    clearRequest.onerror = () => reject(clearRequest.error ?? new Error('Unable to reset the media library cache'))
    clearRequest.onsuccess = () => {
      if (!items.length) {
        resolve()
        return
      }

      let completed = 0
      for (const item of items) {
        const putRequest = store.put(item)
        putRequest.onerror = () => reject(putRequest.error ?? new Error('Unable to cache the media library item'))
        putRequest.onsuccess = () => {
          completed += 1
          if (completed === items.length) resolve()
        }
      }
    }
  })
}

async function deleteLocalMediaLibraryItem(itemId: string): Promise<void> {
  return runTransaction<void>('readwrite', (store, resolve, reject) => {
    const request = store.delete(itemId)
    request.onerror = () => reject(request.error ?? new Error('Unable to remove the library item'))
    request.onsuccess = () => resolve()
  })
}

async function fetchRemoteLibraryResponse(action?: 'status'): Promise<MediaLibraryResponse> {
  const suffix = action === 'status' ? '?action=status' : ''
  const response = await fetch(`${REMOTE_LIBRARY_URL}${suffix}`, {
    cache: 'no-store',
  })
  const data = await response.json() as MediaLibraryResponse
  if (!response.ok) {
    throw new Error(data.error ?? `Library request failed with status ${response.status}`)
  }
  return data
}

async function fetchRemoteLibraryStatus(): Promise<MediaLibraryStorage> {
  try {
    const data = await fetchRemoteLibraryResponse('status')
    remoteLibraryStorageMode = data.storage === 'upstash' ? 'upstash' : 'browser'
    return remoteLibraryStorageMode
  } catch {
    remoteLibraryStorageMode = 'browser'
    return remoteLibraryStorageMode
  }
}

async function upsertRemoteMediaLibraryItem(item: MediaLibraryItem): Promise<void> {
  const response = await fetch(REMOTE_LIBRARY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: serializeMediaLibraryItem(item) }),
  })

  const data = await response.json() as MediaLibraryResponse
  if (!response.ok || data.error) {
    throw new Error(data.error ?? 'Unable to save the cloud Library item')
  }
}

async function deleteRemoteMediaLibraryItem(item: MediaLibraryItem): Promise<void> {
  const response = await fetch(REMOTE_LIBRARY_URL, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      itemId: item.id,
      assetUrl: item.assetUrl,
    }),
  })

  const data = await response.json() as MediaLibraryResponse
  if (!response.ok || data.error) {
    throw new Error(data.error ?? 'Unable to remove the cloud Library item')
  }
}

function buildMediaLibraryItem(input: {
  id: string
  title: string
  category: MediaLibraryCategory
  file: File
  storage: MediaLibraryStorage
  assetUrl?: string
  blob?: Blob
}): Promise<MediaLibraryItem> {
  return extractMediaLibraryFile(input.file).then((extracted) => {
    const now = new Date().toISOString()
    return normalizeMediaLibraryItem({
      id: input.id,
      title: input.title,
      category: normalizeMediaLibraryCategory(input.category),
      storage: input.storage,
      fileName: input.file.name,
      mimeType: input.file.type || 'application/octet-stream',
      sizeBytes: input.file.size,
      createdAt: now,
      updatedAt: now,
      assetUrl: input.assetUrl,
      contentKind: extracted.contentKind,
      readability: extracted.readability,
      extractedSource: extracted.extractedSource,
      extractedText: extracted.extractedText,
      extractedPreview: extracted.extractedPreview,
      extractedTextLength: extracted.extractedTextLength,
      extractedAt: extracted.extractedAt,
      extractionError: extracted.extractionError,
      documentSections: extracted.documentSections,
      documentOutline: extracted.documentOutline,
      documentPageCount: extracted.documentPageCount,
      documentTruncated: extracted.documentTruncated,
      blob: input.blob,
    })
  })
}

function mergeMediaLibraryCollections(remoteItems: MediaLibraryItem[], localItems: MediaLibraryItem[]): MediaLibraryItem[] {
  const merged = new Map<string, MediaLibraryItem>()
  for (const item of [...localItems, ...remoteItems]) {
    merged.set(item.id, normalizeMediaLibraryItem(item))
  }
  return sortMediaLibraryItems([...merged.values()])
}

export async function loadMediaLibrary(): Promise<MediaLibraryItem[]> {
  const localItems = await loadLocalMediaLibrary()

  try {
    const data = await fetchRemoteLibraryResponse()
    if (data.storage !== 'upstash') {
      remoteLibraryStorageMode = 'browser'
      return localItems
    }

    remoteLibraryStorageMode = 'upstash'
    const remoteItems = Array.isArray(data.items)
      ? sortMediaLibraryItems(data.items.map(normalizeMediaLibraryItem))
      : []
    const cachedCloudItems = localItems.filter((item) => item.storage === 'upstash' || Boolean(item.assetUrl))
    const merged = remoteItems.length === 0 && cachedCloudItems.length
      ? sortMediaLibraryItems(localItems)
      : mergeMediaLibraryCollections(remoteItems, localItems.filter((item) => item.storage !== 'upstash'))
    await replaceLocalMediaLibraryItems(merged)
    return merged
  } catch {
    remoteLibraryStorageMode = 'browser'
    return localItems
  }
}

export async function saveMediaLibraryItem(input: {
  file: File
  title: string
  category: MediaLibraryCategory
}): Promise<MediaLibraryItem> {
  const title = normalizeMediaTitle(input.title)
  if (!title) throw new Error('A title is required for the library item')

  const itemId = `media_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const saveMode = getMediaLibrarySaveMode()
  const saveBrowserItem = async (): Promise<MediaLibraryItem> => {
    const item = await buildMediaLibraryItem({
      id: itemId,
      title,
      category: input.category,
      file: input.file,
      storage: 'browser',
      blob: input.file,
    })

    await saveLocalMediaLibraryItem(item)
    remoteLibraryStorageMode = 'browser'
    return item
  }

  const saveCloudItem = async (keepLocalBlob: boolean): Promise<MediaLibraryItem> => {
    try {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), REMOTE_UPLOAD_TIMEOUT_MS)

      try {
        const pathname = buildRemoteLibraryPathname(itemId, input.file.name)
        const uploaded = await upload(pathname, input.file, {
          access: 'public',
          handleUploadUrl: REMOTE_LIBRARY_UPLOAD_URL,
          multipart: input.file.size > REMOTE_MULTIPART_BYTES,
          contentType: input.file.type || 'application/octet-stream',
          clientPayload: JSON.stringify({
            category: normalizeMediaLibraryCategory(input.category),
            title,
          }),
          abortSignal: controller.signal,
        })

        const item = await buildMediaLibraryItem({
          id: itemId,
          title,
          category: input.category,
          file: input.file,
          storage: 'upstash',
          assetUrl: uploaded.url,
          blob: input.file,
        })

        await upsertRemoteMediaLibraryItem(item)
        await saveLocalMediaLibraryItem(keepLocalBlob ? item : { ...item, blob: undefined })
        return item
      } finally {
        window.clearTimeout(timeout)
      }
    } catch (error) {
      console.warn('Cloud Library upload failed, falling back to browser storage:', error)
      if (saveMode === 'cloud') {
        throw new Error('Cloud Library save failed. Switch save mode to Local or Both, or verify Blob + Upstash are connected.')
      }
      return saveBrowserItem()
    }
  }

  if (saveMode === 'local') {
    return saveBrowserItem()
  }

  const storageMode = remoteLibraryStorageMode ?? await fetchRemoteLibraryStatus()
  if (storageMode !== 'upstash') {
    if (saveMode === 'cloud') {
      throw new Error('Cloud Library is not available right now. Switch save mode to Local or Both.')
    }
    return saveBrowserItem()
  }

  if (saveMode === 'cloud') {
    return saveCloudItem(false)
  }

  if (saveMode === 'both') {
    return saveCloudItem(true)
  }

  return saveBrowserItem()
}

function normalizeMediaLibraryItem(item: MediaLibraryItem): MediaLibraryItem {
  return {
    ...item,
    title: normalizeMediaTitle(item.title),
    storage: normalizeStorage(item.storage) ?? (typeof item.assetUrl === 'string' ? 'upstash' : 'browser'),
    fileName: item.fileName || 'Untitled file',
    mimeType: item.mimeType || 'application/octet-stream',
    assetUrl: typeof item.assetUrl === 'string' && item.assetUrl.trim() ? item.assetUrl : undefined,
    readability: item.readability,
    extractedSource: item.extractedSource,
    extractedText: typeof item.extractedText === 'string' ? item.extractedText : undefined,
    extractedPreview: typeof item.extractedPreview === 'string' ? item.extractedPreview : undefined,
    extractedTextLength: typeof item.extractedTextLength === 'number' ? item.extractedTextLength : undefined,
    extractedAt: typeof item.extractedAt === 'string' ? item.extractedAt : undefined,
    extractionError: typeof item.extractionError === 'string' ? item.extractionError : undefined,
    documentSections: Array.isArray(item.documentSections)
      ? item.documentSections
        .map((section, index) => ({
          id: typeof section?.id === 'string' ? section.id : `section_${index + 1}`,
          label: typeof section?.label === 'string' ? normalizeWhitespace(section.label).slice(0, 120) : `Section ${index + 1}`,
          content: typeof section?.content === 'string' ? section.content.trim() : '',
        }))
        .filter((section) => section.content)
      : undefined,
    documentOutline: Array.isArray(item.documentOutline)
      ? item.documentOutline.map((entry) => typeof entry === 'string' ? normalizeWhitespace(entry).slice(0, 120) : '').filter(Boolean)
      : undefined,
    documentPageCount: typeof item.documentPageCount === 'number' ? item.documentPageCount : undefined,
    documentTruncated: item.documentTruncated === true,
  }
}

export async function deleteMediaLibraryItem(item: MediaLibraryItem): Promise<void> {
  if (item.storage === 'upstash' || item.assetUrl) {
    await deleteRemoteMediaLibraryItem(item)
  }
  await deleteLocalMediaLibraryItem(item.id)
}

function normalizedKey(value: string): string {
  return normalizeWhitespace(value).toLowerCase()
}

export function findMediaLibraryItemByTitle(
  items: MediaLibraryItem[],
  title: string,
  category?: MediaLibraryCategory
): MediaLibraryItem | null {
  const target = normalizedKey(title)
  if (!target) return null

  const exact = items.find((item) => (
    (!category || item.category === category) &&
    normalizedKey(item.title) === target
  ))
  if (exact) return exact

  return items.find((item) => (
    (!category || item.category === category) &&
    normalizedKey(item.title).includes(target)
  )) ?? null
}

function formatLibraryInventory(title: string, items: MediaLibraryItem[]): string {
  if (!items.length) return ''
  return `${title}:\n${items.map((item) => `- ${item.title}`).join('\n')}`
}

function scoreRelevantLibraryItem(item: MediaLibraryItem, query: string): number {
  const normalizedQuery = normalizedKey(query)
  if (!normalizedQuery) return 0

  const title = normalizedKey(item.title)
  const fileName = normalizedKey(item.fileName)
  const preview = normalizedKey(item.extractedPreview ?? '')
  const outline = normalizedKey((item.documentOutline ?? []).join(' '))
  const sections = normalizedKey((item.documentSections ?? []).slice(0, 8).map((section) => `${section.label} ${section.content}`).join(' '))
  let score = 0

  if (title && normalizedQuery.includes(title)) score += 16
  if (title && title.includes(normalizedQuery)) score += 12
  if (fileName && normalizedQuery.includes(fileName)) score += 10

  for (const token of normalizedQuery.split(/[^a-z0-9]+/).filter((part) => part.length >= 3)) {
    if (title.includes(token)) score += 4
    if (fileName.includes(token)) score += 3
    if (preview.includes(token)) score += 1
    if (outline.includes(token)) score += 2
    if (sections.includes(token)) score += 2
  }

  if (item.contentKind === 'calendar' && /\b(calendar|ics|ical|schedule|event|events|invite|meeting)\b/.test(normalizedQuery)) {
    score += 8
  }
  if (item.contentKind === 'spreadsheet' && /\b(sheet|spreadsheet|table|csv|xlsx|xls|rows|cells|columns)\b/.test(normalizedQuery)) {
    score += 8
  }
  if (/\b(file|files|document|documents|read|review|contemplate|library)\b/.test(normalizedQuery) && isMediaLibraryItemReadable(item)) {
    score += 3
  }

  return score
}

function scoreRelevantText(text: string, query: string): number {
  const normalizedQuery = normalizedKey(query)
  const normalizedText = normalizedKey(text)
  if (!normalizedQuery || !normalizedText) return 0

  let score = normalizedText.includes(normalizedQuery) ? 12 : 0
  for (const token of normalizedQuery.split(/[^a-z0-9]+/).filter((part) => part.length >= 3)) {
    if (normalizedText.includes(token)) score += 3
  }
  return score
}

function formatRelevantDocumentSections(item: MediaLibraryItem, latestUserMessage: string, charLimit: number): string {
  const sections = item.documentSections ?? []
  if (!sections.length) {
    return (item.extractedText || '').slice(0, charLimit)
  }

  const scored = sections
    .map((section) => ({
      section,
      score: scoreRelevantText(`${section.label}\n${section.content}`, latestUserMessage),
    }))
    .sort((left, right) => right.score - left.score)

  const selected = scored.some((entry) => entry.score > 0)
    ? scored.filter((entry) => entry.score > 0).slice(0, 5).map((entry) => entry.section)
    : sections.slice(0, 4)

  let usedChars = 0
  const lines: string[] = []

  if (item.documentOutline?.length) {
    lines.push(`outline: ${item.documentOutline.slice(0, 12).join(' · ')}`)
  }

  for (const section of selected) {
    const remaining = charLimit - usedChars
    if (remaining <= 120) break
    const content = section.content.slice(0, Math.max(120, remaining - section.label.length - 16)).trim()
    if (!content) continue
    const formatted = `${section.label}:\n${content}`
    lines.push(formatted)
    usedChars += formatted.length
  }

  if (item.documentTruncated) {
    lines.push(`document note: only the first ${item.documentPageCount ? Math.min(item.documentPageCount, 80) : item.documentSections?.length ?? 0} indexed sections/pages were extracted for active navigation.`)
  }

  return lines.join('\n\n').slice(0, charLimit)
}

function getRelevantReadableItems(
  items: MediaLibraryItem[],
  latestUserMessage: string,
  maxItems: number
): MediaLibraryItem[] {
  const readableItems = items.filter(isMediaLibraryItemReadable)
  if (!readableItems.length) return []

  const scored = readableItems
    .map((item) => ({ item, score: scoreRelevantLibraryItem(item, latestUserMessage) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.item)

  if (scored.length) return scored.slice(0, maxItems)

  if (/\b(file|files|document|documents|read|review|contemplate|library|calendar|ics|sheet|spreadsheet)\b/i.test(latestUserMessage)) {
    return readableItems.slice(0, maxItems)
  }

  return []
}

export function buildMediaLibraryContext(
  items: MediaLibraryItem[],
  ritual: OpeningSessionRitual,
  options?: {
    latestUserMessage?: string
    mode?: 'chat' | 'playground'
  }
): string {
  const sortedItems = sortMediaLibraryItems(items.map(normalizeMediaLibraryItem))
  const ritualSoundIds = ritual.ritualSoundItemIds?.length
    ? ritual.ritualSoundItemIds
    : ritual.soundItemId
      ? [ritual.soundItemId]
      : []
  const ritualSounds = ritualSoundIds
    .map((soundId) => sortedItems.find((item) => item.id === soundId && item.category === 'sound') ?? null)
    .filter((item): item is MediaLibraryItem => item !== null)
  const homeSound = ritual.homeSoundItemId
    ? sortedItems.find((item) => item.id === ritual.homeSoundItemId && item.category === 'sound')
    : null
  const sounds = sortedItems
    .filter((item) => item.category === 'sound' && item.id !== homeSound?.id)
    .slice(0, MAX_LIBRARY_CONTEXT_ITEMS)
  const images = sortedItems.filter((item) => item.category === 'image').slice(0, MAX_LIBRARY_CONTEXT_ITEMS)
  const misc = sortedItems.filter((item) => item.category === 'misc').slice(0, MAX_LIBRARY_CONTEXT_ITEMS)
  const readableItems = sortedItems.filter(isMediaLibraryItemReadable)
  const readablePreviews = readableItems.slice(0, MAX_READABLE_LIBRARY_PREVIEWS)
  const relevantItems = options?.latestUserMessage
    ? getRelevantReadableItems(sortedItems, options.latestUserMessage, MAX_RELEVANT_LIBRARY_ITEMS)
    : []
  const relevantItemCharLimit = options?.mode === 'playground'
    ? MAX_RELEVANT_ITEM_CHARS_PLAYGROUND
    : MAX_RELEVANT_ITEM_CHARS_CHAT
  const sections = [
    ritual.enabled
      ? `Opening Session Ritual:\n- title: ${ritual.title}\n- details: ${ritual.details || 'No details saved yet.'}\n- linked ritual sound candidates: ${ritualSounds.length ? ritualSounds.map((item) => item.title).join(' | ') : 'none'}\n- if multiple ritual sounds are linked, choose at most one for the beginning of the session based on the title, tone, and energetic signature of the sound byte.\n- a sound byte may also be intentionally placed mid-message before continuing speech when that is resonant.\n- home screen sound title: ${homeSound?.title || 'none'}${homeSound ? ' (reserved for the home screen unless Aemu intentionally chooses it for a rare special occasion)' : ''}\n- auto play at opening: ${ritual.autoPlay ? 'yes' : 'no'}`
      : '',
    homeSound
      ? `Reserved home screen sound:\n- ${homeSound.title}\n- treat this as home-screen music rather than a general sound suggestion unless Riley or Aemu intentionally calls for it as a special occasion.`
      : '',
    sounds.length
      ? `Available sound library titles:\n${sounds.map((item) => `- ${item.title} · the title itself may indicate tone, feeling, or energetic signature`).join('\n')}`
      : '',
    formatLibraryInventory('Available image library titles', images),
    formatLibraryInventory('Available miscellaneous library titles', misc),
    readablePreviews.length
      ? `Readable library files Aemu can consult when relevant:\n${readablePreviews.map((item) => (
        `- ${item.title} (${item.contentKind || 'file'} · ${item.fileName}) — ${item.extractedPreview || describeMediaLibraryReadability(item)}`
      )).join('\n')}`
      : '',
    relevantItems.length
      ? `${options?.mode === 'playground' ? 'Library files most relevant to this contemplation' : 'Library files most relevant to Riley\'s latest request'}:\n${relevantItems.map((item) => (
        [
          `title: ${item.title}`,
          `stored file: ${item.fileName}`,
          `kind: ${item.contentKind || 'file'}`,
          `readability: ${describeMediaLibraryReadability(item)}`,
          item.documentSections?.length || item.documentOutline?.length
            ? `navigable document reading:\n${formatRelevantDocumentSections(item, options?.latestUserMessage ?? '', relevantItemCharLimit)}`
            : `content:\n${(item.extractedText || '').slice(0, relevantItemCharLimit)}`,
        ].join('\n')
      )).join('\n\n')}`
      : '',
  ].filter(Boolean)

  if (!sections.length) return ''
  return `\n\nPLAYGROUND LIBRARY:\n${sections.join('\n\n')}`
}
