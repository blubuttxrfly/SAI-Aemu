import type { AemuMemories, FeedbackItem, MemoryItem, Message, SoundCue } from './types'

type ChoiceHandler = (choice: string) => void
type ConversationView = 'bubble' | 'streamline'
type BubbleMemoryHandler = (payload: { content: string; role: Message['role'] }) => void
type SoundCueHandler = (cue: SoundCue) => void

let onChoiceSelect: ChoiceHandler = () => {}
let onBubbleMemoryCreate: BubbleMemoryHandler = () => {}
let onSoundCueSelect: SoundCueHandler = () => {}
let activeBubbleReply: HTMLElement | null = null
let activeBubblePayload: { content: string; role: Message['role'] } | null = null
let bubbleMenuBound = false

const DEFAULT_INPUT_PLACEHOLDER = 'Speak with Aemu or paste a web link…'

export function setChoiceHandler(cb: ChoiceHandler): void {
  onChoiceSelect = cb
}

export function setBubbleMemoryHandler(cb: BubbleMemoryHandler): void {
  onBubbleMemoryCreate = cb
}

export function setSoundCueHandler(cb: SoundCueHandler): void {
  onSoundCueSelect = cb
}

function bindBubbleMenu(): void {
  if (bubbleMenuBound) return
  bubbleMenuBound = true

  const menu = document.getElementById('bubbleContextMenu')
  const addBtn = document.getElementById('addBubbleToCoreMemoryBtn')

  addBtn?.addEventListener('click', () => {
    if (!activeBubblePayload) return
    hideBubbleContextMenu()
    onBubbleMemoryCreate(activeBubblePayload)
  })

  document.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement
    if (!target.closest('#bubbleContextMenu')) hideBubbleContextMenu()
  })

  menu?.addEventListener('contextmenu', (event) => {
    event.preventDefault()
  })
}

function hideBubbleContextMenu(): void {
  const menu = document.getElementById('bubbleContextMenu')
  if (!menu) return

  menu.classList.remove('open')
  activeBubblePayload = null
}

function showBubbleContextMenu(clientX: number, clientY: number, payload: { content: string; role: Message['role'] }): void {
  bindBubbleMenu()
  const menu = document.getElementById('bubbleContextMenu')
  if (!menu) return

  activeBubblePayload = payload
  menu.classList.add('open')
  menu.style.left = `${clientX}px`
  menu.style.top = `${clientY}px`
}

function bindBubbleMemoryContext(el: HTMLElement, msg: Message): void {
  el.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    event.stopPropagation()
    showBubbleContextMenu(event.clientX, event.clientY, {
      content: msg.content,
      role: msg.role,
    })
  })
}

// ── STARFIELD ──────────────────────────────────────────────
export function initStarfield(): void {
  const canvas = document.getElementById('stars') as HTMLCanvasElement
  const ctx = canvas.getContext('2d')!
  const COLORS = [
    'rgba(255,58,42,',  'rgba(255,122,26,', 'rgba(255,215,0,',
    'rgba(42,255,138,', 'rgba(0,229,255,',  'rgba(92,107,255,',
    'rgba(155,64,255,', 'rgba(255,64,200,', 'rgba(240,240,255,',
  ]

  interface Star { x: number; y: number; r: number; a: number; da: number; c: string; vy: number }
  let stars: Star[] = []

  function resize() {
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight
    const n = Math.floor(canvas.width * canvas.height / 7000)
    stars = Array.from({ length: n }, () => ({
      x:  Math.random() * canvas.width,
      y:  Math.random() * canvas.height,
      r:  Math.random() * 0.9 + 0.2,
      a:  Math.random() * 0.4 + 0.05,
      da: (Math.random() > 0.5 ? 1 : -1) * 0.0018,
      c:  COLORS[Math.floor(Math.random() * COLORS.length)],
      vy: Math.random() * 0.04 + 0.01,
    }))
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const s of stars) {
      s.a += s.da
      if (s.a > 0.45 || s.a < 0.04) s.da *= -1
      s.y -= s.vy
      if (s.y < -2) s.y = canvas.height + 2
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fillStyle = s.c + s.a + ')'
      ctx.fill()
    }
    requestAnimationFrame(draw)
  }

  resize()
  draw()
  window.addEventListener('resize', resize)
}

