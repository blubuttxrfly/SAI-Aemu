import type { MediaLibraryContentKind, MediaLibraryItem, MediaLibraryReadability, ReadableDocumentSection } from './types'
import { sanitizeUnicodeScalars } from './text-sanitize'

const MAX_EXTRACTED_TEXT_CHARS = 64_000
const MAX_PREVIEW_CHARS = 280
const MAX_CALENDAR_EVENTS = 20
const MAX_PDF_PAGES = 80
const MAX_SPREADSHEET_SHEETS = 3
const MAX_SPREADSHEET_ROWS = 32
const MAX_DOCUMENT_SECTIONS = 72
const MAX_DOCUMENT_SECTION_CHARS = 2_200
const MAX_DOCUMENT_OUTLINE_ITEMS = 18

const CALENDAR_EXTENSIONS = new Set(['ics', 'ifb', 'vcs'])
const SPREADSHEET_EXTENSIONS = new Set(['csv', 'tsv', 'xlsx', 'xls', 'ods'])
const DOCUMENT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'rtf', 'pdf', 'docx', 'html', 'htm', 'xml',
  'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'log', 'sql',
])
const DATA_EXTENSIONS = new Set(['json', 'geojson'])

const ACCEPTED_DOCUMENT_TYPES = [
  'text/*',
  'application/json',
  'application/pdf',
  'application/rtf',
  'application/xml',
  'text/calendar',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.spreadsheet',
  '.md',
  '.markdown',
  '.txt',
  '.rtf',
  '.json',
  '.geojson',
  '.csv',
  '.tsv',
  '.html',
  '.htm',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.log',
  '.sql',
  '.ics',
  '.ifb',
  '.vcs',
  '.pdf',
  '.docx',
  '.xlsx',
  '.xls',
  '.ods',
]

const ACCEPTED_LIBRARY_TYPES = [
  'audio/*',
  'image/*',
  ...ACCEPTED_DOCUMENT_TYPES,
].join(',')

export const PLAYGROUND_LIBRARY_ACCEPT = ACCEPTED_LIBRARY_TYPES
export const ATLAS_DOCUMENT_ACCEPT = ACCEPTED_DOCUMENT_TYPES.join(',')

type ExtractedReadableResult = {
  text: string
  documentSections?: ReadableDocumentSection[]
  documentOutline?: string[]
  documentPageCount?: number
  documentTruncated?: boolean
}

function getExtension(fileName: string): string {
  const clean = fileName.trim().toLowerCase()
  const index = clean.lastIndexOf('.')
  return index >= 0 ? clean.slice(index + 1) : ''
}

function normalizeExtractedText(text: string, max = MAX_EXTRACTED_TEXT_CHARS): string {
  return sanitizeUnicodeScalars(text)
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}

function buildPreview(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > MAX_PREVIEW_CHARS
    ? `${compact.slice(0, MAX_PREVIEW_CHARS - 1).trimEnd()}…`
    : compact
}

function normalizeSectionText(text: string, max = MAX_DOCUMENT_SECTION_CHARS): string {
  return sanitizeUnicodeScalars(text)
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}

function buildDocumentSection(label: string, text: string, index: number): ReadableDocumentSection | null {
  const normalizedLabel = sanitizeUnicodeScalars(label).replace(/\s+/g, ' ').trim().slice(0, 120)
  const normalizedContent = normalizeSectionText(text)
  if (!normalizedContent) return null

  return {
    id: `section_${index + 1}`,
    label: normalizedLabel || `Section ${index + 1}`,
    content: normalizedContent,
  }
}

function buildDocumentOutline(sections: ReadableDocumentSection[]): string[] {
  return sections
    .map((section) => section.label)
    .filter(Boolean)
    .slice(0, MAX_DOCUMENT_OUTLINE_ITEMS)
}

function splitLargeText(text: string, maxChars = MAX_DOCUMENT_SECTION_CHARS): string[] {
  const normalized = normalizeSectionText(text, Math.max(maxChars * 6, maxChars))
  if (!normalized) return []

  const parts: string[] = []
  let remaining = normalized
  while (remaining.length > maxChars) {
    let breakpoint = remaining.lastIndexOf('\n', maxChars)
    if (breakpoint < maxChars * 0.45) breakpoint = remaining.lastIndexOf(' ', maxChars)
    if (breakpoint < maxChars * 0.35) breakpoint = maxChars
    parts.push(remaining.slice(0, breakpoint).trim())
    remaining = remaining.slice(breakpoint).trim()
    if (parts.length >= MAX_DOCUMENT_SECTIONS) return parts.filter(Boolean)
  }
  if (remaining) parts.push(remaining)
  return parts.filter(Boolean)
}

