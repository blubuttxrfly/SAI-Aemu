import type { AemuMemories, CoreMemoryItem, CoreMemoryLink, CoreMemoryPosition, CoreSubMemoryItem } from './types'
import { DEFAULT_CORE_MEMORY_HUE, RAY_FREQUENCY_PRESETS, getCoreMemoryDescriptor, listCoreMemoryDescriptors, normalizeRayHue } from './memory.ts'

type CoreMemoryLinkAction = 'explore' | 'interconnect' | 'disconnect' | 'ask'
type CoreMemorySelectionMode = 'none' | 'interconnect' | 'disconnect' | 'explore' | 'intermerge'

const GRAPH_WIDTH = 1200
const GRAPH_HEIGHT = 1400
const NODE_WIDTH = 220
const NODE_HEIGHT = 190
const NODE_SCALE_MIN = 0.72
const NODE_SCALE_MAX = 1.9
const NODE_SCALE_STEP = 0.14
const GRAPH_ZOOM_MIN = 0.65
const GRAPH_ZOOM_MAX = 1.85
const GRAPH_ZOOM_STEP = 0.15

let onNodeSelect: (memoryId: string) => void = () => {}
let onNodeMove: (memoryId: string, position: CoreMemoryPosition) => void = () => {}
let onNodeScale: (memoryId: string, scale: number) => void = () => {}
let onLinkAction: (linkId: string, action: CoreMemoryLinkAction) => void = () => {}
let onSubMemorySelect: (memoryId: string, subMemoryId: string) => void = () => {}
let onDescriptorFilterChange: (descriptor: string | null) => void = () => {}
let menusBound = false
let hueControlsBound = false
let viewControlsBound = false
let graphZoom = 1

function getPage(): HTMLElement | null {
  return document.getElementById('coreMemoryPage')
}

function getLinkMenu(): HTMLElement | null {
  return document.getElementById('coreMemoryLinkMenu')
}

function getGraph(): HTMLElement | null {
  return document.getElementById('coreMemoryGraph')
}

function getNodesLayer(): HTMLElement | null {
  return document.getElementById('coreMemoryNodes')
}

function getSvgLayer(): SVGSVGElement | null {
  return document.getElementById('coreMemoryLinksSvg') as SVGSVGElement | null
}

function getCanvas(): HTMLElement | null {
  return document.getElementById('coreMemoryCanvas')
}

function getZoomReadout(): HTMLElement | null {
  return document.getElementById('coreMemoryZoomValue')
}

function getDescriptorFilterBar(): HTMLElement | null {
  return document.getElementById('coreMemoryDescriptorFilters')
}

function getEditorInputs(): {
  title: HTMLInputElement | null
  hue: HTMLInputElement | null
  hueGrid: HTMLElement | null
  scaleReadout: HTMLElement | null
  scaleDown: HTMLButtonElement | null
  scaleUp: HTMLButtonElement | null
  details: HTMLTextAreaElement | null
  hint: HTMLElement | null
  meta: HTMLElement | null
  subMemoryList: HTMLElement | null
  subMemoryTitle: HTMLInputElement | null
  subMemoryDetails: HTMLTextAreaElement | null
  subMemoryMeta: HTMLElement | null
  createSubMemory: HTMLButtonElement | null
  saveSubMemory: HTMLButtonElement | null
  askSubMemory: HTMLButtonElement | null
  save: HTMLButtonElement | null
  ask: HTMLButtonElement | null
  interconnect: HTMLButtonElement | null
} {
  return {
    title: document.getElementById('coreMemoryTitleInput') as HTMLInputElement | null,
    hue: document.getElementById('coreMemoryHueInput') as HTMLInputElement | null,
    hueGrid: document.getElementById('coreMemoryRayOptions'),
    scaleReadout: document.getElementById('coreMemoryScaleValue'),
    scaleDown: document.getElementById('decreaseCoreMemorySizeBtn') as HTMLButtonElement | null,
    scaleUp: document.getElementById('increaseCoreMemorySizeBtn') as HTMLButtonElement | null,
    details: document.getElementById('coreMemoryDetailsInput') as HTMLTextAreaElement | null,
    hint: document.getElementById('coreMemoryEditorHint'),
    meta: document.getElementById('coreMemorySourceMeta'),
    subMemoryList: document.getElementById('coreSubMemoryList'),
    subMemoryTitle: document.getElementById('coreSubMemoryTitleInput') as HTMLInputElement | null,
    subMemoryDetails: document.getElementById('coreSubMemoryDetailsInput') as HTMLTextAreaElement | null,
    subMemoryMeta: document.getElementById('coreSubMemoryMeta'),
    createSubMemory: document.getElementById('createCoreSubMemoryBtn') as HTMLButtonElement | null,
    saveSubMemory: document.getElementById('saveCoreSubMemoryBtn') as HTMLButtonElement | null,
    askSubMemory: document.getElementById('askCoreSubMemoryBtn') as HTMLButtonElement | null,
    save: document.getElementById('saveCoreMemoryBtn') as HTMLButtonElement | null,
    ask: document.getElementById('askCoreMemoryBtn') as HTMLButtonElement | null,
    interconnect: document.getElementById('interconnectCoreMemoryBtn') as HTMLButtonElement | null,
  }
}