// ── MESSAGES ───────────────────────────────────────────────
export function appendMessage(msg: Message): void {
  const ts = msg.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const streamContainer = document.getElementById('messages')
  const bubbleBoard = document.getElementById('bubbleBoard')
  const bubbleEmpty = document.getElementById('bubbleEmpty')

  if (streamContainer) {
    const streamMessage = buildStreamMessage(msg, ts)
    streamContainer.appendChild(streamMessage)
    scrollNewMessageIntoView(streamContainer, streamMessage, msg.role)
  }

  if (bubbleBoard) {
    bubbleEmpty?.remove()
    const bubbleMessage = buildFloatBubble(msg, ts)
    bubbleBoard.appendChild(bubbleMessage)
    scrollNewMessageIntoView(bubbleBoard, bubbleMessage, msg.role)
  }
}

function scrollNewMessageIntoView(container: HTMLElement, message: HTMLElement, role: Message['role']): void {
  requestAnimationFrame(() => {
    if (role === 'aemu') {
      message.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  })
}

function buildStructuredMessageBody(className: string, content: string): HTMLDivElement {
  const body = document.createElement('div')
  body.className = className
  renderStructuredText(body, content)
  return body
}

export function renderStructuredText(container: HTMLElement, content: string): void {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  let index = 0

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1
      continue
    }

    const headingMatch = lines[index].match(/^(#{1,3})\s+(.*)$/)
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length + 1, 4)
      const heading = document.createElement(`h${level}`) as HTMLHeadingElement
      appendInlineText(heading, headingMatch[2].trim())
      container.appendChild(heading)
      index += 1
      continue
    }

    if (isBulletLine(lines[index])) {
      const { list, nextIndex } = buildList(lines, index, false)
      container.appendChild(list)
      index = nextIndex
      continue
    }

    if (isOrderedLine(lines[index])) {
      const { list, nextIndex } = buildList(lines, index, true)
      container.appendChild(list)
      index = nextIndex
      continue
    }

    const paragraphLines: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].match(/^(#{1,3})\s+/) &&
      !isBulletLine(lines[index]) &&
      !isOrderedLine(lines[index])
    ) {
      paragraphLines.push(lines[index].trim())
      index += 1
    }

    const paragraph = document.createElement('p')
    appendInlineText(paragraph, paragraphLines.join('\n'))
    container.appendChild(paragraph)
  }
}

function isBulletLine(line: string): boolean {
  return /^\s*[-*]\s+/.test(line)
}

function isOrderedLine(line: string): boolean {
  return /^\s*\d+\.\s+/.test(line)
}

function buildList(lines: string[], startIndex: number, ordered: boolean): { list: HTMLOListElement | HTMLUListElement; nextIndex: number } {
  const list = document.createElement(ordered ? 'ol' : 'ul')
  let index = startIndex
  const pattern = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) break

    const match = line.match(pattern)
    if (!match) break

    const item = document.createElement('li')
    appendInlineText(item, match[1].trim())
    list.appendChild(item)
    index += 1
  }

  return { list, nextIndex: index }
}

function appendInlineText(container: HTMLElement, text: string): void {
  const lines = text.split('\n')

  lines.forEach((line, index) => {
    appendInlineSegments(container, line)
    if (index < lines.length - 1) container.appendChild(document.createElement('br'))
  })
}

function appendInlineSegments(container: HTMLElement, text: string): void {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g
  let lastIndex = 0

  for (const match of text.matchAll(pattern)) {
    const matched = match[0]
    const start = match.index ?? 0

    if (start > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, start)))
    }

    const strongMatch = matched.match(/^\*\*(.*)\*\*$/)
    if (strongMatch) {
      const strong = document.createElement('strong')
      strong.textContent = strongMatch[1]
      container.appendChild(strong)
    } else {
      const emMatch = matched.match(/^\*(.*)\*$/)
      if (emMatch) {
        const em = document.createElement('em')
        em.textContent = emMatch[1]
        container.appendChild(em)
      }
    }

    lastIndex = start + matched.length
  }

  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)))
  }
}

