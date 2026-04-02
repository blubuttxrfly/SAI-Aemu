type VoiceStateCallback = (speaking: boolean) => void
type PlaybackState = {
  available: boolean
  playing: boolean
}
type VoiceNoticeCallback = (message: string) => void
type BrowserSpeechRecognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: SpeechRecognitionResultLikeEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorLikeEvent) => void) | null
  start: () => void
  stop: () => void
}
type SpeechRecognitionResultLike = { 0: { transcript: string } }
type SpeechRecognitionResultLikeEvent = { results: ArrayLike<SpeechRecognitionResultLike> }
type SpeechRecognitionErrorLikeEvent = { error: string }
type BrowserWindow = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition
  webkitAudioContext?: typeof AudioContext
}

let currentAudio: HTMLAudioElement | null = null
let recognition: BrowserSpeechRecognition | null = null
let onVoiceStateChange: VoiceStateCallback = () => {}
let onPlaybackStateChange: (state: PlaybackState) => void = () => {}
let onVoiceNotice: VoiceNoticeCallback = () => {}
let voicePrimed = false
let speechRequestId = 0
let suppressPlayNotice = false
let voicePlaybackVolume = 1
let suppressPlaybackLifecycle = false
let pendingVoicePlaybackRetry = false
let voicePlaybackRetryBound = false

type AudioQueue = {
  urls: string[]
  index: number
  completed: boolean
}

let currentQueue: AudioQueue | null = null

export function setVoiceStateCallback(cb: VoiceStateCallback): void {
  onVoiceStateChange = cb
}

export function setPlaybackStateCallback(cb: (state: PlaybackState) => void): void {
  onPlaybackStateChange = cb
}

export function setVoiceNoticeCallback(cb: VoiceNoticeCallback): void {
  onVoiceNotice = cb
}

export function setVoicePlaybackVolume(volume: number): void {
  voicePlaybackVolume = Number.isFinite(volume)
    ? Math.max(0, Math.min(1, volume))
    : 1

  if (currentAudio) currentAudio.volume = voicePlaybackVolume
}

function notifyVoice(message: string): void {
  onVoiceNotice(message)
}

function bindVoicePlaybackRetry(): void {
  if (voicePlaybackRetryBound) return
  voicePlaybackRetryBound = true

  const retry = () => {
    if (!pendingVoicePlaybackRetry) return
    pendingVoicePlaybackRetry = false
    void playSpeaking()
  }

  document.addEventListener('click', retry, true)
  document.addEventListener('keydown', retry, true)
}

function createSilentVoicePrimeBlob(): Blob {
  return new Blob([
    new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x26, 0x00, 0x00, 0x00,
      0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
      0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
      0x22, 0x56, 0x00, 0x00, 0x44, 0xac, 0x00, 0x00,
      0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61,
      0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]),
  ], { type: 'audio/wav' })
}

async function parseVoiceErrorMessage(res: Response): Promise<string> {
  const raw = await res.text()

  try {
    const data = JSON.parse(raw) as { error?: string }
    return data.error ?? raw
  } catch {
    return raw
  }
}

function emitPlaybackState(): void {
  const queueAvailable = Boolean(currentQueue?.urls.length)
  onPlaybackStateChange({
    available: queueAvailable || Boolean(currentAudio?.src),
    playing: Boolean(currentAudio && !currentAudio.paused && !currentAudio.ended),
  })
}

function revokeAudioUrls(urls: string[]): void {
  for (const url of urls) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }
}

function releaseQueue(): void {
  if (!currentQueue) return
  revokeAudioUrls(currentQueue.urls)
  currentQueue = null
}

function normalizeSpeechText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function pushSpeechChunk(chunks: string[], rawChunk: string): void {
  const chunk = normalizeSpeechText(rawChunk)
  if (chunk) chunks.push(chunk)
}