function hexToRgb(value: string): string {
  const normalized = normalizeRayHue(value).slice(1)
  const red = parseInt(normalized.slice(0, 2), 16)
  const green = parseInt(normalized.slice(2, 4), 16)
  const blue = parseInt(normalized.slice(4, 6), 16)
  return `${red}, ${green}, ${blue}`
}

function applyNodeHue(node: HTMLElement, hue: string): void {
  const normalized = normalizeRayHue(hue)
  node.style.setProperty('--core-hue', normalized)
  node.style.setProperty('--core-hue-rgb', hexToRgb(normalized))
}

function syncHueButtons(activeHue: string, disabled: boolean): void {
  const { hue, hueGrid } = getEditorInputs()
  if (hue) {
    hue.disabled = disabled
    hue.value = normalizeRayHue(activeHue)
  }

  hueGrid?.querySelectorAll<HTMLButtonElement>('.coreeditor-ray-btn').forEach((button) => {
    const buttonHue = normalizeRayHue(button.dataset.hue)
    button.classList.toggle('selected', !disabled && buttonHue === normalizeRayHue(activeHue))
    button.disabled = disabled
  })
}

function previewSelectedNodeHue(hue: string): void {
  const selectedNode = document.querySelector<HTMLElement>('.core-node.selected')
  if (selectedNode) applyNodeHue(selectedNode, hue)
}

function clampNodeScale(scale: number): number {
  return Math.max(NODE_SCALE_MIN, Math.min(NODE_SCALE_MAX, Math.round(scale * 100) / 100))
}

function clampGraphZoom(scale: number): number {
  return Math.max(GRAPH_ZOOM_MIN, Math.min(GRAPH_ZOOM_MAX, Math.round(scale * 100) / 100))
}

function getNodeDimensions(scale: number): { width: number; height: number } {
  const normalizedScale = clampNodeScale(scale)
  return {
    width: Math.round(NODE_WIDTH * normalizedScale),
    height: Math.round(NODE_HEIGHT * normalizedScale),
  }
}

function lineCenter(position: CoreMemoryPosition, width: number, height: number): { x: number; y: number } {
  return {
    x: position.x + width / 2,
    y: position.y + height / 2,
  }
}

function applyNodeScale(node: HTMLElement, scale: number): void {
  const normalizedScale = clampNodeScale(scale)
  const dimensions = getNodeDimensions(normalizedScale)
  node.dataset.scale = String(normalizedScale)
  node.dataset.width = String(dimensions.width)
  node.dataset.height = String(dimensions.height)
  node.style.setProperty('--core-scale', String(normalizedScale))
  node.style.width = `${dimensions.width}px`
  node.style.minHeight = `${dimensions.height}px`
}