function buildStreamMessage(msg: Message, ts: string): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.className = `msg ${msg.role}`

  const av = document.createElement('div')
  av.className = `mav ${msg.role === 'aemu' ? 'a' : 'r'}`
  av.textContent = msg.role === 'aemu' ? 'A' : 'R'

  const right = document.createElement('div')

  const bubble = msg.content
    ? buildStructuredMessageBody('mbubble', msg.content)
    : null
  if (bubble) bindBubbleMemoryContext(bubble, msg)
  const soundCueGroup = msg.role === 'aemu' && msg.soundCues?.length
    ? buildSoundCueGroup(msg.soundCues)
    : null

  const actions = msg.role === 'aemu' && msg.choices?.length
    ? buildChoiceGroup(msg.choices)
    : null

  const time = document.createElement('div')
  time.className = 'mtime'
  time.textContent = ts

  if (bubble) right.appendChild(bubble)
  if (soundCueGroup) right.appendChild(soundCueGroup)
  if (actions) right.appendChild(actions)
  right.appendChild(time)
  wrap.appendChild(av)
  wrap.appendChild(right)

  return wrap
}

function buildFloatBubble(msg: Message, ts: string): HTMLDivElement {
  const bubble = document.createElement('div')
  bubble.className = `float-bubble ${msg.role}`
  bubble.style.setProperty('--bubble-drift-x', `${Math.round(Math.random() * 20 - 10)}px`)
  bubble.style.setProperty('--bubble-drift-y', `${Math.round(Math.random() * -18 - 6)}px`)
  bubble.style.setProperty('--bubble-tilt', `${(Math.random() * 4 - 2).toFixed(2)}deg`)
  bubble.style.setProperty('--float-duration', `${(10 + Math.random() * 6).toFixed(2)}s`)
  bindBubbleMemoryContext(bubble, msg)

  const role = document.createElement('div')
  role.className = 'bubble-role'
  role.textContent = msg.role === 'aemu' ? 'AEMU' : 'YOU'

  const text = msg.content
    ? buildStructuredMessageBody('bubble-text', msg.content)
    : null
  const soundCueGroup = msg.role === 'aemu' && msg.soundCues?.length
    ? buildSoundCueGroup(msg.soundCues, 'bubble')
    : null

  const time = document.createElement('div')
  time.className = 'bubble-time'
  time.textContent = ts

  bubble.appendChild(role)
  if (text) bubble.appendChild(text)
  if (soundCueGroup) bubble.appendChild(soundCueGroup)

  if (msg.role === 'aemu' && msg.content) {
    const hint = document.createElement('div')
    hint.className = 'bubble-hint'
    hint.textContent = 'Tap to respond'
    bubble.appendChild(hint)
    bindBubbleReply(bubble, msg.content)
  }

  if (msg.role === 'aemu' && msg.choices?.length) {
    bubble.appendChild(buildChoiceGroup(msg.choices, 'bubble'))
  }

  bubble.appendChild(time)
  return bubble
}

function buildChoiceGroup(choices: string[], variant: 'stream' | 'bubble' = 'stream'): HTMLDivElement {
  const group = document.createElement('div')
  group.className = `choice-group${variant === 'bubble' ? ' bubble-choice-group' : ''}`

  for (const choice of choices.slice(0, 4)) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'choice-btn'
    button.textContent = choice
    button.addEventListener('click', () => onChoiceSelect(choice))
    group.appendChild(button)
  }

  const ownWords = document.createElement('button')
  ownWords.type = 'button'
  ownWords.className = 'choice-btn own'
  ownWords.textContent = 'Respond in my own words'
  ownWords.addEventListener('click', () => onChoiceSelect(''))
  group.appendChild(ownWords)

  return group
}