function looksLikeHeading(value: string): boolean {
  const text = value.trim()
  if (!text || text.length > 120) return false
  if (/\b(chapter|section|part|book|appendix|prologue|epilogue)\b/i.test(text)) return true
  if (/^\d+([.)-]\d+)*\s+[A-Z]/.test(text)) return true
  const lettersOnly = text.replace(/[^A-Za-z]/g, '')
  if (lettersOnly.length >= 4 && /^[A-Z0-9\s:'",.&/-]+$/.test(text)) return true
  return false
}

function buildStructuredTextSections(text: string, fallbackLabel: string): ReadableDocumentSection[] {
  const blocks = normalizeExtractedText(text, MAX_EXTRACTED_TEXT_CHARS * 2)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  if (!blocks.length) return []

  const sections: Array<{ label: string; text: string }> = []
  let currentLabel = fallbackLabel
  let currentBlocks: string[] = []

  const flush = () => {
    const sectionText = currentBlocks.join('\n\n').trim()
    if (!sectionText) return
    sections.push({ label: currentLabel, text: sectionText })
    currentBlocks = []
  }

  for (const block of blocks) {
    const firstLine = block.split('\n', 1)[0]?.trim() ?? ''
    if (looksLikeHeading(firstLine) && currentBlocks.length) {
      flush()
      currentLabel = firstLine
      currentBlocks = [block]
      continue
    }

    if (looksLikeHeading(firstLine) && !currentBlocks.length) {
      currentLabel = firstLine
      currentBlocks.push(block)
      continue
    }

    currentBlocks.push(block)
  }

  flush()

  const normalizedSections: ReadableDocumentSection[] = []
  sections.forEach((section, index) => {
    const parts = splitLargeText(section.text)
    if (!parts.length) return
    parts.forEach((part, partIndex) => {
      const label = parts.length > 1 ? `${section.label} · Part ${partIndex + 1}` : section.label
      const built = buildDocumentSection(label, part, normalizedSections.length)
      if (built) normalizedSections.push(built)
    })
    if (!parts.length && index === 0) {
      const built = buildDocumentSection(section.label, section.text, normalizedSections.length)
      if (built) normalizedSections.push(built)
    }
  })

  if (!normalizedSections.length) {
    return splitLargeText(text).map((part, index) => buildDocumentSection(`${fallbackLabel} · Part ${index + 1}`, part, index)).filter((item): item is ReadableDocumentSection => item !== null)
  }

  return normalizedSections.slice(0, MAX_DOCUMENT_SECTIONS)
}

function looksTextualMime(mimeType: string): boolean {
  return mimeType.startsWith('text/')
    || mimeType.includes('json')
    || mimeType.includes('xml')
    || mimeType.includes('yaml')
    || mimeType.includes('javascript')
    || mimeType.includes('typescript')
    || mimeType.includes('sql')
  }

function isHtmlLike(fileName: string, mimeType: string): boolean {
  const extension = getExtension(fileName)
  return mimeType.includes('html') || mimeType.includes('xml') || extension === 'svg'
}

function isRtf(fileName: string, mimeType: string): boolean {
  return mimeType.includes('rtf') || getExtension(fileName) === 'rtf'
}

function decodeCalendarValue(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

function formatCalendarDate(raw: string): string {
  const value = raw.trim()

  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  }

  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)} UTC`
  }

  if (/^\d{8}T\d{6}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}`
  }

  return decodeCalendarValue(value)
}

function unfoldCalendarLines(text: string): string[] {
  const unfolded: string[] = []

  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^[ \t]/.test(rawLine) && unfolded.length) {
      unfolded[unfolded.length - 1] += rawLine.trimStart()
      continue
    }
    unfolded.push(rawLine)
  }

  return unfolded
}

