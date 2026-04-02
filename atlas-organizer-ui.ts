import type {
  AemuMemories,
  AtlasOrganizerFolder,
  AtlasOrganizerItem,
  AtlasOrganizerItemKind,
  AtlasThreadsDraft,
} from './types'
import type { AtlasThreadsAuthSession } from './atlas-organizer'
import { ATLAS_DOCUMENT_ACCEPT, describePendingLibraryFile } from './library-file-reading'

export type AtlasOrganizerAction =
  | 'create-folder'
  | 'new-item'
  | 'save-item'
  | 'delete-item'
  | 'import-item-file'
  | 'connect-threads'
  | 'disconnect-threads'
  | 'draft-threads'
  | 'save-threads'
  | 'publish-threads'

let onFolderSelect: (folderId: string) => void = () => {}
let onItemSelect: (itemId: string) => void = () => {}
let onDraftSelect: (draftId: string) => void = () => {}
let onAction: (action: AtlasOrganizerAction) => void = () => {}
let controlsBound = false

function getPage(): HTMLElement | null {
  return document.getElementById('atlasOrganizerPage')
}

function getFolderInputs(): {
  name: HTMLInputElement | null
  description: HTMLTextAreaElement | null
  color: HTMLInputElement | null
} {
  return {
    name: document.getElementById('atlasFolderNameInput') as HTMLInputElement | null,
    description: document.getElementById('atlasFolderDescriptionInput') as HTMLTextAreaElement | null,
    color: document.getElementById('atlasFolderColorInput') as HTMLInputElement | null,
  }
}

function getItemInputs(): {
  title: HTMLInputElement | null
  summary: HTMLInputElement | null
  tags: HTMLInputElement | null
  kind: HTMLSelectElement | null
  content: HTMLTextAreaElement | null
  file: HTMLInputElement | null
  importBtn: HTMLButtonElement | null
  fileStatus: HTMLElement | null
} {
  return {
    title: document.getElementById('atlasItemTitleInput') as HTMLInputElement | null,
    summary: document.getElementById('atlasItemSummaryInput') as HTMLInputElement | null,
    tags: document.getElementById('atlasItemTagsInput') as HTMLInputElement | null,
    kind: document.getElementById('atlasItemKindInput') as HTMLSelectElement | null,
    content: document.getElementById('atlasItemContentInput') as HTMLTextAreaElement | null,
    file: document.getElementById('atlasItemFileInput') as HTMLInputElement | null,
    importBtn: document.getElementById('atlasImportItemFileBtn') as HTMLButtonElement | null,
    fileStatus: document.getElementById('atlasItemFileStatus'),
  }
}

function getThreadsInputs(): {
  title: HTMLInputElement | null
  angle: HTMLInputElement | null
  prompt: HTMLTextAreaElement | null
  content: HTMLTextAreaElement | null
  scheduledFor: HTMLInputElement | null
  autoPublish: HTMLInputElement | null
} {
  return {
    title: document.getElementById('atlasThreadsTitleInput') as HTMLInputElement | null,
    angle: document.getElementById('atlasThreadsAngleInput') as HTMLInputElement | null,
    prompt: document.getElementById('atlasThreadsPromptInput') as HTMLTextAreaElement | null,
    content: document.getElementById('atlasThreadsContentInput') as HTMLTextAreaElement | null,
    scheduledFor: document.getElementById('atlasThreadsScheduleInput') as HTMLInputElement | null,
    autoPublish: document.getElementById('atlasThreadsAutoPublishInput') as HTMLInputElement | null,
  }
}