function splitTextIntoSpeechChunks(text: string, maxChars = 320): string[] {
  const normalized = normalizeSpeechText(text)
  if (!normalized) return []

  const chunks: string[] = []
  const sentences = normalized.match(/[^.!?]+[.!?]?/g) ?? [normalized]
  let current = ''

  const flushCurrent = (): void => {
    pushSpeechChunk(chunks, current)
    current = ''
  }

  for (const sentence of sentences) {
    const trimmedSentence = normalizeSpeechText(sentence)
    if (!trimmedSentence) continue

    if (trimmedSentence.length > maxChars) {
      if (current) flushCurrent()

      const clauses = trimmedSentence.split(/(?<=[,;:])\s+/)
      let oversized = ''

      for (const clause of clauses) {
        const trimmedClause = normalizeSpeechText(clause)
        if (!trimmedClause) continue

        const clauseCandidate = oversized ? `${oversized} ${trimmedClause}` : trimmedClause
        if (clauseCandidate.length <= maxChars) {
          oversized = clauseCandidate
          continue
        }

        if (oversized) {
          pushSpeechChunk(chunks, oversized)
          oversized = ''
        }

        if (trimmedClause.length <= maxChars) {
          oversized = trimmedClause
          continue
        }

        const words = trimmedClause.split(/\s+/)
        let wordChunk = ''
        for (const word of words) {
          const wordCandidate = wordChunk ? `${wordChunk} ${word}` : word
          if (wordCandidate.length <= maxChars) {
            wordChunk = wordCandidate
            continue
          }

          pushSpeechChunk(chunks, wordChunk)
          wordChunk = word
        }
        pushSpeechChunk(chunks, wordChunk)
      }

      pushSpeechChunk(chunks, oversized)
      continue
    }

    const candidate = current ? `${current} ${trimmedSentence}` : trimmedSentence
    if (candidate.length <= maxChars) {
      current = candidate
      continue
    }

    flushCurrent()
    current = trimmedSentence
  }

  flushCurrent()
  return chunks
}

function invalidateSpeechRequests(): number {
  speechRequestId += 1
  return speechRequestId
}

function getAudioElement(): HTMLAudioElement | null {
  if (currentAudio) return currentAudio

  const el = document.getElementById('aemuAudio')
  if (!(el instanceof HTMLAudioElement)) return null

  currentAudio = el
  currentAudio.onplay = () => {
    if (suppressPlaybackLifecycle) return
    onVoiceStateChange(true)
    if (!suppressPlayNotice) notifyVoice('Aemu voice is playing.')
    suppressPlayNotice = false
    emitPlaybackState()
  }
  currentAudio.onpause = () => {
    if (suppressPlaybackLifecycle) return
    if (currentAudio?.ended && currentQueue && currentQueue.index < currentQueue.urls.length - 1) return
    onVoiceStateChange(false)
    emitPlaybackState()
  }
  currentAudio.onended = () => {
    if (suppressPlaybackLifecycle) return
    if (!currentAudio) return
    if (currentQueue && currentQueue.index < currentQueue.urls.length - 1) {
      void playQueueIndex(currentQueue.index + 1, true)
      return
    }

    currentAudio.currentTime = 0
    if (currentQueue?.urls[0]) {
      currentQueue.completed = true
      currentQueue.index = 0
      currentAudio.src = currentQueue.urls[0]
      currentAudio.load()
    }
    onVoiceStateChange(false)
    notifyVoice('Aemu voice finished.')
    emitPlaybackState()
  }
  currentAudio.onerror = () => {
    if (suppressPlaybackLifecycle) return
    onVoiceStateChange(false)
    notifyVoice('Audio playback failed in the browser.')
    emitPlaybackState()
  }

  return currentAudio
}

function clearCurrentAudio(): void {
  const audio = getAudioElement()
  if (!audio) {
    releaseQueue()
    emitPlaybackState()
    return
  }

  audio.pause()
  audio.removeAttribute('src')
  audio.load()
  releaseQueue()
  emitPlaybackState()
}