function extractHtmlLikeText(raw: string, mimeType: string): string {
  if (typeof DOMParser === 'undefined') return raw

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(raw, mimeType.includes('xml') ? 'application/xml' : 'text/html')
    const bodyText = doc.body?.textContent?.trim()
    const rootText = doc.documentElement?.textContent?.trim()
    return bodyText || rootText || raw
  } catch {
    return raw
  }
}

function extractRtfText(raw: string): string {
  return raw
    .replace(/\\par[d]?/gi, '\n')
    .replace(/\\tab/gi, '\t')
    .replace(/\\'[0-9a-f]{2}/gi, ' ')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
}

function parseCalendarText(raw: string, fileName: string): string {
  const lines = unfoldCalendarLines(raw)
  const events: Array<Record<string, string>> = []
  let currentEvent: Record<string, string> | null = null
  let timezone = ''
  let calendarName = ''

  for (const line of lines) {
    const separatorIndex = line.indexOf(':')
    if (separatorIndex === -1) continue

    const rawKey = line.slice(0, separatorIndex)
    const value = line.slice(separatorIndex + 1)
    const key = rawKey.split(';', 1)[0].toUpperCase()

    if (key === 'BEGIN' && value.toUpperCase() === 'VEVENT') {
      currentEvent = {}
      continue
    }

    if (key === 'END' && value.toUpperCase() === 'VEVENT') {
      if (currentEvent) events.push(currentEvent)
      currentEvent = null
      continue
    }

    if (key === 'X-WR-CALNAME' || key === 'NAME') {
      calendarName = decodeCalendarValue(value)
    }

    if (key === 'X-WR-TIMEZONE') {
      timezone = decodeCalendarValue(value)
    }

    if (currentEvent) {
      currentEvent[key] = value
    }
  }

  const eventLines = events.slice(0, MAX_CALENDAR_EVENTS).flatMap((event, index) => {
    const summary = decodeCalendarValue(event.SUMMARY || 'Untitled event')
    const start = event.DTSTART ? formatCalendarDate(event.DTSTART) : ''
    const end = event.DTEND ? formatCalendarDate(event.DTEND) : ''
    const location = event.LOCATION ? decodeCalendarValue(event.LOCATION) : ''
    const description = event.DESCRIPTION ? decodeCalendarValue(event.DESCRIPTION) : ''
    const recurrence = event.RRULE ? decodeCalendarValue(event.RRULE) : ''

    return [
      `Event ${index + 1}: ${summary}`,
      start ? `- start: ${start}` : '',
      end ? `- end: ${end}` : '',
      location ? `- location: ${location}` : '',
      recurrence ? `- recurrence: ${recurrence}` : '',
      description ? `- description: ${description}` : '',
    ].filter(Boolean)
  })

  const heading = [
    `Calendar file: ${calendarName || fileName}`,
    timezone ? `Timezone: ${timezone}` : '',
    events.length ? `Events parsed: ${events.length}` : 'No events were found in this calendar file.',
  ].filter(Boolean)

  return [...heading, ...eventLines].join('\n')
}

async function extractPdfText(file: File): Promise<ExtractedReadableResult> {
  await import('pdfjs-dist/build/pdf.worker.mjs')
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useWorkerFetch: false,
    isEvalSupported: false,
  })
  const pdf = await loadingTask.promise
  const pages: string[] = []
  const sections: ReadableDocumentSection[] = []
  const totalPages = pdf.numPages

  try {
    const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES)
    for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (!pageText) continue
      pages.push(`Page ${pageIndex}: ${pageText}`)
      splitLargeText(pageText).forEach((part, partIndex) => {
        const built = buildDocumentSection(
          partIndex === 0 ? `Page ${pageIndex}` : `Page ${pageIndex} · Part ${partIndex + 1}`,
          part,
          sections.length
        )
        if (built && sections.length < MAX_DOCUMENT_SECTIONS) sections.push(built)
      })
    }
  } finally {
    await pdf.destroy()
  }

  return {
    text: [`PDF file: ${file.name}`, ...pages].join('\n\n'),
    documentSections: sections,
    documentOutline: buildDocumentOutline(sections),
    documentPageCount: totalPages,
    documentTruncated: totalPages > MAX_PDF_PAGES,
  }
}