function syncScaleControls(scale: number, disabled: boolean): void {
  const { scaleReadout, scaleDown, scaleUp } = getEditorInputs()
  if (scaleReadout) scaleReadout.textContent = `${Math.round(clampNodeScale(scale) * 100)}%`
  if (scaleDown) scaleDown.disabled = disabled
  if (scaleUp) scaleUp.disabled = disabled
}

function syncZoomDisplay(): void {
  const canvas = getCanvas()
  const readout = getZoomReadout()
  const normalizedZoom = clampGraphZoom(graphZoom)

  graphZoom = normalizedZoom
  if (canvas) {
    canvas.style.width = `${Math.round(GRAPH_WIDTH * normalizedZoom)}px`
    canvas.style.height = `${Math.round(GRAPH_HEIGHT * normalizedZoom)}px`
    canvas.style.setProperty('--coregraph-zoom', String(normalizedZoom))
  }
  if (readout) readout.textContent = `${Math.round(normalizedZoom * 100)}%`
}

function adjustSelectedNodeScale(direction: -1 | 1): void {
  const selectedNode = document.querySelector<HTMLElement>('.core-node.selected')
  if (!selectedNode?.dataset.memoryId) return

  const currentScale = Number(selectedNode.dataset.baseScale ?? selectedNode.dataset.scale ?? '1') || 1
  onNodeScale(selectedNode.dataset.memoryId, clampNodeScale(currentScale + direction * NODE_SCALE_STEP))
}

function bindViewControls(): void {
  if (viewControlsBound) return
  viewControlsBound = true

  document.getElementById('coreMemoryZoomInBtn')?.addEventListener('click', () => {
    graphZoom = clampGraphZoom(graphZoom + GRAPH_ZOOM_STEP)
    syncZoomDisplay()
  })
  document.getElementById('coreMemoryZoomOutBtn')?.addEventListener('click', () => {
    graphZoom = clampGraphZoom(graphZoom - GRAPH_ZOOM_STEP)
    syncZoomDisplay()
  })
  document.getElementById('coreMemoryZoomResetBtn')?.addEventListener('click', () => {
    graphZoom = 1
    syncZoomDisplay()
  })
  getEditorInputs().scaleDown?.addEventListener('click', () => {
    adjustSelectedNodeScale(-1)
  })
  getEditorInputs().scaleUp?.addEventListener('click', () => {
    adjustSelectedNodeScale(1)
  })
}

function bindHueControls(): void {
  if (hueControlsBound) return
  hueControlsBound = true

  const { hue, hueGrid } = getEditorInputs()
  if (!hueGrid) return

  hueGrid.innerHTML = ''
  for (const preset of RAY_FREQUENCY_PRESETS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'coreeditor-ray-btn'
    button.dataset.hue = preset.hue
    button.innerHTML = `<span class="coreeditor-ray-swatch" style="--ray-swatch:${preset.hue}"></span><span>${preset.label}</span>`
    button.addEventListener('click', () => {
      syncHueButtons(preset.hue, false)
      previewSelectedNodeHue(preset.hue)
    })
    hueGrid.appendChild(button)
  }

  hue?.addEventListener('input', () => {
    const nextHue = normalizeRayHue(hue.value)
    syncHueButtons(nextHue, false)
    previewSelectedNodeHue(nextHue)
  })
}

function bindMenus(): void {
  if (menusBound) return
  menusBound = true
  bindHueControls()
  bindViewControls()

  const linkMenu = getLinkMenu()
  linkMenu?.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action as CoreMemoryLinkAction | undefined
      const linkId = linkMenu.dataset.linkId
      if (!action || !linkId) return
      hideCoreMemoryLinkMenu()
      onLinkAction(linkId, action)
    })
  })

  document.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement
    if (!target.closest('#coreMemoryLinkMenu')) hideCoreMemoryLinkMenu()
  })
}