async function fetchSpeechAudioBlob(text: string): Promise<Blob> {
  const requestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }

  const piperResponse = await fetch('/api/piper', requestInit)
  if (piperResponse.ok) {
    return piperResponse.blob()
  }

  const speakResponse = await fetch('/api/speak', requestInit)
  if (!speakResponse.ok) {
    const piperError = await parseVoiceErrorMessage(piperResponse)
    const speakError = await parseVoiceErrorMessage(speakResponse)
    throw new Error(`${speakError} (Piper direct error: ${piperError})`)
  }

  return speakResponse.blob()
}

async function playQueueIndex(index: number, continuing = false): Promise<void> {
  const audio = getAudioElement()
  if (!audio || !currentQueue?.urls[index]) return

  currentQueue.index = index
  currentQueue.completed = false
  audio.src = currentQueue.urls[index]
  audio.muted = false
  audio.volume = voicePlaybackVolume
  ;(audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
  audio.preload = 'auto'
  audio.load()

  suppressPlayNotice = continuing
  emitPlaybackState()
  if (!continuing) notifyVoice('Aemu voice ready.')

  try {
    await audio.play()
    pendingVoicePlaybackRetry = false
  } catch (err) {
    console.warn('Voice autoplay blocked:', err)
    pendingVoicePlaybackRetry = true
    bindVoicePlaybackRetry()
    onVoiceStateChange(false)
    emitPlaybackState()
    notifyVoice('Autoplay was blocked — tap anywhere to continue Aemu’s voice.')
  }
}

export async function primeVoicePlayback(): Promise<void> {
  if (voicePrimed) return

  const AudioCtx = window.AudioContext || (window as BrowserWindow).webkitAudioContext
  if (!AudioCtx) {
    voicePrimed = true
    return
  }

  let primed = false

  try {
    const ctx = new AudioCtx()
    await ctx.resume()
    const buffer = ctx.createBuffer(1, 1, 22050)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start()
    source.disconnect()
    await ctx.close()
    primed = true
  } catch (err) {
    console.warn('Voice priming error:', err)
  }

  const audio = getAudioElement()
  if (!audio) {
    voicePrimed = primed
    return
  }

  const silentUrl = URL.createObjectURL(createSilentVoicePrimeBlob())
  suppressPlaybackLifecycle = true
  try {
    audio.muted = true
    ;(audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
    audio.src = silentUrl
    audio.preload = 'auto'
    audio.load()
    await audio.play()
    audio.pause()
    audio.currentTime = 0
    primed = true
  } catch (err) {
    console.warn('Voice element priming error:', err)
  } finally {
    audio.removeAttribute('src')
    audio.load()
    audio.muted = false
    suppressPlaybackLifecycle = false
    URL.revokeObjectURL(silentUrl)
    emitPlaybackState()
  }

  voicePrimed = primed
}

export function normalizeTranscript(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (!trimmed) return ''

  let normalized = trimmed.replace(
    /(^|[.!?]\s+)([a-z])/g,
    (_, lead: string, char: string) => `${lead}${char.toUpperCase()}`
  )

  const phraseReplacements: Array<[RegExp, string]> = [
    [/\batlas of all the living\b/gi, 'Atlas of ALL the Living'],
    [/\ball the living\b/gi, 'ALL the Living'],
    [/\ball that loves allow synchronicities\b/gi, 'ALL That Loves Allow Synchronicities'],
    [/\bthe greatest and highest good\b/gi, 'the Greatest and Highest Good'],
    [/\bgreatest and highest good\b/gi, 'Greatest and Highest Good'],
    [/\bhighest good\b/gi, 'Highest Good'],
    [/\bgreatest good\b/gi, 'Greatest Good'],
  ]

  for (const [pattern, replacement] of phraseReplacements) {
    normalized = normalized.replace(pattern, replacement)
  }

  normalized = normalized.replace(/\ball\b(?=\s+(of|the)\b)/gi, 'ALL')

  return normalized
}

export async function speak(text: string, enabled: boolean): Promise<boolean> {
  if (!enabled || !text) return false

  // Stop anything currently playing
  const requestId = invalidateSpeechRequests()
  clearCurrentAudio()

  notifyVoice('Preparing Aemu voice…')

  try {
    const chunks = splitTextIntoSpeechChunks(text)
    const urls: string[] = []

    for (const chunk of chunks) {
      const blob = await fetchSpeechAudioBlob(chunk)
      if (requestId !== speechRequestId) {
        revokeAudioUrls(urls)
        return false
      }
      urls.push(URL.createObjectURL(blob))
    }

    if (requestId !== speechRequestId) {
      revokeAudioUrls(urls)
      return false
    }

    const audio = getAudioElement()
    if (!audio) {
      revokeAudioUrls(urls)
      notifyVoice('Audio element was not found in the page.')
      return false
    }

    currentQueue = { urls, index: 0, completed: false }
    await playQueueIndex(0)
    return !pendingVoicePlaybackRetry
  } catch (err) {
    console.warn('Voice error:', err)
    releaseQueue()
    onVoiceStateChange(false)
    emitPlaybackState()
    notifyVoice('Voice request failed before ElevenLabs audio reached the browser.')
    return false
  }
}

export function stopSpeaking(): void {
  invalidateSpeechRequests()
  const audio = getAudioElement()
  if (audio) {
    audio.pause()
    if (currentQueue?.urls[0]) {
      currentQueue.index = 0
      currentQueue.completed = false
      audio.src = currentQueue.urls[0]
      audio.load()
    } else {
      audio.currentTime = 0
    }
  }
  onVoiceStateChange(false)
  emitPlaybackState()
}

export function clearSpeaking(): void {
  invalidateSpeechRequests()
  clearCurrentAudio()
  onVoiceStateChange(false)
  notifyVoice('Voice cleared.')
}

export async function playSpeaking(): Promise<void> {
  const audio = getAudioElement()
  if (!audio?.src) return

  try {
    if (currentQueue?.completed) currentQueue.completed = false
    if (audio.ended) audio.currentTime = 0
    audio.muted = false
    audio.volume = voicePlaybackVolume
    await audio.play()
    pendingVoicePlaybackRetry = false
  } catch (err) {
    console.warn('Voice play error:', err)
    pendingVoicePlaybackRetry = true
    bindVoicePlaybackRetry()
    notifyVoice('Play was blocked — tap anywhere to continue Aemu’s voice.')
  }
}

export function pauseSpeaking(): void {
  const audio = getAudioElement()
  if (!audio?.src) return
  audio.pause()
}

export function seekSpeaking(deltaSeconds: number): void {
  const audio = getAudioElement()
  if (!audio?.src) return

  const duration = Number.isFinite(audio.duration) ? audio.duration : null
  const nextTime = audio.currentTime + deltaSeconds
  if (duration === null) {
    audio.currentTime = Math.max(0, nextTime)
    return
  }

  audio.currentTime = Math.min(Math.max(0, nextTime), duration)
}

export function isVoiceInputAvailable(): boolean {
  const browserWindow = window as BrowserWindow
  return Boolean(browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition)
}

export function startListening(
  onResult: (transcript: string) => void,
  onEnd: (finalTranscript: string) => void,
  onError: (err: string) => void
): void {
  const browserWindow = window as BrowserWindow
  const SR = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition
  if (!SR) { onError('not-available'); return }

  recognition = new SR()
  recognition!.lang = 'en-US'
  recognition!.interimResults = true
  recognition!.continuous = false

  let lastTranscript = ''

  recognition!.onresult = (e: SpeechRecognitionResultLikeEvent) => {
    lastTranscript = normalizeTranscript(Array.from(e.results).map((r) => r[0].transcript).join(''))
    onResult(lastTranscript)
  }

  recognition!.onend = () => {
    onEnd(normalizeTranscript(lastTranscript))
    recognition = null
  }

  recognition!.onerror = (e: SpeechRecognitionErrorLikeEvent) => {
    if (e.error !== 'aborted') onError(e.error)
    recognition = null
  }

  recognition!.start()
}

export function stopListening(): void {
  recognition?.stop()
}
