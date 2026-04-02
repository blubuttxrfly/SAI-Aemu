import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { VercelRequest, VercelResponse } from '@vercel/node'

type ElevenVoice = {
  voice_id?: string
  name?: string | null
}

type PiperRuntime = {
  pythonPath: string
  modelId: string
  dataDir: string
}

type PiperHttpResponse = {
  mimeType: string
  audio: Buffer
}

let cachedVoiceName = ''
let cachedVoiceId = ''

function parseJsonBody<T>(req: VercelRequest): T | null {
  const body = req.body

  if (!body) return null
  if (typeof body === 'object') return body as T

  const raw = Buffer.isBuffer(body) ? body.toString('utf8') : String(body)

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function projectPath(...segments: string[]): string {
  return path.resolve(process.cwd(), ...segments)
}

function resolvePiperPythonPath(): string {
  const configuredPythonPath = process.env.PIPER_PYTHON_PATH?.trim()
  if (configuredPythonPath) return configuredPythonPath

  const legacyBinPath = process.env.PIPER_BIN_PATH?.trim()
  if (legacyBinPath) return path.join(path.dirname(legacyBinPath), 'python3')

  return projectPath('.venv-piper', 'bin', 'python3')
}

function resolvePiperRuntime(): PiperRuntime {
  return {
    pythonPath: resolvePiperPythonPath(),
    modelId: process.env.PIPER_MODEL?.trim() || 'en_US-reza_ibrahim-medium',
    dataDir: process.env.PIPER_DATA_DIR?.trim() || projectPath('piper-data'),
  }
}

function getRequestOrigin(req: VercelRequest): string | null {
  const forwardedProto = req.headers['x-forwarded-proto']
  const proto = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto

  const forwardedHost = req.headers['x-forwarded-host']
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)
    || req.headers.host

  if (!host) return null
  return `${proto || 'https'}://${host}`
}

function getConfiguredPiperHttpUrl(req: VercelRequest): string | null {
  const configuredBase = process.env.PIPER_HTTP_URL?.trim()
  if (configuredBase) {
    return `${configuredBase.replace(/\/+$/, '')}/api/piper`
  }

  if (!process.env.VERCEL) return null

  const origin = getRequestOrigin(req)
  return origin ? `${origin}/api/piper` : null
}

async function hasFile(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function canUseLocalPiper(runtime: PiperRuntime): Promise<boolean> {
  const modelPath = path.join(runtime.dataDir, `${runtime.modelId}.onnx`)
  const configPath = path.join(runtime.dataDir, `${runtime.modelId}.onnx.json`)
  const [hasPython, hasModel, hasConfig] = await Promise.all([
    hasFile(runtime.pythonPath),
    hasFile(modelPath),
    hasFile(configPath),
  ])

  return hasPython && hasModel && hasConfig
}

async function synthesizeWithPiper(text: string, runtime: PiperRuntime): Promise<Buffer> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aemu-piper-'))
  const outputPath = path.join(tempDir, 'speech.wav')
  const modelPath = path.join(runtime.dataDir, `${runtime.modelId}.onnx`)
  const configPath = path.join(runtime.dataDir, `${runtime.modelId}.onnx.json`)
  const piperInlineScript = `
import sys
import wave
from piper import PiperVoice

model_path, config_path, output_path, text = sys.argv[1:5]
voice = PiperVoice.load(model_path, config_path=config_path)

with wave.open(output_path, "wb") as wav_file:
    wrote_audio = False
    for audio_chunk in voice.synthesize(text):
        if not wrote_audio:
            wav_file.setframerate(audio_chunk.sample_rate)
            wav_file.setsampwidth(audio_chunk.sample_width)
            wav_file.setnchannels(audio_chunk.sample_channels)
            wrote_audio = True

        wav_file.writeframes(audio_chunk.audio_int16_bytes)

if not wrote_audio:
    raise RuntimeError("Piper did not produce any audio")
`.trim()

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(runtime.pythonPath, [
        '-c',
        piperInlineScript,
        modelPath,
        configPath,
        outputPath,
        text,
      ], {
        cwd: process.cwd(),
        stdio: ['ignore', 'ignore', 'pipe'],
      })

      let stderr = ''

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      child.on('error', (error) => {
        reject(error)
      })

      child.on('close', (code) => {
        if (code === 0) {
          resolve()
          return
        }

        reject(new Error(stderr.trim() || `Piper exited with code ${code ?? 'unknown'}`))
      })
    })

    return await fs.readFile(outputPath)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