function renderSubMemoryList(memory: CoreMemoryItem | null, selectedSubMemoryId: string | null): CoreSubMemoryItem | null {
  const { subMemoryList } = getEditorInputs()
  if (!subMemoryList) return null

  subMemoryList.innerHTML = ''
  if (!memory) {
    subMemoryList.innerHTML = '<div class="coreeditor-submemory-empty">Select a core memory to open its sub-memories.</div>'
    return null
  }

  const selected = memory.subMemories.find((item) => item.id === selectedSubMemoryId) ?? memory.subMemories[0] ?? null
  if (!memory.subMemories.length) {
    subMemoryList.innerHTML = '<div class="coreeditor-submemory-empty">No sub-memories yet. Create one to hold more specific detail inside this core memory.</div>'
    return null
  }

  for (const subMemory of memory.subMemories) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `coreeditor-submemory-chip${selected?.id === subMemory.id ? ' selected' : ''}`
    button.textContent = subMemory.title
    button.addEventListener('click', () => onSubMemorySelect(memory.id, subMemory.id))
    subMemoryList.appendChild(button)
  }

  return selected
}

function setEditorState(
  memory: CoreMemoryItem | null,
  selectedSubMemoryId: string | null,
  links: CoreMemoryLink[],
  pendingInterconnectFromId: string | null,
  allMemories: AemuMemories
): void {
  const {
    title,
    details,
    hint,
    meta,
    subMemoryTitle,
    subMemoryDetails,
    subMemoryMeta,
    createSubMemory,
    saveSubMemory,
    askSubMemory,
    save,
    ask,
    interconnect,
  } = getEditorInputs()
  const { hue } = getEditorInputs()
  const disabled = !memory
  const selectedSubMemory = renderSubMemoryList(memory, selectedSubMemoryId)

  if (title) {
    title.disabled = disabled
    title.value = memory?.title ?? ''
  }

  syncHueButtons(memory?.rayHue ?? DEFAULT_CORE_MEMORY_HUE, disabled)
  syncScaleControls(memory?.scale ?? 1, disabled)
  if (hue && !memory) hue.value = DEFAULT_CORE_MEMORY_HUE

  if (details) {
    details.disabled = disabled
    details.value = memory?.details ?? ''
  }

  if (subMemoryTitle) {
    subMemoryTitle.disabled = disabled
    subMemoryTitle.value = selectedSubMemory?.title ?? ''
  }

  if (subMemoryDetails) {
    subMemoryDetails.disabled = disabled
    subMemoryDetails.value = selectedSubMemory?.details ?? ''
  }

  if (createSubMemory) createSubMemory.disabled = disabled
  if (saveSubMemory) saveSubMemory.disabled = disabled
  if (askSubMemory) askSubMemory.disabled = !selectedSubMemory
  if (save) save.disabled = disabled
  if (ask) ask.disabled = disabled
  if (interconnect) {
    interconnect.disabled = disabled
    interconnect.textContent = pendingInterconnectFromId && pendingInterconnectFromId === memory?.id
      ? 'Select Another Memory'
      : 'Interconnect'
  }

  if (hint) {
    if (pendingInterconnectFromId) {
      const source = allMemories.coreMemories.find((item) => item.id === pendingInterconnectFromId)
      hint.textContent = source
        ? `Interconnect mode: select another core memory to extend "${source.title}".`
        : 'Interconnect mode: select another core memory.'
    } else if (memory) {
      hint.textContent = memory.intermergeCoherence
        ? 'Edit the core field, then navigate or expand its sub-memories for the more specific threads held inside it.'
        : 'Edit the title or expanded information, then save when it feels right.'
    } else {
      hint.textContent = 'Select a core memory to explore or edit it.'
    }
  }

  if (meta) {
    if (!memory) {
      meta.textContent = 'Saved organization and links will persist.'
    } else {
      const connectionCount = links.filter((link) => link.fromId === memory.id || link.toId === memory.id).length
      const sourceLine = memory.source === 'conversation'
        ? `Created from conversation${memory.sourceExcerpt ? ` · "${memory.sourceExcerpt}"` : ''}`
        : 'Created manually'
      meta.textContent = `${sourceLine} · ${connectionCount} interconnection${connectionCount === 1 ? '' : 's'} · ${memory.subMemories.length} sub-memor${memory.subMemories.length === 1 ? 'y' : 'ies'}`
    }
  }

  if (subMemoryMeta) {
    if (!memory) {
      subMemoryMeta.textContent = 'Select a core memory to open its sub-memories.'
      return
    }

    if (!selectedSubMemory) {
      subMemoryMeta.textContent = 'No sub-memory selected yet. Create one to hold a more specific thread inside this core memory.'
      return
    }

    subMemoryMeta.textContent = selectedSubMemory.sourceMemoryId
      ? 'This sub-memory was intermerged from another core memory and is now navigable inside this retained hexagon.'
      : 'This sub-memory holds a more specific detail thread nested inside the selected core memory.'
  }
}

