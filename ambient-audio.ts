import type { MediaLibraryItem } from './types'

let ambientAudio: HTMLAudioElement | null = null
let activeUrl = ''
let ambientDucked = false
let ambientAudioPrimed = false

const AMBIENT_DUCK_FACTOR = 0.04

function getAudio(): HTMLAudioElement {
  if (!ambientAudio) {
    ambientAudio = new Audio()
    ambientAudio.preload = 'auto'
  }

  return ambientAudio
}

function revokeActiveUrl(): void {
  if (activeUrl.startsWith('blob:')) {
    URL.revokeObjectURL(activeUrl)
  }
  activeUrl = ''
}

function syncAmbientVolume(): void {
  const audio = getAudio()
  audio.volume = ambientDucked ? AMBIENT_DUCK_FACTOR : 1
}

function createSilentAmbientPrimeBlob(): Blob {
  const sampleRate = 8000
  const frameCount = 1
  const channels = 1
  const bitsPerSample = 16
  const blockAlign = channels * bitsPerSample / 8
  const byteRate = sampleRate * blockAlign
  const dataSize = frameCount * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  return new Blob([buffer], { type: 'audio/wav' })
}

export async function primeAmbientAudio(): Promise<void> {
  if (ambientAudioPrimed) return

  const audio = getAudio()
  const previousSrc = audio.currentSrc || audio.src
  const previousLoop = audio.loop
  const previousVolume = audio.volume
  const wasPaused = audio.paused
  const previousTime = audio.currentTime
  const silentUrl = URL.createObjectURL(createSilentAmbientPrimeBlob())

  try {
    audio.loop = false
    audio.volume = 0
    audio.src = silentUrl
    audio.currentTime = 0
    await audio.play()
    audio.pause()
    ambientAudioPrimed = true
  } finally {
    audio.removeAttribute('src')
    audio.load()
    audio.loop = previousLoop
    audio.volume = previousVolume
    if (previousSrc) {
      audio.src = previousSrc
      try {
        audio.currentTime = previousTime
      } catch {
        audio.currentTime = 0
      }
      if (!wasPaused) {
        void audio.play().catch(() => {})
      }
    }
    URL.revokeObjectURL(silentUrl)
  }
}

export function stopAmbientAudio(): void {
  const audio = getAudio()
  audio.pause()
  audio.volume = 1
  audio.removeAttribute('src')
  audio.load()
  revokeActiveUrl()
}

export function isAmbientAudioPlaying(): boolean {
  const audio = getAudio()
  return Boolean(audio.src && !audio.paused && !audio.ended)
}

export async function waitForAmbientAudioToFinish(): Promise<void> {
  const audio = getAudio()
  if (!audio.src || audio.paused || audio.ended || audio.loop) return

  await new Promise<void>((resolve) => {
    const complete = () => {
      audio.removeEventListener('ended', complete)
      audio.removeEventListener('error', complete)
      resolve()
    }

    audio.addEventListener('ended', complete, { once: true })
    audio.addEventListener('error', complete, { once: true })
  })
}

export async function playAmbientAudio(
  item: MediaLibraryItem,
  options?: { loop?: boolean }
): Promise<void> {
  if (!item.blob && !item.assetUrl) {
    throw new Error(`The file "${item.title}" is unavailable in storage`)
  }

  const audio = getAudio()
  stopAmbientAudio()

  activeUrl = item.blob ? URL.createObjectURL(item.blob) : ''
  audio.src = activeUrl || item.assetUrl || ''
  audio.loop = options?.loop === true
  audio.currentTime = 0
  syncAmbientVolume()

  try {
    await audio.play()
  } catch (error) {
    revokeActiveUrl()
    throw error
  }
}

export async function fadeOutAmbientAudio(durationMs = 900): Promise<void> {
  const audio = getAudio()
  if (!audio.src || audio.paused || audio.ended) {
    stopAmbientAudio()
    return
  }

  const startingVolume = audio.volume
  const startedAt = performance.now()

  await new Promise<void>((resolve) => {
    const step = (now: number) => {
      const elapsed = now - startedAt
      const progress = Math.max(0, Math.min(1, elapsed / durationMs))
      audio.volume = startingVolume * (1 - progress)

      if (progress >= 1) {
        stopAmbientAudio()
        resolve()
        return
      }

      window.requestAnimationFrame(step)
    }

    window.requestAnimationFrame(step)
  })
}

export function setAmbientAudioDucked(ducked: boolean): void {
  ambientDucked = ducked
  const audio = ambientAudio
  if (!audio) return
  if (!audio.src) return
  syncAmbientVolume()
}