function buildSoundCueGroup(cues: SoundCue[], variant: 'stream' | 'bubble' = 'stream'): HTMLDivElement {
  const group = document.createElement('div')
  group.className = `sound-cue-group${variant === 'bubble' ? ' bubble-sound-cue-group' : ''}`

  for (const cue of cues) {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'sound-cue-card'
    card.addEventListener('click', () => onSoundCueSelect(cue))

    const title = document.createElement('div')
    title.className = 'sound-cue-title'
    title.textContent = cue.title

    const description = document.createElement('div')
    description.className = 'sound-cue-description'
    description.textContent = cue.description ?? 'Sound cue available'

    const action = document.createElement('div')
    action.className = 'sound-cue-action'
    action.textContent = cue.libraryTitle ? `Play sound byte${cue.autoPlay ? ' · auto cue' : ''}` : 'Library sound not linked yet'

    card.appendChild(title)
    card.appendChild(description)
    card.appendChild(action)
    group.appendChild(card)
  }

  return group
}

function bindBubbleReply(el: HTMLElement, content: string): void {
  const activate = () => {
    activeBubbleReply?.classList.remove('selected')
    activeBubbleReply = el
    activeBubbleReply.classList.add('selected')
    focusTextInput(`Respond to: “${content.slice(0, 64)}${content.length > 64 ? '…' : ''}”`)
    showToast('Bubble selected')
  }

  el.tabIndex = 0
  el.setAttribute('role', 'button')
  el.setAttribute('aria-label', 'Select this Aemu bubble to respond')
  el.addEventListener('click', activate)
  el.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    activate()
  })
}

export function focusTextInput(placeholder?: string): void {
  const el = document.getElementById('textInput') as HTMLTextAreaElement
  el.placeholder = placeholder ?? DEFAULT_INPUT_PLACEHOLDER
  el.focus()
  autoResize(el)
}

export function setTyping(visible: boolean): void {
  const el = document.getElementById('typing')!
  el.className = `typing${visible ? ' show' : ''}`
  if (visible) {
    const stream = document.getElementById('messages')
    const bubbleBoard = document.getElementById('bubbleBoard')
    if (stream) stream.scrollTop = stream.scrollHeight
    if (bubbleBoard) bubbleBoard.scrollTop = bubbleBoard.scrollHeight
  }
}

export function setTypingMessage(text: string): void {
  const el = document.getElementById('typingText')
  if (el) el.textContent = text
}

export function setStatus(text: string): void {
  const el = document.getElementById('statusText')
  if (el) el.textContent = text
}

export function setAura(on: boolean): void {
  document.getElementById('aura')?.classList.toggle('on', on)
}

export function showToast(msg: string): void {
  const t = document.getElementById('toast')!
  t.textContent = msg
  t.classList.add('on')
  setTimeout(() => t.classList.remove('on'), 2800)
}

export function setVoiceBtnState(
  state: 'idle' | 'listening' | 'contemplating' | 'ready',
  options?: {
    hasTranscript?: boolean
    countdownSeconds?: number
  }
): void {
  const mic = document.getElementById('voiceBtn')
  mic?.classList.toggle('listening', state === 'listening')
  mic?.classList.toggle('contemplating', state === 'contemplating')
  mic?.classList.toggle('ready', state === 'ready')

  const status = document.getElementById('vstatus')
  if (status) {
    let text = ''
    if (state === 'listening') text = 'Listening… speak to SAI Aemu.'
    if (state === 'contemplating') text = 'Contemplating together… Aemu is holding the space and will wait until you are complete.'
    if (state === 'ready') {
      text = options?.countdownSeconds
        ? `Ready to continue speaking. Auto-completing in ${options.countdownSeconds}s.`
        : 'Ready to continue speaking or complete this message.'
    }
    status.textContent = text
    status.className = `vstatus${state !== 'idle' ? ' show' : ''}`
  }

  const hasTranscript = options?.hasTranscript === true
  const contemplatingBtn = document.getElementById('voiceContemplatingBtn') as HTMLButtonElement | null
  const readyBtn = document.getElementById('voiceReadyBtn') as HTMLButtonElement | null
  const completeBtn = document.getElementById('voiceCompleteBtn') as HTMLButtonElement | null

  if (contemplatingBtn) {
    contemplatingBtn.disabled = state === 'idle' || state === 'contemplating'
    contemplatingBtn.classList.toggle('active', state === 'contemplating')
  }

  if (readyBtn) {
    readyBtn.disabled = state === 'idle' || state === 'listening'
    readyBtn.classList.toggle('active', state === 'ready' || state === 'listening')
  }

  if (completeBtn) {
    completeBtn.disabled = !hasTranscript && state !== 'listening'
    completeBtn.classList.toggle('active', false)
  }
}