function updateLinkGeometry(
  group: SVGGElement,
  from: CoreMemoryPosition,
  fromWidth: number,
  fromHeight: number,
  to: CoreMemoryPosition,
  toWidth: number,
  toHeight: number
): void {
  const visible = group.querySelector<SVGLineElement>('line.core-link-visible')
  const hit = group.querySelector<SVGLineElement>('line.core-link-hit')
  if (!visible || !hit) return

  const start = lineCenter(from, fromWidth, fromHeight)
  const end = lineCenter(to, toWidth, toHeight)

  for (const line of [visible, hit]) {
    line.setAttribute('x1', String(start.x))
    line.setAttribute('y1', String(start.y))
    line.setAttribute('x2', String(end.x))
    line.setAttribute('y2', String(end.y))
  }
}

function updateConnectedLines(memoryId: string): void {
  const node = document.querySelector<HTMLElement>(`.core-node[data-memory-id="${memoryId}"]`)
  if (!node) return

  document.querySelectorAll<SVGGElement>(`.core-link[data-from="${memoryId}"], .core-link[data-to="${memoryId}"]`).forEach((group) => {
    const fromId = group.dataset.from
    const toId = group.dataset.to
    if (!fromId || !toId) return

    const fromNode = document.querySelector<HTMLElement>(`.core-node[data-memory-id="${fromId}"]`)
    const toNode = document.querySelector<HTMLElement>(`.core-node[data-memory-id="${toId}"]`)
    if (!fromNode || !toNode) return

    updateLinkGeometry(
      group,
      {
        x: Number(fromNode.dataset.x ?? '0'),
        y: Number(fromNode.dataset.y ?? '0'),
      },
      Number(fromNode.dataset.width ?? String(NODE_WIDTH)),
      Number(fromNode.dataset.height ?? String(NODE_HEIGHT)),
      {
        x: Number(toNode.dataset.x ?? '0'),
        y: Number(toNode.dataset.y ?? '0'),
      },
      Number(toNode.dataset.width ?? String(NODE_WIDTH)),
      Number(toNode.dataset.height ?? String(NODE_HEIGHT))
    )
  })
}

function attachDrag(node: HTMLButtonElement, memory: CoreMemoryItem): void {
  node.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    node.setPointerCapture(event.pointerId)
    node.classList.add('dragging')

    const startPointerX = event.clientX
    const startPointerY = event.clientY
    const origin = { ...memory.position }
    let moved = false

    const onMove = (moveEvent: PointerEvent) => {
      const nextX = origin.x + (moveEvent.clientX - startPointerX) / graphZoom
      const nextY = origin.y + (moveEvent.clientY - startPointerY) / graphZoom
      moved = moved || Math.abs(moveEvent.clientX - startPointerX) > 4 || Math.abs(moveEvent.clientY - startPointerY) > 4

      node.dataset.x = String(nextX)
      node.dataset.y = String(nextY)
      node.style.left = `${nextX}px`
      node.style.top = `${nextY}px`
      updateConnectedLines(memory.id)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      node.releasePointerCapture(event.pointerId)
      node.classList.remove('dragging')

      const finalPosition = {
        x: Number(node.dataset.x ?? origin.x),
        y: Number(node.dataset.y ?? origin.y),
      }

      if (moved) {
        onNodeMove(memory.id, finalPosition)
        return
      }

      onNodeSelect(memory.id)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  })
}

function showCoreMemoryLinkMenu(linkId: string, clientX: number, clientY: number): void {
  const menu = getLinkMenu()
  if (!menu) return

  menu.dataset.linkId = linkId
  menu.classList.add('open')
  menu.style.left = `${clientX}px`
  menu.style.top = `${clientY}px`
}