function bindControls(): void {
  if (controlsBound) return
  controlsBound = true

  document.getElementById('atlasFolderCreateBtn')?.addEventListener('click', () => onAction('create-folder'))
  document.getElementById('atlasNewItemBtn')?.addEventListener('click', () => onAction('new-item'))
  document.getElementById('atlasSaveItemBtn')?.addEventListener('click', () => onAction('save-item'))
  document.getElementById('atlasDeleteItemBtn')?.addEventListener('click', () => onAction('delete-item'))
  document.getElementById('atlasImportItemFileBtn')?.addEventListener('click', () => onAction('import-item-file'))
  document.getElementById('atlasConnectThreadsBtn')?.addEventListener('click', () => onAction('connect-threads'))
  document.getElementById('atlasDisconnectThreadsBtn')?.addEventListener('click', () => onAction('disconnect-threads'))
  document.getElementById('atlasDraftThreadsBtn')?.addEventListener('click', () => onAction('draft-threads'))
  document.getElementById('atlasSaveThreadsBtn')?.addEventListener('click', () => onAction('save-threads'))
  document.getElementById('atlasPublishThreadsBtn')?.addEventListener('click', () => onAction('publish-threads'))
  getItemInputs().file?.addEventListener('change', syncAtlasFileStatus)
}

