import {
  Activity,
  Crown,
  Dumbbell,
  Flame,
  Footprints,
  Sparkles,
  Target,
  Trophy,
  User,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { uid } from './ids'
import type { ScheduleSlot } from '../types'

export type { ScheduleSlot }

export interface GroupColorOption {
  id: string
  name: string
  hex: string
  bg: string
  text: string
  border: string
  badgeClass: string
}

export interface GroupIconOption {
  id: string
  label: string
  icon: LucideIcon
}

export const GROUP_COLORS: GroupColorOption[] = [
  {
    id: 'blue',
    name: 'Blu',
    hex: '#2563eb',
    bg: 'bg-blue-500/15',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/30',
    badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
  {
    id: 'yellow',
    name: 'Giallo',
    hex: '#eab308',
    bg: 'bg-yellow-500/15',
    text: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-500/30',
    badgeClass: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  },
  {
    id: 'emerald',
    name: 'Verde',
    hex: '#10b981',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/30',
    badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  {
    id: 'rose',
    name: 'Rosso',
    hex: '#f43f5e',
    bg: 'bg-rose-500/15',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-500/30',
    badgeClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  },
  {
    id: 'purple',
    name: 'Viola',
    hex: '#a855f7',
    bg: 'bg-purple-500/15',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-500/30',
    badgeClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  },
  {
    id: 'orange',
    name: 'Arancio',
    hex: '#f97316',
    bg: 'bg-orange-500/15',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-500/30',
    badgeClass: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  },
  {
    id: 'cyan',
    name: 'Azzurro',
    hex: '#06b6d4',
    bg: 'bg-cyan-500/15',
    text: 'text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-500/30',
    badgeClass: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  },
  {
    id: 'slate',
    name: 'Grigio',
    hex: '#64748b',
    bg: 'bg-slate-500/15',
    text: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-500/30',
    badgeClass: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
  },
]

export const GROUP_ICONS: GroupIconOption[] = [
  { id: 'users', label: 'Gruppo', icon: Users },
  { id: 'trophy', label: 'Trofeo', icon: Trophy },
  { id: 'flame', label: 'Intensità', icon: Flame },
  { id: 'zap', label: 'Velocità', icon: Zap },
  { id: 'dumbbell', label: 'Forza', icon: Dumbbell },
  { id: 'target', label: 'Precisione', icon: Target },
  { id: 'crown', label: 'Pro Elite', icon: Crown },
  { id: 'sparkles', label: 'Talenti U12', icon: Sparkles },
  { id: 'footprints', label: 'Footwork', icon: Footprints },
  { id: 'activity', label: 'Atletica', icon: Activity },
]

export function getGroupColor(colorId?: string, isGroup = true): GroupColorOption {
  if (colorId) {
    const found = GROUP_COLORS.find((c) => c.id === colorId)
    if (found) return found
  }
  return isGroup ? GROUP_COLORS[0] : GROUP_COLORS[1]
}

export function getGroupIcon(iconId?: string, isGroup = true): LucideIcon {
  if (iconId) {
    const found = GROUP_ICONS.find((i) => i.id === iconId)
    if (found) return found.icon
  }
  return isGroup ? Users : User
}

export const WEEK_DAYS = [
  'Lunedì',
  'Martedì',
  'Mercoledì',
  'Giovedì',
  'Venerdì',
  'Sabato',
  'Domenica',
] as const

export const WEEK_DAYS_SHORT: Record<string, string> = {
  Lunedì: 'Lun',
  Martedì: 'Mar',
  Mercoledì: 'Mer',
  Giovedì: 'Gio',
  Venerdì: 'Ven',
  Sabato: 'Sab',
  Domenica: 'Dom',
}

export const DAY_ORDER_INDEX: Record<string, number> = {
  lunedì: 0,
  lun: 0,
  martedì: 1,
  mar: 1,
  mercoledì: 2,
  mer: 2,
  giovedì: 3,
  gio: 3,
  venerdì: 4,
  ven: 4,
  sabato: 5,
  sab: 5,
  domenica: 6,
  dom: 6,
}

export function sortScheduleSlots(slots: ScheduleSlot[]): ScheduleSlot[] {
  return [...slots].sort((a, b) => {
    const da = DAY_ORDER_INDEX[a.day.toLowerCase()] ?? 99
    const db = DAY_ORDER_INDEX[b.day.toLowerCase()] ?? 99
    if (da !== db) return da - db
    return (a.startTime || '').localeCompare(b.startTime || '')
  })
}

export function formatSchedule(slots: ScheduleSlot[]): string {
  if (!slots || !slots.length) return ''
  return sortScheduleSlots(slots)
    .map((s) => {
      const day = WEEK_DAYS_SHORT[s.day] || s.day
      if (s.startTime && s.endTime) {
        return `${day} ${s.startTime}-${s.endTime}`
      }
      if (s.startTime) return `${day} ${s.startTime}`
      return day
    })
    .join(', ')
}

export function parseScheduleToSlots(scheduleStr?: string): ScheduleSlot[] {
  if (!scheduleStr) return []
  const parts = scheduleStr.split(',').map((p) => p.trim()).filter(Boolean)
  const slots: ScheduleSlot[] = []

  for (const p of parts) {
    // E.g. "Lun 15:30-17:00" or "Lunedì 15:30 - 17:00"
    const match = p.match(/^([a-zA-ZÀ-ÿ0-9-]+)\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/i)
    if (match) {
      const rawDay = match[1]
      const fullDay =
        Object.keys(WEEK_DAYS_SHORT).find(
          (d) =>
            d.toLowerCase().startsWith(rawDay.toLowerCase()) ||
            WEEK_DAYS_SHORT[d]?.toLowerCase() === rawDay.toLowerCase()
        ) || rawDay
      slots.push({
        id: uid('slot-'),
        day: fullDay,
        startTime: match[2],
        endTime: match[3],
      })
    } else {
      slots.push({
        id: uid('slot-'),
        day: p,
        startTime: '15:30',
        endTime: '17:00',
      })
    }
  }
  return slots
}

export interface ScheduleConflict {
  slot: ScheduleSlot
  conflictingGroupName: string
  conflictingTime: string
}

function normalizeDay(day: string): string {
  const d = day.trim().toLowerCase()
  for (const [full, short] of Object.entries(WEEK_DAYS_SHORT)) {
    if (d.startsWith(short.toLowerCase()) || d === full.toLowerCase()) {
      return full.toLowerCase()
    }
  }
  return d
}

export function findScheduleConflicts(
  slots: ScheduleSlot[],
  otherGroups: Array<{ id: string; name: string; scheduleSlots?: ScheduleSlot[]; schedule?: string }>,
  currentId?: string
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = []

  for (const slot of slots) {
    if (!slot.startTime || !slot.endTime) continue
    const normDay = normalizeDay(slot.day)

    for (const other of otherGroups) {
      if (currentId && (other.id === currentId || other.id === `athlete:${currentId}` || other.id === currentId.replace('athlete:', ''))) {
        continue
      }

      const otherSlots =
        other.scheduleSlots && other.scheduleSlots.length
          ? other.scheduleSlots
          : parseScheduleToSlots(other.schedule)

      for (const os of otherSlots) {
        if (!os.startTime || !os.endTime) continue
        if (normalizeDay(os.day) === normDay) {
          // Check standard interval overlap: startA < endB && startB < endA
          if (slot.startTime < os.endTime && os.startTime < slot.endTime) {
            conflicts.push({
              slot,
              conflictingGroupName: other.name,
              conflictingTime: `${os.startTime} - ${os.endTime}`,
            })
          }
        }
      }
    }
  }

  return conflicts
}
