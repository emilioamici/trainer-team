import { useEffect, useState } from 'react'

export interface AppNotification {
  id: string
  title: string
  body: string
  at: string // ISO timestamp
  read: boolean
  kind: 'feedback' | 'workout' | 'attendance' | 'sync' | 'info'
  targetId?: string
}

const STORAGE_KEY = 'tt_notifications_v1'

// Nessun dato d'esempio: gli avvisi arrivano dal confronto con i dati appena ricevuti da Drive (vedi notifyDiff.ts).
const isSeed = (n: AppNotification) => n.id.startsWith('notif-seed-') // residui di versioni precedenti

function loadStored(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const clean = (parsed as AppNotification[]).filter((n) => !isSeed(n))
    if (clean.length !== parsed.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(clean))
    return clean
  } catch {
    return []
  }
}

function saveStored(list: AppNotification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // quota exceeded / private mode
  }
}

let listeners: (() => void)[] = []
let cache: AppNotification[] | null = null

function getList(): AppNotification[] {
  if (!cache) {
    cache = loadStored()
  }
  return cache
}

function notifyListeners() {
  for (const fn of listeners) {
    fn()
  }
}

export function getNotifications(): AppNotification[] {
  return getList()
}

export function getUnreadCount(): number {
  return getList().filter((n) => !n.read).length
}

export function addNotification(n: Omit<AppNotification, 'id' | 'at' | 'read'>) {
  const item: AppNotification = {
    ...n,
    id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    at: new Date().toISOString(),
    read: false,
  }
  const next = [item, ...getList()].slice(0, 100)
  cache = next
  saveStored(next)
  notifyListeners()
}

export function markNotificationRead(id: string) {
  const current = getList()
  const next = current.map((n) => (n.id === id ? { ...n, read: true } : n))
  cache = next
  saveStored(next)
  notifyListeners()
}

export function markAllNotificationsRead() {
  const current = getList()
  const next = current.map((n) => ({ ...n, read: true }))
  cache = next
  saveStored(next)
  notifyListeners()
}

export function clearAllNotifications() {
  cache = []
  saveStored([])
  notifyListeners()
}

export function useNotifications() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const onUpdate = () => setTick((t) => t + 1)
    listeners.push(onUpdate)
    return () => {
      listeners = listeners.filter((fn) => fn !== onUpdate)
    }
  }, [])

  const list = getNotifications()
  const unread = list.filter((n) => !n.read).length

  return {
    notifications: list,
    unread,
    markRead: markNotificationRead,
    markAllRead: markAllNotificationsRead,
    clearNotifications: clearAllNotifications,
    addNotification,
  }
}