async function synthesizeWithPiperHttp(text: string, req: VercelRequest): Promise<PiperHttpResponse | null> {
  const endpoint = getConfiguredPiperHttpUrl(req)
  if (!endpoint) return null
  const protectionBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-aemu-internal-piper': '1',
      ...(protectionBypassSecret
        ? { 'x-vercel-protection-bypass': protectionBypassSecret }
        : {}),
    },
    body: JSON.stringify({ text }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail.slice(0, 300) || 'Remote Piper synthesis failed')
  }

  const mimeType = response.headers.get('content-type') || 'audio/wav'
  return {
    mimeType,
    audio: Buffer.from(await response.arrayBuffer()),
  }
}

async function resolveVoiceId(apiKey: string, requestedName: string): Promise<string | null> {
  if (cachedVoiceName === requestedName && cachedVoiceId) return cachedVoiceId

  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: {
      'xi-api-key': apiKey,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Unable to list ElevenLabs voices: ${err.slice(0, 240)}`)
  }

  const data = await response.json() as { voices?: ElevenVoice[] }
  const voices = Array.isArray(data.voices) ? data.voices : []
  const exact = voices.find((voice) => voice.name?.toLowerCase() === requestedName.toLowerCase())
  const partial = voices.find((voice) => voice.name?.toLowerCase().includes(requestedName.toLowerCase()))
  const match = exact ?? partial

  if (!match?.voice_id) return null

  cachedVoiceName = requestedName
  cachedVoiceId = match.voice_id
  return match.voice_id
}

async function synthesizeWithElevenLabs(text: string): Promise<{ mimeType: string; audio: Buffer }> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not configured')
  }

  const requestedVoiceName = (process.env.ELEVENLABS_VOICE_NAME || 'Remi').trim()
  const configuredVoiceId = process.env.ELEVENLABS_VOICE_ID?.trim()
  const voiceId = configuredVoiceId || await resolveVoiceId(apiKey, requestedVoiceName) || null
  if (!voiceId) {
    throw new Error(`ElevenLabs voice "${requestedVoiceName}" was not found for this account.`)
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_flash_v2_5',
        voice_settings: {
          stability: 0.52,
          similarity_boost: 0.88,
          style: 0.18,
          use_speaker_boost: true,
        },
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(err.slice(0, 300) || `ElevenLabs TTS failed for "${requestedVoiceName}"`)
  }

  return {
    mimeType: 'audio/mpeg',
    audio: Buffer.from(await response.arrayBuffer()),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = parseJsonBody<{ text?: string }>(req)
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return res.status(400).json({ error: 'text required' })

  const piperRuntime = resolvePiperRuntime()

  try {
    if (await canUseLocalPiper(piperRuntime)) {
      const audio = await synthesizeWithPiper(text, piperRuntime)
      res.setHeader('Content-Type', 'audio/wav')
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).send(audio)
    }

    const remotePiper = await synthesizeWithPiperHttp(text, req)
    if (remotePiper) {
      res.setHeader('Content-Type', remotePiper.mimeType)
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).send(remotePiper.audio)
    }

    const elevenLabs = await synthesizeWithElevenLabs(text)
    res.setHeader('Content-Type', elevenLabs.mimeType)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(elevenLabs.audio)
  } catch (error) {
    console.error('Primary Piper synthesis failed:', error)

    try {
      const elevenLabs = await synthesizeWithElevenLabs(text)
      res.setHeader('Content-Type', elevenLabs.mimeType)
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).send(elevenLabs.audio)
    } catch (fallbackError) {
      console.error('ElevenLabs fallback failed:', fallbackError)
      const detail = fallbackError instanceof Error
        ? fallbackError.message
        : 'Voice synthesis disruption'
      return res.status(500).json({ error: detail })
    }
  }
}
