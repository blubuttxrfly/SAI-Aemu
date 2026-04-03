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

export type AuthSecurityEvent = {
  id: string
  kind: 'failed-login'
  occurredAt: string
  ipAddress: string
  location: string
  reason: 'invalid-password' | 'locked-out'
  userAgent?: string
}

let isBound = false
let onAccessReady: AccessReadyHandler = () => {}
let submitInFlight = false

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

function getSecurityNote(): HTMLElement | null {
  return document.getElementById('passwordGateSecurity')
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

function setSubmitBusy(isBusy: boolean): void {
  submitInFlight = isBusy
  const submit = getSubmit()
  if (submit) {
    submit.disabled = isBusy || submit.getAttribute('data-mode-disabled') === 'true'
    submit.setAttribute('aria-busy', isBusy ? 'true' : 'false')
  }
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

export async function fetchAuthSecurityEvents(): Promise<AuthSecurityEvent[]> {
  const response = await fetch('/api/auth?action=events', {
    cache: 'no-store',
    credentials: 'same-origin',
  })

  const data = await response.json() as { events?: AuthSecurityEvent[]; error?: string }
  if (!response.ok || data.error) {
    throw new Error(data.error ?? `HTTP ${response.status}`)
  }

  return Array.isArray(data.events) ? data.events : []
}

function setMode(mode: AuthMode, status?: AuthStatus): void {
  const overlay = getOverlay()
  const heading = getHeading()
  const copy = getCopy()
  const security = getSecurityNote()
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
          ? 'Enter Passcode'
          : 'Password Configuration Needed'
  }

  if (copy) {
    copy.textContent =
      mode === 'setup'
        ? 'Choose a strong shared password and enter the setup key stored in Vercel. This unlocks the protected portal across your devices.'
        : mode === 'unlock'
          ? ''
          : 'Aemu cannot verify a password until the server-side auth configuration is complete.'
  }

  if (security) {
    security.textContent = mode === 'error' ? 'Server-side authentication is not ready yet.' : ''
    security.hidden = !security.textContent
  }

  if (submit) {
    submit.textContent = mode === 'setup' ? 'Create Password' : mode === 'unlock' ? 'Unlock' : 'Unavailable'
    submit.setAttribute('data-mode-disabled', mode === 'error' ? 'true' : 'false')
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
    hintText.textContent = ''
    hintText.hidden = true
  }

  if (input) {
    input.value = ''
    input.disabled = mode === 'error'
    input.focus()
  }

  setSubmitBusy(false)
  setMessage(
    mode === 'setup'
      ? 'Set a strong shared password once, then use it everywhere.'
      : mode === 'unlock'
        ? ''
        : (status?.error ?? 'Server-backed password auth is not ready yet.')
  )
}

async function completeAccess(): Promise<void> {
  await primeAccessAudio()
  await onAccessReady()
  getOverlay()?.classList.remove('open')
  document.body.classList.remove('app-locked', 'auth-pending')
}

async function unlock(): Promise<void> {
  if (submitInFlight) return

  const input = getInput()
  if (!input) return

  const password = input.value
  if (!password.trim()) {
    setMessage('Enter the password first.')
    return
  }

  setSubmitBusy(true)

  try {
    const result = await postAuth({
      action: 'login',
      password,
    })

    if (!result.ok) {
      setMessage(result.error ?? 'Unable to unlock Aemu.')
      input.select()
      return
    }

    try {
      await completeAccess()
    } catch (error) {
      console.error('Portal boot failed after unlock:', error)
      setMessage('The portal unlocked, but the secure session could not finish loading.')
    }
  } finally {
    setSubmitBusy(false)
  }
}

async function setupPassword(): Promise<void> {
  if (submitInFlight) return

  const input = getInput()
  const confirm = getConfirmInput()
  const hint = getHintInput()
  const setupKey = getSetupKeyInput()
  if (!input || !confirm || !hint || !setupKey) return

  const password = input.value
  const confirmation = confirm.value
  const adminSetupKey = setupKey.value.trim()

  if (password.length < 12 || !password.trim()) {
    setMessage('Use at least 12 characters for the password.')
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

  setSubmitBusy(true)

  try {
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

    try {
      await completeAccess()
    } catch (error) {
      console.error('Portal boot failed after setup:', error)
      setMessage('The password was created, but the secure session could not finish loading.')
    }
  } finally {
    setSubmitBusy(false)
  }
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
  document.body.classList.add('app-locked', 'auth-pending')

  try {
    const status = await fetchStatus()
    if (!status.storageReady) {
      setMode('error', status)
      return
    }
    if (status.authenticated) {
      try {
        await completeAccess()
      } catch (error) {
        console.error('Portal boot failed during existing session restore:', error)
        setMode('error', {
          configured: status.configured,
          authenticated: false,
          storageReady: status.storageReady,
          error: 'The secure session was restored, but the portal could not finish loading.',
        })
      }
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
