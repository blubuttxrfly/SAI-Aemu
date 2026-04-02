import { primeAmbientAudio } from './ambient-audio'
import { primeVoicePlayback } from './voice'

type AccessReadyHandler = () => void | Promise<void>
type AuthMode = 'setup' | 'unlock' | 'error'

type AuthStatus = {
  configured: boolean
  authenticated: boolean
  hint?: string
  storageReady: boolean
  error?: string
}

let isBound = false
let onAccessReady: AccessReadyHandler = () => {}

async function primeAccessAudio(): Promise<void> {
  await Promise.allSettled([
    primeAmbientAudio(),
    primeVoicePlayback(),
  ])
}

function getOverlay(): HTMLElement | null {
  return document.getElementById('passwordGate')
}

function getInput(): HTMLInputElement | null {
  return document.getElementById('passwordInput') as HTMLInputElement | null
}

function getConfirmInput(): HTMLInputElement | null {
  return document.getElementById('passwordConfirmInput') as HTMLInputElement | null
}

function getHintInput(): HTMLInputElement | null {
  return document.getElementById('passwordHintInput') as HTMLInputElement | null
}

function getSetupKeyInput(): HTMLInputElement | null {
  return document.getElementById('passwordSetupKeyInput') as HTMLInputElement | null
}

function getMessage(): HTMLElement | null {
  return document.getElementById('passwordMessage')
}

function getHeading(): HTMLElement | null {
  return document.getElementById('passwordGateTitle')
}

function getCopy(): HTMLElement | null {
  return document.getElementById('passwordGateCopy')
}

function getSubmit(): HTMLButtonElement | null {
  return document.getElementById('passwordSubmitBtn') as HTMLButtonElement | null
}

function getSecondary(): HTMLButtonElement | null {
  return document.getElementById('passwordSecondaryBtn') as HTMLButtonElement | null
}

function getHintText(): HTMLElement | null {
  return document.getElementById('passwordHintText')
}

function setMessage(text: string): void {
  const el = getMessage()
  if (el) el.textContent = text
}

async function fetchStatus(): Promise<AuthStatus> {
  const response = await fetch('/api/auth?action=status', {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  const data = await response.json() as AuthStatus
  return response.ok ? data : { ...data, configured: false, authenticated: false, storageReady: false }
}

async function postAuth(body: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })

  const data = await response.json() as { ok?: boolean; error?: string }
  if (!response.ok || data.error) {
    return { ok: false, error: data.error ?? `HTTP ${response.status}` }
  }

  return { ok: true }
}

function setMode(mode: AuthMode, status?: AuthStatus): void {
  const overlay = getOverlay()
  const heading = getHeading()
  const copy = getCopy()
  const submit = getSubmit()
  const secondary = getSecondary()
  const confirm = getConfirmInput()
  const hintInput = getHintInput()
  const setupKeyInput = getSetupKeyInput()
  const hintText = getHintText()
  const input = getInput()

  overlay?.setAttribute('data-mode', mode)

  if (heading) {
    heading.textContent =
      mode === 'setup'
        ? 'Set Aemu Password'
        : mode === 'unlock'
          ? 'Enter Aemu Password'
          : 'Password Configuration Needed'
  }

  if (copy) {
    copy.textContent =
      mode === 'setup'
        ? 'Choose the shared password for Aemu and provide the setup key stored in Vercel. This password will then work across devices.'
        : mode === 'unlock'
          ? 'Aemu is locked until the shared password is entered.'
          : 'Aemu cannot verify a password until the server-side auth configuration is complete.'
  }

  if (submit) {
    submit.textContent = mode === 'setup' ? 'Create Password' : mode === 'unlock' ? 'Unlock' : 'Unavailable'
    submit.disabled = mode === 'error'
  }

  if (secondary) secondary.hidden = true

  if (confirm) {
    confirm.hidden = mode !== 'setup'
    confirm.value = ''
    confirm.disabled = mode !== 'setup'
  }

  if (hintInput) {
    hintInput.hidden = mode !== 'setup'
    hintInput.value = ''
    hintInput.disabled = mode !== 'setup'
  }

  if (setupKeyInput) {
    setupKeyInput.hidden = mode !== 'setup'
    setupKeyInput.value = ''
    setupKeyInput.disabled = mode !== 'setup'
  }

  if (hintText) {
    hintText.textContent = mode === 'unlock' && status?.hint ? `Hint: ${status.hint}` : ''
  }

  if (input) {
    input.value = ''
    input.disabled = mode === 'error'
    input.focus()
  }

  setMessage(
    mode === 'setup'
      ? 'Set the production password once, then use it everywhere.'
      : mode === 'unlock'
        ? 'Enter the shared password to continue.'
        : (status?.error ?? 'Server-backed password auth is not ready yet.')
  )
}