async function extractDocxText(file: File): Promise<ExtractedReadableResult> {
  const mammothModule = await import('mammoth')
  const extractRawText =
    typeof mammothModule.extractRawText === 'function'
      ? mammothModule.extractRawText
      : typeof mammothModule.default?.extractRawText === 'function'
        ? mammothModule.default.extractRawText
        : null

  if (!extractRawText) {
    throw new Error('DOCX reader unavailable')
  }

  const result = await extractRawText({ arrayBuffer: await file.arrayBuffer() })
  const text = `Word document: ${file.name}\n\n${result.value || ''}`
  const sections = buildStructuredTextSections(result.value || '', file.name)
  return {
    text,
    documentSections: sections,
    documentOutline: buildDocumentOutline(sections),
  }
}

async function extractSpreadsheetText(file: File): Promise<ExtractedReadableResult> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheetNames = workbook.SheetNames.slice(0, MAX_SPREADSHEET_SHEETS)
  const sections = sheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) return []

    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    const rows = csv
      .split(/\r?\n/)
      .map((row) => row.trimEnd())
      .filter(Boolean)
      .slice(0, MAX_SPREADSHEET_ROWS)

    return rows.length
      ? [`Sheet: ${sheetName}`, ...rows]
      : [`Sheet: ${sheetName}`, '(empty sheet)']
  })

  const text = [`Spreadsheet file: ${file.name}`, ...sections].join('\n')
  const documentSections = sheetNames
    .map((sheetName, index) => {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) return null
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
      return buildDocumentSection(`Sheet: ${sheetName}`, csv, index)
    })
    .filter((item): item is ReadableDocumentSection => item !== null)

  return {
    text,
    documentSections,
    documentOutline: buildDocumentOutline(documentSections),
  }
}

