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

const initialSeed: AppNotification[] = [
  {
    id: 'notif-seed-1',
    title: 'Lorenzo Sarti (ATP)',
    body: 'Completato: Potenza Servizio & Core · RPE 8 · Ottime sensazioni sulla spalla',
    at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    read: false,
    kind: 'feedback',
    targetId: 'athlete:lorenzo-sarti',
  },
  {
    id: 'notif-seed-2',
    title: 'Agonistica U16 - Gruppo A',
    body: 'Presenze registrate: 4/4 allievi presenti alla sessione di footwork',
    at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    read: false,
    kind: 'attendance',
    targetId: 'athlete:u16-gruppo-a',
  },
]

function loadStored(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initialSeed))
      return initialSeed
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : initialSeed
  } catch {
    return initialSeed
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
