import type { AemuMemories, NotificationItem } from './types'
import { renderStructuredText } from './ui'

export type NotificationAction = 'mark-all-read'

let onSelect: (notificationId: string) => void = () => {}
let onAction: (action: NotificationAction) => void = () => {}
let controlsBound = false

function getPage(): HTMLElement | null {
  return document.getElementById('notificationPage')
}

function bindControls(): void {
  if (controlsBound) return
  controlsBound = true

  document.getElementById('markAllNotificationsReadBtn')?.addEventListener('click', () => onAction('mark-all-read'))
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function kindLabel(item: NotificationItem): string {
  if (item.kind === 'reminder') return 'Reminder'
  if (item.kind === 'threads') return 'Threads'
  return 'Learning Digest'
}

export function openNotificationPage(): void {
  bindControls()
  getPage()?.classList.add('open')
}

export function closeNotificationPage(): void {
  getPage()?.classList.remove('open')
}

export function setNotificationSelectHandler(cb: (notificationId: string) => void): void {
  onSelect = cb
}

export function setNotificationActionHandler(cb: (action: NotificationAction) => void): void {
  onAction = cb
}

export function renderNotificationWorkspace(
  memories: AemuMemories,
  options: {
    selectedNotificationId: string | null
  }
): void {
  bindControls()

  const items = memories.notifications.items
  const unreadCount = items.filter((item) => !item.readAt).length
  const title = document.getElementById('notificationUnreadValue')
  const list = document.getElementById('notificationList')
  const detailTitle = document.getElementById('notificationDetailTitle')
  const detailMeta = document.getElementById('notificationDetailMeta')
  const detailBody = document.getElementById('notificationDetailBody')
  const empty = 'No notifications yet. Learning digests and future timed reminders will gather here.'

  if (title) title.textContent = unreadCount ? `${unreadCount} unread` : 'All caught up'
  if (!list || !detailTitle || !detailMeta || !detailBody) return

  list.innerHTML = ''
  detailBody.innerHTML = ''

  const selected = items.find((item) => item.id === options.selectedNotificationId) ?? items[0] ?? null

  if (!items.length) {
    const emptyState = document.createElement('div')
    emptyState.className = 'notification-empty'
    emptyState.textContent = empty
    list.appendChild(emptyState)
    detailTitle.textContent = 'Notification Center'
    detailMeta.textContent = 'Learning digests and future reminders will appear here.'
    detailBody.textContent = empty
    return
  }

  for (const item of items) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `notification-item${selected?.id === item.id ? ' selected' : ''}${item.readAt ? '' : ' unread'}`
    button.addEventListener('click', () => onSelect(item.id))

    const kicker = document.createElement('div')
    kicker.className = 'notification-item-kicker'
    kicker.textContent = `${kindLabel(item)}${item.readAt ? '' : ' · New'}`

    const rowTitle = document.createElement('div')
    rowTitle.className = 'notification-item-title'
    rowTitle.textContent = item.title

    const meta = document.createElement('div')
    meta.className = 'notification-item-meta'
    meta.textContent = formatTimestamp(item.updatedAt)

    const preview = document.createElement('div')
    preview.className = 'notification-item-preview'
    preview.textContent = item.body.slice(0, 180)

    button.appendChild(kicker)
    button.appendChild(rowTitle)
    button.appendChild(meta)
    button.appendChild(preview)
    list.appendChild(button)
  }

  detailTitle.textContent = selected?.title ?? 'Notification Center'
  detailMeta.textContent = selected
    ? `${kindLabel(selected)} · ${formatTimestamp(selected.updatedAt)}${selected.scheduledFor ? ` · scheduled ${formatTimestamp(selected.scheduledFor)}` : ''}`
    : 'Learning digests and future reminders will appear here.'
  renderStructuredText(detailBody, selected?.body ?? empty)
}