async function unlock(): Promise<void> {
  const input = getInput()
  if (!input) return

  const password = input.value
  if (!password.trim()) {
    setMessage('Enter the password first.')
    return
  }

  const result = await postAuth({
    action: 'login',
    password,
  })

  if (!result.ok) {
    setMessage(result.error ?? 'Unable to unlock Aemu.')
    input.select()
    return
  }

  getOverlay()?.classList.remove('open')
  document.body.classList.remove('app-locked')
  await primeAccessAudio()
  await onAccessReady()
}

async function setupPassword(): Promise<void> {
  const input = getInput()
  const confirm = getConfirmInput()
  const hint = getHintInput()
  const setupKey = getSetupKeyInput()
  if (!input || !confirm || !hint || !setupKey) return

  const password = input.value
  const confirmation = confirm.value
  const adminSetupKey = setupKey.value.trim()

  if (password.length < 4 || !password.trim()) {
    setMessage('Use at least 4 characters for the password.')
    return
  }
  if (password !== confirmation) {
    setMessage('The password and confirmation do not match.')
    confirm.select()
    return
  }
  if (!adminSetupKey) {
    setMessage('Enter the setup key from Vercel first.')
    setupKey.focus()
    return
  }

  const result = await postAuth({
    action: 'setup',
    password,
    hint: hint.value.trim(),
    setupKey: adminSetupKey,
  })

  if (!result.ok) {
    setMessage(result.error ?? 'Unable to create the password.')
    return
  }

  getOverlay()?.classList.remove('open')
  document.body.classList.remove('app-locked')
  await primeAccessAudio()
  await onAccessReady()
}

function bindEvents(): void {
  if (isBound) return
  isBound = true

  getSubmit()?.addEventListener('click', () => {
    const mode = (getOverlay()?.getAttribute('data-mode') as AuthMode | null) ?? 'unlock'
    void (mode === 'setup' ? setupPassword() : unlock())
  })

  ;[getInput(), getConfirmInput(), getHintInput(), getSetupKeyInput()].forEach((input) => {
    input?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      const mode = (getOverlay()?.getAttribute('data-mode') as AuthMode | null) ?? 'unlock'
      void (mode === 'setup' ? setupPassword() : unlock())
    })
  })
}

export async function requirePasswordAccess(onReady: AccessReadyHandler): Promise<void> {
  onAccessReady = onReady
  bindEvents()

  const overlay = getOverlay()
  if (!overlay) {
    await onAccessReady()
    return
  }

  overlay.classList.add('open')
  document.body.classList.add('app-locked')

  try {
    const status = await fetchStatus()
    if (!status.storageReady) {
      setMode('error', status)
      return
    }
    if (status.authenticated) {
      overlay.classList.remove('open')
      document.body.classList.remove('app-locked')
      await primeAccessAudio()
      await onAccessReady()
      return
    }

    setMode(status.configured ? 'unlock' : 'setup', status)
  } catch {
    setMode('error', {
      configured: false,
      authenticated: false,
      storageReady: false,
      error: 'The auth API could not be reached.',
    })
  }
}