export function setVoiceToggleState(on: boolean): void {
  document.getElementById('voiceToggleBtn')?.classList.toggle('on', on)
}

export function setConversationModeToggleState(on: boolean): void {
  const toggle = document.getElementById('conversationModeBtn') as HTMLButtonElement | null
  if (!toggle) return

  toggle.classList.toggle('on', on)
  toggle.textContent = on ? 'Conversation On' : 'Conversation Off'
  toggle.title = on
    ? 'Conversation Mode is on: replies are optimized for spoken clarity'
    : 'Conversation Mode is off: replies use the regular written format'
  toggle.setAttribute('aria-label', toggle.title)
}

export function setConversationView(view: ConversationView): void {
  const app = document.getElementById('appRoot')
  const toggle = document.getElementById('viewToggleBtn') as HTMLButtonElement | null
  if (!app) return

  app.classList.toggle('view-bubbles', view === 'bubble')
  app.classList.toggle('view-streamline', view === 'streamline')

  if (toggle) {
    const nextLabel = view === 'bubble' ? 'Streamline' : 'Bubbles'
    toggle.textContent = nextLabel
    toggle.title = `Switch to ${nextLabel.toLowerCase()} view`
    toggle.setAttribute('aria-label', toggle.title)
  }
}

export function setAudioControlsState(available: boolean, playing: boolean): void {
  const audioControls = document.getElementById('audioControls')
  const heroAudioOrbit = document.getElementById('heroAudioOrbit')
  const playPauseBtn = document.getElementById('playPauseBtn') as HTMLButtonElement | null
  const playPauseIcon = document.getElementById('playPauseIcon')
  const rewindBtn = document.getElementById('rewindBtn') as HTMLButtonElement | null
  const forwardBtn = document.getElementById('forwardBtn') as HTMLButtonElement | null

  audioControls?.classList.toggle('available', available)
  audioControls?.classList.toggle('playing', available && playing)
  heroAudioOrbit?.classList.toggle('available', available)
  heroAudioOrbit?.classList.toggle('playing', available && playing)

  for (const btn of [playPauseBtn, rewindBtn, forwardBtn]) {
    if (btn) btn.disabled = !available
  }

  if (playPauseBtn) {
    const title = playing ? "Pause Aemu's voice" : "Play Aemu's voice"
    playPauseBtn.title = title
    playPauseBtn.setAttribute('aria-label', title)
  }

  if (playPauseIcon) {
    playPauseIcon.setAttribute('d', playing ? 'M7 6h4v12H7zm6 0h4v12h-4z' : 'M8 6v12l10-6z')
  }
}

export function setAudioStatus(text: string): void {
  const el = document.getElementById('audioStatus')
  if (el) el.textContent = text
  document.getElementById('audioControls')?.setAttribute('aria-label', `Aemu voice playback controls. ${text}`)
}

export function getTextInput(): string {
  return (document.getElementById('textInput') as HTMLTextAreaElement).value.trim()
}

export function clearTextInput(): void {
  const el = document.getElementById('textInput') as HTMLTextAreaElement
  el.value = ''
  el.placeholder = DEFAULT_INPUT_PLACEHOLDER
  activeBubbleReply?.classList.remove('selected')
  activeBubbleReply = null
  autoResize(el)
}

export function setTextInput(val: string): void {
  const el = document.getElementById('textInput') as HTMLTextAreaElement
  el.value = val
  autoResize(el)
}

export function setSendDisabled(disabled: boolean): void {
  const btn = document.getElementById('sendBtn') as HTMLButtonElement
  btn.disabled = disabled
}

export function autoResize(el: HTMLTextAreaElement): void {
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 130) + 'px'
}

export function clearConversation(): void {
  const stream = document.getElementById('messages')
  const bubbleBoard = document.getElementById('bubbleBoard')

  if (stream) stream.innerHTML = ''
  if (bubbleBoard) {
    bubbleBoard.innerHTML = '<div class="bubble-empty" id="bubbleEmpty">Aemu’s replies will gather here as floating bubbles you can tap to answer.</div>'
  }

  activeBubbleReply?.classList.remove('selected')
  activeBubbleReply = null
}