export function hideCoreMemoryLinkMenu(): void {
  const menu = getLinkMenu()
  if (!menu) return

  menu.classList.remove('open')
  delete menu.dataset.linkId
}

export function openCoreMemoryPage(): void {
  bindMenus()
  syncZoomDisplay()
  getPage()?.classList.add('open')
}

export function closeCoreMemoryPage(): void {
  hideCoreMemoryLinkMenu()
  getPage()?.classList.remove('open')
}

export function getCoreMemoryEditorValues(): { title: string; details: string; rayHue: string } {
  const { title, details, hue } = getEditorInputs()
  return {
    title: title?.value.trim() ?? '',
    details: details?.value ?? '',
    rayHue: hue?.value ?? DEFAULT_CORE_MEMORY_HUE,
  }
}

export function getCoreSubMemoryEditorValues(): { title: string; details: string } {
  const { subMemoryTitle, subMemoryDetails } = getEditorInputs()
  return {
    title: subMemoryTitle?.value.trim() ?? '',
    details: subMemoryDetails?.value ?? '',
  }
}

export function setCoreMemoryNodeSelectHandler(cb: (memoryId: string) => void): void {
  onNodeSelect = cb
}

export function setCoreMemoryNodeMoveHandler(cb: (memoryId: string, position: CoreMemoryPosition) => void): void {
  onNodeMove = cb
}

export function setCoreMemoryNodeScaleHandler(cb: (memoryId: string, scale: number) => void): void {
  onNodeScale = cb
}

export function setCoreMemoryLinkActionHandler(cb: (linkId: string, action: CoreMemoryLinkAction) => void): void {
  onLinkAction = cb
}

export function setCoreSubMemorySelectHandler(cb: (memoryId: string, subMemoryId: string) => void): void {
  onSubMemorySelect = cb
}

export function setCoreMemoryDescriptorFilterHandler(cb: (descriptor: string | null) => void): void {
  onDescriptorFilterChange = cb
}

function getRenderedNodeScale(baseScale: number, descriptor: string, selectedDescriptor: string | null): number {
  if (!selectedDescriptor) return baseScale
  return descriptor === selectedDescriptor ? clampNodeScale(baseScale * 1.14) : baseScale
}

function renderDescriptorFilters(memories: AemuMemories, selectedDescriptor: string | null): void {
  const bar = getDescriptorFilterBar()
  if (!bar) return

  const descriptors = listCoreMemoryDescriptors(memories)
  bar.innerHTML = ''

  const allButton = document.createElement('button')
  allButton.type = 'button'
  allButton.className = `corefilter-btn${selectedDescriptor ? '' : ' selected'}`
  allButton.textContent = 'All'
  allButton.addEventListener('click', () => onDescriptorFilterChange(null))
  bar.appendChild(allButton)

  for (const descriptor of descriptors) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `corefilter-btn${selectedDescriptor === descriptor ? ' selected' : ''}`
    button.textContent = descriptor
    button.addEventListener('click', () => onDescriptorFilterChange(selectedDescriptor === descriptor ? null : descriptor))
    bar.appendChild(button)
  }
}

