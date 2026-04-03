import { spawn } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applySecurityHeaders, getInternalApiSecret, requireAuthenticatedRequest } from './auth-shared.js'

type PiperRuntime = {
  pythonPath: string
  modelId: string
  dataDir: string
}

type PiperHttpResponse = {
  mimeType: string
  audio: Buffer
}

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

function resolveBundledPiperDataDir(modelId: string): string {
  const candidates = [
    projectPath('piper-data'),
    projectPath('api', 'piper-data'),
  ]

  for (const candidate of candidates) {
    const modelPath = path.join(candidate, `${modelId}.onnx`)
    const configPath = path.join(candidate, `${modelId}.onnx.json`)
    if (existsSync(modelPath) && existsSync(configPath)) {
      return candidate
    }
  }

  return candidates[0]
}

function resolvePiperRuntime(): PiperRuntime {
  const modelId = process.env.PIPER_MODEL?.trim() || 'en_US-reza_ibrahim-medium'
  const configuredDataDir = process.env.PIPER_DATA_DIR?.trim()
  return {
    pythonPath: resolvePiperPythonPath(),
    modelId,
    dataDir: configuredDataDir || resolveBundledPiperDataDir(modelId),
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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-aemu-internal-piper': getInternalApiSecret(),
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res)

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!(await requireAuthenticatedRequest(req, res))) return

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

    return res.status(503).json({
      error: 'Piper voice runtime is not available. Check PIPER_PYTHON_PATH, PIPER_DATA_DIR, and deployed piper-data files.',
    })
  } catch (error) {
    console.error('Piper synthesis failed:', error)
    const detail = error instanceof Error
      ? error.message
      : 'Voice synthesis disruption'
    return res.status(500).json({ error: detail })
  }
}