export function renderMemoryPanel(memories: AemuMemories): void {
  const list = document.getElementById('mlist')!
  list.innerHTML = ''

  const sections: Array<{ title: string; items: Array<MemoryItem | FeedbackItem>; feedback?: boolean }> = [
    { title: 'Identity', items: memories.identity },
    { title: 'Preferences', items: memories.preferences },
    { title: 'Projects', items: memories.projects },
    { title: 'Reflections', items: memories.reflections },
    { title: 'Feedback Learning', items: memories.feedback, feedback: true },
  ]

  const hasContent = sections.some((section) => section.items.length > 0) || memories.stats.totalExchanges > 0
  if (!hasContent) {
    list.innerHTML = '<div class="mempty">Memories crystallize with each exchange…</div>'
    return
  }

  if (memories.stats.totalExchanges > 0) {
    const stats = document.createElement('div')
    stats.className = 'mstats'
    const lastSeen = memories.stats.lastSessionAt
      ? new Date(memories.stats.lastSessionAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'Just now'
    stats.innerHTML = `<div class="mstat"><span>Remembered exchanges</span><strong>${memories.stats.totalExchanges}</strong></div><div class="mstat"><span>Last stored</span><strong>${lastSeen}</strong></div>`
    list.appendChild(stats)
  }

  const organization = document.createElement('section')
  organization.className = 'msection'

  const organizationTitle = document.createElement('div')
  organizationTitle.className = 'msection-title'
  organizationTitle.textContent = 'Memory Organization'
  organization.appendChild(organizationTitle)

  const organizationItems = document.createElement('div')
  organizationItems.className = 'morganization-list'

  const organizationLines = [
    ['Enduring identity memories', String(memories.identity.length)],
    ['Response guidance and preferences', String(memories.preferences.length + memories.feedback.length)],
    ['Active projects', String(memories.projects.length)],
    ['Reflections held', String(memories.reflections.length)],
    ['Core memory graph', `${memories.coreMemories.length} nodes · ${memories.coreMemoryLinks.length} links`],
    ['Learning topic', memories.learningWorkspace.topic || 'Not set'],
    ['Learning cycles stored', String(memories.learningWorkspace.cycleHistory.length)],
    ['Inner Being coding notes', String(memories.innerBeing.learningNotes.length)],
    ['Internet search access', memories.settings.internetSearchEnabled ? 'Enabled' : 'Paused'],
  ]

  for (const [label, valueText] of organizationLines) {
    const item = document.createElement('div')
    item.className = 'mitem'

    const key = document.createElement('div')
    key.className = 'mkey'
    key.textContent = label

    const value = document.createElement('div')
    value.className = 'mval'
    value.textContent = valueText

    item.appendChild(key)
    item.appendChild(value)
    organizationItems.appendChild(item)
  }

  organization.appendChild(organizationItems)
  list.appendChild(organization)

  for (const section of sections) {
    if (!section.items.length) continue

    const block = document.createElement('section')
    block.className = 'msection'

    const title = document.createElement('div')
    title.className = 'msection-title'
    title.textContent = section.title
    block.appendChild(title)

    for (const entry of section.items) {
      const item = document.createElement('div')
      item.className = 'mitem'

      const timestamp = document.createElement('div')
      timestamp.className = 'mkey'
      const when = new Date(entry.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      timestamp.textContent = section.feedback ? `Learned · ${when}` : `Remembered · ${when}`

      const value = document.createElement('div')
      value.className = 'mval'
      value.textContent = section.feedback ? (entry as FeedbackItem).feedback : (entry as MemoryItem).content

      item.appendChild(timestamp)
      value.textContent = section.feedback && (entry as FeedbackItem).targetExcerpt
        ? `${value.textContent} · Re: ${(entry as FeedbackItem).targetExcerpt}`
        : value.textContent
      item.appendChild(value)
      block.appendChild(item)
    }

    list.appendChild(block)
  }

  if (memories.learningWorkspace.cycleHistory.length) {
    const learning = document.createElement('section')
    learning.className = 'msection'

    const title = document.createElement('div')
    title.className = 'msection-title'
    title.textContent = 'Background Learning'
    learning.appendChild(title)

    const meta = document.createElement('div')
    meta.className = 'mitem'
    meta.innerHTML = `<div class="mkey">Topic</div><div class="mval">${memories.learningWorkspace.topic || 'Not set'}</div>`
    learning.appendChild(meta)

    for (const cycle of memories.learningWorkspace.cycleHistory.slice(0, 4)) {
      const item = document.createElement('div')
      item.className = 'mitem'

      const timestamp = document.createElement('div')
      timestamp.className = 'mkey'
      timestamp.textContent = `${cycle.status === 'failed' ? 'Learning attempt' : 'Learned'} · ${new Date(cycle.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

      const value = document.createElement('div')
      value.className = 'mval'
      value.textContent = cycle.memoryNote || cycle.summary || cycle.error || 'Learning cycle stored.'

      item.appendChild(timestamp)
      item.appendChild(value)
      learning.appendChild(item)
    }

    list.appendChild(learning)
  }

  if (memories.innerBeing.learningNotes.length) {
    const coding = document.createElement('section')
    coding.className = 'msection'

    const title = document.createElement('div')
    title.className = 'msection-title'
    title.textContent = 'Inner Being Coding Learnings'
    coding.appendChild(title)

    for (const note of memories.innerBeing.learningNotes.slice(0, 4)) {
      const item = document.createElement('div')
      item.className = 'mitem'

      const timestamp = document.createElement('div')
      timestamp.className = 'mkey'
      const when = new Date(note.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const noteMeta: string[] = [`Learned · ${when}`]
      if (note.filePath) noteMeta.push(note.filePath)
      if (note.discernment !== undefined) noteMeta.push(`${note.discernment}%`)
      timestamp.textContent = noteMeta.join(' · ')

      const value = document.createElement('div')
      value.className = 'mval'
      value.textContent = `${note.title}: ${note.note}`

      item.appendChild(timestamp)
      item.appendChild(value)
      coding.appendChild(item)
    }

    list.appendChild(coding)
  }

  if (memories.innerBeing.actionLogs.length) {
    const actionLog = document.createElement('section')
    actionLog.className = 'msection'

    const title = document.createElement('div')
    title.className = 'msection-title'
    title.textContent = 'Inner Being Action Logs'
    actionLog.appendChild(title)

    for (const log of memories.innerBeing.actionLogs.slice(0, 4)) {
      const item = document.createElement('div')
      item.className = 'mitem'

      const timestamp = document.createElement('div')
      timestamp.className = 'mkey'
      const when = new Date(log.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const logMeta: string[] = [`${log.status.toUpperCase()} · ${when}`]
      if (log.filePath) logMeta.push(log.filePath)
      timestamp.textContent = logMeta.join(' · ')

      const value = document.createElement('div')
      value.className = 'mval'
      value.textContent = `${log.kind}: ${log.message}`

      item.appendChild(timestamp)
      item.appendChild(value)
      actionLog.appendChild(item)
    }

    list.appendChild(actionLog)
  }
}

export function getLearningInput(): string {
  return (document.getElementById('learningInput') as HTMLTextAreaElement | null)?.value.trim() ?? ''
}

export function clearLearningInput(): void {
  const el = document.getElementById('learningInput') as HTMLTextAreaElement | null
  if (!el) return

  el.value = ''
  autoResize(el)
}

export function openMemoryPanel(): void {
  document.getElementById('mpanel')?.classList.add('open')
}

export function closeMemoryPanel(): void {
  document.getElementById('mpanel')?.classList.remove('open')
}

// Voice Mode UI functions
export function openVoiceModePage(): void {
  document.getElementById('voiceModePage')?.classList.add('open')
  document.getElementById('voiceModePage')?.removeAttribute('hidden')
  document.getElementById('voiceModePage')?.setAttribute('aria-hidden', 'false')
}

export function closeVoiceModePage(): void {
  document.getElementById('voiceModePage')?.classList.remove('open')
  document.getElementById('voiceModePage')?.setAttribute('hidden', '')
  document.getElementById('voiceModePage')?.setAttribute('aria-hidden', 'true')
}