export function renderCoreMemoryWorkspace(
  memories: AemuMemories,
  options: {
    selectedMemoryId: string | null
    selectedSubMemoryId: string | null
    pendingInterconnectFromId: string | null
    selectedDescriptor: string | null
    selectedMemoryIds: string[]
    selectionMode: CoreMemorySelectionMode
  }
): void {
  bindMenus()

  const graph = getGraph()
  const nodesLayer = getNodesLayer()
  const svgLayer = getSvgLayer()
  const emptyState = document.getElementById('coreMemoryEmpty')
  if (!graph || !nodesLayer || !svgLayer || !emptyState) return

  const selectedMemory = memories.coreMemories.find((item) => item.id === options.selectedMemoryId) ?? null
  setEditorState(selectedMemory, options.selectedSubMemoryId, memories.coreMemoryLinks, options.pendingInterconnectFromId, memories)
  renderDescriptorFilters(memories, options.selectedDescriptor)
  syncZoomDisplay()

  emptyState.classList.toggle('show', memories.coreMemories.length === 0)
  nodesLayer.innerHTML = ''
  svgLayer.innerHTML = ''

  const visibleLinks = memories.coreMemoryLinks.filter((link) => {
    const hasFrom = memories.coreMemories.some((item) => item.id === link.fromId)
    const hasTo = memories.coreMemories.some((item) => item.id === link.toId)
    return hasFrom && hasTo
  })

  for (const link of visibleLinks) {
    const from = memories.coreMemories.find((item) => item.id === link.fromId)
    const to = memories.coreMemories.find((item) => item.id === link.toId)
    if (!from || !to) continue

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    group.setAttribute('class', 'core-link')
    group.dataset.linkId = link.id
    group.dataset.from = link.fromId
    group.dataset.to = link.toId

    const visible = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    visible.setAttribute('class', 'core-link-visible')
    group.appendChild(visible)

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    hit.setAttribute('class', 'core-link-hit')
    hit.addEventListener('click', (event) => {
      event.stopPropagation()
      showCoreMemoryLinkMenu(link.id, event.clientX, event.clientY)
    })
    group.appendChild(hit)

    const fromDescriptor = getCoreMemoryDescriptor(from)
    const toDescriptor = getCoreMemoryDescriptor(to)
    const fromDimensions = getNodeDimensions(getRenderedNodeScale(from.scale, fromDescriptor, options.selectedDescriptor))
    const toDimensions = getNodeDimensions(getRenderedNodeScale(to.scale, toDescriptor, options.selectedDescriptor))
    if (options.selectedDescriptor && (fromDescriptor !== options.selectedDescriptor || toDescriptor !== options.selectedDescriptor)) {
      group.classList.add('dim')
    }
    if (options.selectionMode !== 'none' && (!options.selectedMemoryIds.includes(link.fromId) || !options.selectedMemoryIds.includes(link.toId))) {
      group.classList.add('dim')
    }
    updateLinkGeometry(group, from.position, fromDimensions.width, fromDimensions.height, to.position, toDimensions.width, toDimensions.height)
    svgLayer.appendChild(group)
  }

  for (const memory of memories.coreMemories) {
    const descriptor = getCoreMemoryDescriptor(memory)
    const node = document.createElement('button')
    node.type = 'button'
    node.className = 'core-node'
    if (memory.id === options.selectedMemoryId) node.classList.add('selected')
    if (options.pendingInterconnectFromId && memory.id === options.pendingInterconnectFromId) node.classList.add('pending')
    node.dataset.memoryId = memory.id
    node.dataset.baseScale = String(memory.scale)
    node.dataset.descriptor = descriptor
    node.dataset.x = String(memory.position.x)
    node.dataset.y = String(memory.position.y)
    node.style.left = `${memory.position.x}px`
    node.style.top = `${memory.position.y}px`
    applyNodeHue(node, memory.rayHue)
    applyNodeScale(node, getRenderedNodeScale(memory.scale, descriptor, options.selectedDescriptor))
    if (options.selectedDescriptor) {
      node.classList.add(descriptor === options.selectedDescriptor ? 'descriptor-match' : 'descriptor-dim')
    }
    if (options.selectionMode !== 'none') {
      node.classList.add(options.selectedMemoryIds.includes(memory.id) ? 'selection-focus' : 'selection-dim')
    }

    const title = document.createElement('div')
    title.className = 'core-node-title'
    title.textContent = memory.title

    const meta = document.createElement('div')
    meta.className = 'core-node-meta'
    meta.textContent = memory.subMemories.length
      ? `${memory.subMemories.length} sub-memor${memory.subMemories.length === 1 ? 'y' : 'ies'}`
      : memory.intermergeCoherence
        ? 'Intermerge field'
        : 'Core field'

    node.appendChild(title)
    node.appendChild(meta)
    attachDrag(node, memory)
    nodesLayer.appendChild(node)
  }
}