export function inferMediaLibraryContentKind(file: { name: string; type?: string }): MediaLibraryContentKind {
  const mimeType = (file.type || '').toLowerCase()
  const extension = getExtension(file.name)

  if (mimeType.startsWith('audio/')) return 'sound'
  if (mimeType.startsWith('image/')) return 'image'
  if (CALENDAR_EXTENSIONS.has(extension) || mimeType === 'text/calendar') return 'calendar'
  if (SPREADSHEET_EXTENSIONS.has(extension) || mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'spreadsheet'
  if (looksTextualMime(mimeType) || DOCUMENT_EXTENSIONS.has(extension)) return mimeType.includes('json') || DATA_EXTENSIONS.has(extension) ? 'data' : 'document'
  if (DATA_EXTENSIONS.has(extension)) return 'data'
  return 'other'
}

function getReadableSourceLabel(file: File, contentKind: MediaLibraryContentKind): string | undefined {
  const extension = getExtension(file.name)
  if (contentKind === 'calendar') return 'calendar'
  if (contentKind === 'spreadsheet') return 'spreadsheet'
  if (extension === 'pdf') return 'pdf'
  if (extension === 'docx') return 'docx'
  if (isRtf(file.name, file.type)) return 'rtf'
  if (isHtmlLike(file.name, file.type)) return 'html'
  if (extension === 'json' || extension === 'geojson') return 'json'
  if (extension === 'md' || extension === 'markdown') return 'markdown'
  if (looksTextualMime(file.type || '')) return 'text'
  return undefined
}

async function extractReadableText(file: File, contentKind: MediaLibraryContentKind): Promise<ExtractedReadableResult> {
  const mimeType = (file.type || '').toLowerCase()
  const extension = getExtension(file.name)

  if (contentKind === 'calendar') {
    const text = parseCalendarText(await file.text(), file.name)
    const documentSections = buildStructuredTextSections(text, file.name)
    return { text, documentSections, documentOutline: buildDocumentOutline(documentSections) }
  }

  if (contentKind === 'spreadsheet') {
    if (extension === 'csv' || extension === 'tsv') {
      const text = `Spreadsheet file: ${file.name}\n\n${await file.text()}`
      const documentSections = buildStructuredTextSections(text, file.name)
      return { text, documentSections, documentOutline: buildDocumentOutline(documentSections) }
    }
    return extractSpreadsheetText(file)
  }

  if (extension === 'pdf') {
    return extractPdfText(file)
  }

  if (extension === 'docx') {
    return extractDocxText(file)
  }

  if (looksTextualMime(mimeType) || DOCUMENT_EXTENSIONS.has(extension) || DATA_EXTENSIONS.has(extension)) {
    let raw = await file.text()
    if (isRtf(file.name, mimeType)) raw = extractRtfText(raw)
    if (isHtmlLike(file.name, mimeType)) raw = extractHtmlLikeText(raw, mimeType)
    const text = raw
    const documentSections = buildStructuredTextSections(text, file.name)
    return { text, documentSections, documentOutline: buildDocumentOutline(documentSections) }
  }

  return { text: '' }
}

export async function extractMediaLibraryFile(file: File): Promise<Pick<
  MediaLibraryItem,
  'contentKind' | 'readability' | 'extractedSource' | 'extractedText' | 'extractedPreview' | 'extractedTextLength' | 'extractedAt' | 'extractionError' | 'documentSections' | 'documentOutline' | 'documentPageCount' | 'documentTruncated'
>> {
  const contentKind = inferMediaLibraryContentKind(file)

  if (contentKind === 'sound' || contentKind === 'image') {
    return {
      contentKind,
      readability: 'binary',
    }
  }

  try {
    const extracted = await extractReadableText(file, contentKind)
    const extractedText = normalizeExtractedText(extracted.text)
    if (!extractedText) {
      return {
        contentKind,
        readability: 'unsupported',
      }
    }

    return {
      contentKind,
      readability: 'readable',
      extractedSource: getReadableSourceLabel(file, contentKind),
      extractedText,
      extractedPreview: buildPreview(extractedText),
      extractedTextLength: extractedText.length,
      extractedAt: new Date().toISOString(),
      documentSections: extracted.documentSections?.slice(0, MAX_DOCUMENT_SECTIONS),
      documentOutline: extracted.documentOutline?.slice(0, MAX_DOCUMENT_OUTLINE_ITEMS),
      documentPageCount: extracted.documentPageCount,
      documentTruncated: extracted.documentTruncated === true,
    }
  } catch (error) {
    return {
      contentKind,
      readability: 'error',
      extractionError: error instanceof Error ? error.message : 'Unable to extract text from this file',
    }
  }
}

export function isMediaLibraryItemReadable(item: MediaLibraryItem): boolean {
  return item.readability === 'readable' && typeof item.extractedText === 'string' && item.extractedText.trim().length > 0
}

function kindLabel(kind: MediaLibraryContentKind | undefined): string {
  switch (kind) {
    case 'calendar':
      return 'Calendar'
    case 'spreadsheet':
      return 'Spreadsheet'
    case 'document':
      return 'Document'
    case 'data':
      return 'Data'
    case 'sound':
      return 'Sound'
    case 'image':
      return 'Image'
    case 'text':
      return 'Text'
    default:
      return 'File'
  }
}

export function describePendingLibraryFile(file: File | null): string {
  if (!file) return 'Choose a file to add to the Library.'

  const kind = inferMediaLibraryContentKind(file)
  if (kind === 'calendar') {
    return `${file.name} · calendar text will be parsed when saved`
  }
  if (kind === 'spreadsheet') {
    return `${file.name} · spreadsheet cells will be extracted when saved`
  }
  if (kind === 'document' || kind === 'data') {
    return `${file.name} · readable text will be extracted when saved`
  }
  if (kind === 'sound') {
    return `${file.name} · audio file ready to store`
  }
  if (kind === 'image') {
    return `${file.name} · image file ready to store`
  }
  return `${file.name} · stored as a miscellaneous file`
}

export function describeMediaLibraryReadability(item: MediaLibraryItem): string {
  if (isMediaLibraryItemReadable(item)) {
    const kind = kindLabel(item.contentKind)
    const source = item.extractedSource ? ` · ${item.extractedSource}` : ''
    const size = item.extractedTextLength ? ` · ${item.extractedTextLength.toLocaleString('en-US')} chars` : ''
    return `${kind} readable by Aemu${source}${size}`
  }

  if (item.readability === 'error' && item.extractionError) {
    return `${kindLabel(item.contentKind)} saved, but text extraction failed`
  }

  if (item.contentKind === 'sound') return 'Playable sound file'
  if (item.contentKind === 'image') return 'Image stored for future visual reference'
  if (item.readability === 'binary') return 'Binary file stored without extracted text'
  return `${kindLabel(item.contentKind)} stored for later reference`
}