function syncAtlasFileStatus(): void {
  const { file, fileStatus } = getItemInputs()
  if (!fileStatus) return

  const selected = file?.files?.[0]
  fileStatus.textContent = selected
    ? `${selected.name} · ${describePendingLibraryFile(selected).replace(`${selected.name} · `, '')}`
    : 'Import a PDF or DOCX into this Atlas document.'
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return 'Just now'

  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function countDraftsForFolder(folderId: string, drafts: AtlasThreadsDraft[]): number {
  return drafts.filter((draft) => draft.folderId === folderId).length
}

function countItemsForFolder(folderId: string, items: AtlasOrganizerItem[]): number {
  return items.filter((item) => item.folderId === folderId).length
}

export function openAtlasOrganizerPage(): void {
  bindControls()
  getPage()?.classList.add('open')
}

export function closeAtlasOrganizerPage(): void {
  getPage()?.classList.remove('open')
}

export function getAtlasFolderInputValues(): {
  name: string
  description: string
  color: string
} {
  const { name, description, color } = getFolderInputs()
  return {
    name: name?.value.trim() ?? '',
    description: description?.value.trim() ?? '',
    color: color?.value.trim() ?? '#2ad4a0',
  }
}

export function getAtlasItemInputValues(): {
  title: string
  summary: string
  tags: string[]
  kind: AtlasOrganizerItemKind
  content: string
} {
  const { title, summary, tags, kind, content } = getItemInputs()
  const parsedKind = kind?.value === 'brief' || kind?.value === 'thread-seed' ? kind.value : 'note'

  return {
    title: title?.value.trim() ?? '',
    summary: summary?.value.trim() ?? '',
    tags: (tags?.value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    kind: parsedKind,
    content: content?.value.trim() ?? '',
  }
}

export function getAtlasThreadsInputValues(): {
  title: string
  angle: string
  prompt: string
  content: string
  scheduledFor: string
  autoPublish: boolean
} {
  const { title, angle, prompt, content, scheduledFor, autoPublish } = getThreadsInputs()
  return {
    title: title?.value.trim() ?? '',
    angle: angle?.value.trim() ?? '',
    prompt: prompt?.value.trim() ?? '',
    content: content?.value.trim() ?? '',
    scheduledFor: scheduledFor?.value.trim() ?? '',
    autoPublish: autoPublish?.checked === true,
  }
}

export function setAtlasFolderSelectHandler(cb: (folderId: string) => void): void {
  onFolderSelect = cb
}

export function setAtlasItemSelectHandler(cb: (itemId: string) => void): void {
  onItemSelect = cb
}

export function setAtlasDraftSelectHandler(cb: (draftId: string) => void): void {
  onDraftSelect = cb
}

export function setAtlasOrganizerActionHandler(cb: (action: AtlasOrganizerAction) => void): void {
  onAction = cb
}

export function renderAtlasOrganizerWorkspace(
  memories: AemuMemories,
  options: {
    selectedFolderId: string | null
    selectedItemId: string | null
    selectedDraftId: string | null
    folderDraftName: string
    folderDraftDescription: string
    folderDraftColor: string
    itemDraftTitle: string
    itemDraftSummary: string
    itemDraftTags: string[]
    itemDraftKind: AtlasOrganizerItemKind
    itemDraftContent: string
    threadsDraftTitle: string
    threadsDraftAngle: string
    threadsDraftPrompt: string
    threadsDraftContent: string
    threadsDraftScheduledFor: string
    threadsDraftAutoPublish: boolean
    threadsAuth: AtlasThreadsAuthSession | null
    threadsOAuthReady: boolean
    threadsConfigured: boolean
    threadsDetail: string
    busy: boolean
    busyMode: 'idle' | 'saving' | 'reading' | 'drafting' | 'publishing' | 'scheduling'
  }
): void {
  bindControls()

  const organizer = memories.atlasOrganizer
  const selectedFolder = organizer.folders.find((folder) => folder.id === options.selectedFolderId) ?? organizer.folders[0] ?? null
  const selectedItem = organizer.items.find((item) => item.id === options.selectedItemId) ?? null
  const selectedDraft = organizer.threadsDrafts.find((draft) => draft.id === options.selectedDraftId) ?? null
  const folderItems = organizer.items
    .filter((item) => item.folderId === selectedFolder?.id)
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || (Date.parse(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || 0))

  const folderList = document.getElementById('atlasFolderList')
  const itemList = document.getElementById('atlasItemList')
  const draftList = document.getElementById('atlasThreadsDraftList')
  const selectedFolderName = document.getElementById('atlasSelectedFolderName')
  const selectedFolderDescription = document.getElementById('atlasSelectedFolderDescription')
  const itemStatus = document.getElementById('atlasItemStatus')
  const threadsStatus = document.getElementById('atlasThreadsStatus')
  const threadsConnection = document.getElementById('atlasThreadsConnectionStatus')
  const threadsConnectionGuide = document.getElementById('atlasThreadsConnectionGuide')
  const threadsSourceMeta = document.getElementById('atlasThreadsSourceMeta')
  const threadsQueueMeta = document.getElementById('atlasThreadsQueueMeta')
  const connectThreadsBtn = document.getElementById('atlasConnectThreadsBtn') as HTMLButtonElement | null
  const disconnectThreadsBtn = document.getElementById('atlasDisconnectThreadsBtn') as HTMLButtonElement | null
  const sortedDrafts = [...organizer.threadsDrafts].sort((left, right) => {
    if (left.id === selectedDraft?.id) return -1
    if (right.id === selectedDraft?.id) return 1
    return (Date.parse(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || 0)
  })
  const itemScopedDrafts = selectedItem
    ? sortedDrafts.filter((draft) => draft.sourceItemId === selectedItem.id)
    : []
  const folderScopedDrafts = selectedFolder
    ? sortedDrafts.filter((draft) => draft.folderId === selectedFolder.id)
    : []
  const visibleDrafts = itemScopedDrafts.length
    ? itemScopedDrafts
    : folderScopedDrafts.length
      ? folderScopedDrafts
      : sortedDrafts

  const folderInputs = getFolderInputs()
  if (folderInputs.name) {
    folderInputs.name.value = options.folderDraftName
    folderInputs.name.disabled = options.busy
  }
  if (folderInputs.description) {
    folderInputs.description.value = options.folderDraftDescription
    folderInputs.description.disabled = options.busy
  }
  if (folderInputs.color) {
    folderInputs.color.value = options.folderDraftColor
    folderInputs.color.disabled = options.busy
  }

  const itemInputs = getItemInputs()
  if (itemInputs.title) {
    itemInputs.title.value = options.itemDraftTitle
    itemInputs.title.disabled = options.busy || !selectedFolder
  }
  if (itemInputs.summary) {
    itemInputs.summary.value = options.itemDraftSummary
    itemInputs.summary.disabled = options.busy || !selectedFolder
  }
  if (itemInputs.tags) {
    itemInputs.tags.value = options.itemDraftTags.join(', ')
    itemInputs.tags.disabled = options.busy || !selectedFolder
  }
  if (itemInputs.kind) {
    itemInputs.kind.value = options.itemDraftKind
    itemInputs.kind.disabled = options.busy || !selectedFolder
  }
  if (itemInputs.content) {
    itemInputs.content.value = options.itemDraftContent
    itemInputs.content.disabled = options.busy || !selectedFolder
  }
  if (itemInputs.file) {
    itemInputs.file.disabled = options.busy || !selectedFolder
    itemInputs.file.accept = ATLAS_DOCUMENT_ACCEPT
    syncAtlasFileStatus()
  }
  if (itemInputs.fileStatus) {
    if (!itemInputs.file?.files?.length) {
      itemInputs.fileStatus.textContent = 'Import a PDF or DOCX into this Atlas document.'
    }
  }

  const threadsInputs = getThreadsInputs()
  if (threadsInputs.title) {
    threadsInputs.title.value = options.threadsDraftTitle
    threadsInputs.title.disabled = options.busy
  }
  if (threadsInputs.angle) {
    threadsInputs.angle.value = options.threadsDraftAngle
    threadsInputs.angle.disabled = options.busy
  }
  if (threadsInputs.prompt) {
    threadsInputs.prompt.value = options.threadsDraftPrompt
    threadsInputs.prompt.disabled = options.busy
  }
  if (threadsInputs.content) {
    threadsInputs.content.value = options.threadsDraftContent
    threadsInputs.content.disabled = options.busy
  }
  if (threadsInputs.scheduledFor) {
    threadsInputs.scheduledFor.value = options.threadsDraftScheduledFor
    threadsInputs.scheduledFor.disabled = options.busy
  }
  if (threadsInputs.autoPublish) {
    threadsInputs.autoPublish.checked = options.threadsDraftAutoPublish
    threadsInputs.autoPublish.disabled = options.busy
  }

  const createFolderBtn = document.getElementById('atlasFolderCreateBtn') as HTMLButtonElement | null
  const newItemBtn = document.getElementById('atlasNewItemBtn') as HTMLButtonElement | null
  const saveItemBtn = document.getElementById('atlasSaveItemBtn') as HTMLButtonElement | null
  const deleteItemBtn = document.getElementById('atlasDeleteItemBtn') as HTMLButtonElement | null
  const importItemBtn = document.getElementById('atlasImportItemFileBtn') as HTMLButtonElement | null
  const draftThreadsBtn = document.getElementById('atlasDraftThreadsBtn') as HTMLButtonElement | null
  const saveThreadsBtn = document.getElementById('atlasSaveThreadsBtn') as HTMLButtonElement | null
  const publishThreadsBtn = document.getElementById('atlasPublishThreadsBtn') as HTMLButtonElement | null

  if (createFolderBtn) {
    createFolderBtn.disabled = options.busy
    createFolderBtn.textContent = options.busyMode === 'saving' ? 'Saving...' : 'Add Folder'
  }
  if (newItemBtn) newItemBtn.disabled = options.busy || !selectedFolder
  if (saveItemBtn) {
    saveItemBtn.disabled = options.busy || !selectedFolder
    saveItemBtn.textContent = options.busyMode === 'saving'
      ? 'Saving...'
      : options.busyMode === 'reading'
        ? 'Reading & Contemplating...'
        : 'Save Document'
  }
  if (deleteItemBtn) deleteItemBtn.disabled = options.busy || !selectedItem
  if (importItemBtn) {
    importItemBtn.disabled = options.busy || !selectedFolder
    importItemBtn.textContent = options.busyMode === 'reading' ? 'Reading & Contemplating...' : 'Import PDF / DOCX'
  }
  if (connectThreadsBtn) {
    connectThreadsBtn.disabled = options.busy || !options.threadsOAuthReady || options.threadsConfigured
    connectThreadsBtn.textContent = options.threadsConfigured ? 'Connected' : 'Connect Threads'
  }
  if (disconnectThreadsBtn) {
    disconnectThreadsBtn.disabled = options.busy || !options.threadsConfigured
  }
  if (draftThreadsBtn) {
    draftThreadsBtn.disabled = options.busy
    draftThreadsBtn.textContent = options.busyMode === 'drafting' ? 'Drafting...' : 'Draft with Aemu'
  }
  if (saveThreadsBtn) {
    saveThreadsBtn.disabled = options.busy
    saveThreadsBtn.textContent = options.busyMode === 'saving'
      ? 'Saving...'
      : options.busyMode === 'scheduling'
        ? 'Scheduling...'
        : 'Save Draft'
  }
  if (publishThreadsBtn) {
    publishThreadsBtn.disabled = options.busy || !options.threadsConfigured || !options.threadsDraftContent.trim()
    publishThreadsBtn.textContent = options.busyMode === 'publishing' ? 'Publishing...' : 'Publish to Threads'
  }

  if (selectedFolderName) {
    selectedFolderName.textContent = selectedFolder ? selectedFolder.name : 'Atlas Island folders'
  }
  if (selectedFolderDescription) {
    selectedFolderDescription.textContent = selectedFolder
      ? `${selectedFolder.description} · ${countItemsForFolder(selectedFolder.id, organizer.items)} docs · ${countDraftsForFolder(selectedFolder.id, organizer.threadsDrafts)} drafts`
      : 'Create or select a folder to start organizing Atlas Island information.'
  }
  if (itemStatus) {
    itemStatus.textContent = selectedItem
      ? `Selected ${selectedItem.kind}${selectedItem.sourceFileName ? ` · imported ${selectedItem.sourceFileName}` : ''}${selectedItem.documentPageCount ? ` · ${selectedItem.documentPageCount} pages` : ''} · updated ${formatTimestamp(selectedItem.updatedAt)}`
      : selectedFolder
        ? 'Create a document inside this folder or select one to continue editing.'
        : 'Choose a folder first.'
  }
  if (threadsConnection) {
    threadsConnection.textContent = options.threadsConfigured
      ? `Connected${options.threadsAuth?.username ? ` as @${options.threadsAuth.username}` : ''}. ${options.threadsDetail}`
      : options.threadsDetail
    threadsConnection.className = `atlas-meta atlas-connection${options.threadsConfigured ? ' connected' : ''}`
  }
  if (threadsConnectionGuide) {
    threadsConnectionGuide.textContent = options.threadsConfigured
      ? `Publishing uses the connected Threads account${options.threadsAuth?.expiresAt ? ` until ${formatTimestamp(options.threadsAuth.expiresAt)}` : ''}.`
      : options.threadsOAuthReady
        ? 'Use Connect Threads to sign in and grant publishing access to this workspace.'
        : 'To enable Connect Threads, set THREADS_CLIENT_ID, THREADS_CLIENT_SECRET, and THREADS_REDIRECT_URI in the app environment.'
  }
  if (threadsStatus) {
    threadsStatus.textContent = selectedDraft
      ? `Selected draft is ${selectedDraft.status}.${selectedDraft.scheduledFor ? ` Scheduled for ${formatTimestamp(selectedDraft.scheduledFor)}.` : ''}${selectedDraft.publishResult ? ` ${selectedDraft.publishResult}` : ''} Last touched ${formatTimestamp(selectedDraft.updatedAt)}.`
      : options.threadsConfigured
        ? 'Drafts can be published directly from this page.'
        : 'Drafts can be prepared now and published once Threads access is configured.'
  }
  if (threadsSourceMeta) {
    threadsSourceMeta.textContent = selectedItem
      ? `Source document: ${selectedItem.title}${selectedFolder ? ` · folder: ${selectedFolder.name}` : ''}`
      : selectedFolder
        ? `Source folder: ${selectedFolder.name}. Select a document to ground the post more tightly.`
        : 'Select a folder or document to ground the post.'
  }
  if (threadsQueueMeta) {
    threadsQueueMeta.textContent = selectedItem && itemScopedDrafts.length
      ? `Showing ${itemScopedDrafts.length} draft${itemScopedDrafts.length === 1 ? '' : 's'} for ${selectedItem.title}.`
      : selectedItem && selectedFolder
        ? `No saved drafts yet for ${selectedItem.title}. Showing ${folderScopedDrafts.length} draft${folderScopedDrafts.length === 1 ? '' : 's'} in ${selectedFolder.name}.`
        : selectedFolder && folderScopedDrafts.length
          ? `Showing ${folderScopedDrafts.length} draft${folderScopedDrafts.length === 1 ? '' : 's'} in ${selectedFolder.name}.`
          : `Showing all ${sortedDrafts.length} saved draft${sortedDrafts.length === 1 ? '' : 's'}.`
  }

  if (folderList) {
    folderList.innerHTML = ''

    for (const folder of organizer.folders) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `atlas-folder-btn${folder.id === selectedFolder?.id ? ' selected' : ''}`
      button.style.setProperty('--folder-color', folder.color)
      button.disabled = options.busy
      button.addEventListener('click', () => onFolderSelect(folder.id))

      const name = document.createElement('div')
      name.className = 'atlas-folder-name'
      name.textContent = folder.name

      const meta = document.createElement('div')
      meta.className = 'atlas-folder-meta'
      meta.textContent = `${countItemsForFolder(folder.id, organizer.items)} docs · ${countDraftsForFolder(folder.id, organizer.threadsDrafts)} drafts`

      button.appendChild(name)
      button.appendChild(meta)
      folderList.appendChild(button)
    }
  }

  if (itemList) {
    itemList.innerHTML = ''

    if (!selectedFolder || !folderItems.length) {
      const empty = document.createElement('div')
      empty.className = 'atlas-empty'
      empty.textContent = selectedFolder
        ? 'This folder is empty. Save a note, brief, or thread seed here.'
        : 'Select a folder to see its documents.'
      itemList.appendChild(empty)
    } else {
      for (const item of folderItems) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = `atlas-item-card${item.id === selectedItem?.id ? ' selected' : ''}`
        button.disabled = options.busy
        button.addEventListener('click', () => onItemSelect(item.id))

        const title = document.createElement('div')
        title.className = 'atlas-item-title'
        title.textContent = item.title

        const summary = document.createElement('div')
        summary.className = 'atlas-item-summary'
        summary.textContent = item.summary || item.content.slice(0, 180) || 'No summary yet.'

        const meta = document.createElement('div')
        meta.className = 'atlas-item-meta'
        meta.textContent = `${item.kind}${item.sourceFileName ? ` · ${item.sourceFileName}` : ''}${item.documentPageCount ? ` · ${item.documentPageCount} pages` : ''} · ${item.tags.length ? item.tags.join(' • ') : 'no tags'} · ${formatTimestamp(item.updatedAt)}`

        button.appendChild(title)
        button.appendChild(summary)
        button.appendChild(meta)
        itemList.appendChild(button)
      }
    }
  }

  if (draftList) {
    draftList.innerHTML = ''

    if (!visibleDrafts.length) {
      const empty = document.createElement('div')
      empty.className = 'atlas-empty'
      empty.textContent = selectedFolder
        ? 'No Threads drafts match the current selection yet. Generate one from the composer to start a publishing queue.'
        : 'No Threads drafts yet. Generate one from the composer to start a publishing queue.'
      draftList.appendChild(empty)
    } else {
      for (const draft of visibleDrafts) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = `atlas-draft-card${draft.id === selectedDraft?.id ? ' selected' : ''}`
        button.disabled = options.busy
        button.addEventListener('click', () => onDraftSelect(draft.id))

        const title = document.createElement('div')
        title.className = 'atlas-item-title'
        title.textContent = draft.title || 'Threads draft'

        const summary = document.createElement('div')
        summary.className = 'atlas-item-summary'
        summary.textContent = draft.content.slice(0, 180) || 'Draft body is empty.'

        const context = document.createElement('div')
        context.className = 'atlas-draft-context'
        const draftFolder = draft.folderId
          ? organizer.folders.find((folder) => folder.id === draft.folderId)
          : null
        const draftSource = draft.sourceItemId
          ? organizer.items.find((item) => item.id === draft.sourceItemId)
          : null
        context.textContent = [
          draftFolder ? `Folder: ${draftFolder.name}` : 'Folder: Unsorted',
          draftSource ? `Source: ${draftSource.title}` : '',
        ].filter(Boolean).join(' · ')

        const meta = document.createElement('div')
        meta.className = `atlas-item-meta status-${draft.status}`
        meta.textContent = draft.scheduledFor && draft.status === 'scheduled'
          ? `scheduled · ${formatTimestamp(draft.scheduledFor)}`
          : `${draft.status} · ${formatTimestamp(draft.publishedAt ?? draft.updatedAt)}`

        button.appendChild(title)
        button.appendChild(summary)
        button.appendChild(context)
        button.appendChild(meta)
        draftList.appendChild(button)
      }
    }
  }
}

export function clearAtlasItemFile(): void {
  const { file } = getItemInputs()
  if (file) file.value = ''
  syncAtlasFileStatus()
}
