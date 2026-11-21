import { Activity, Bike, Dumbbell, Flame, Leaf, Route, Zap, type LucideIcon } from 'lucide-react'
import { T } from '../i18n'
import type { Discipline, Feel, Phase, SessionStatus } from '../types'

export interface DisciplineInfo {
  label: string
  icon: LucideIcon
  /** classi sui soli token del tema (mai esadecimali) */
  badge: string
  dot: string
  text: string
}

export const DISCIPLINES: Record<Discipline, DisciplineInfo> = {
  run_quality: { label: T('Corsa · Qualità'), icon: Zap, badge: 'bg-exp/15 text-exp', dot: 'bg-exp', text: 'text-exp' },
  run_long: { label: T('Corsa · Lungo'), icon: Route, badge: 'bg-trf/15 text-trf', dot: 'bg-trf', text: 'text-trf' },
  hyrox: { label: T('Hyrox · Metcon'), icon: Flame, badge: 'bg-brand/10 text-brand', dot: 'bg-brand', text: 'text-brand' },
  strength: { label: T('Forza · Palestra'), icon: Dumbbell, badge: 'bg-warn/15 text-warn', dot: 'bg-warn', text: 'text-warn' },
  ergo: { label: T('Ergometri (Bike/Ski)'), icon: Bike, badge: 'bg-inc/15 text-inc', dot: 'bg-inc', text: 'text-inc' },
  other: { label: T('Tennis · Altro'), icon: Activity, badge: 'bg-muted/15 text-muted', dot: 'bg-muted', text: 'text-muted' },
  recovery: { label: T('Recupero'), icon: Leaf, badge: 'bg-inc/15 text-inc', dot: 'bg-inc', text: 'text-inc' },
}
export const DISCIPLINE_ORDER = Object.keys(DISCIPLINES) as Discipline[]

export const PHASES: Record<Phase, string> = {
  warmup: T('Riscaldamento'),
  main: T('Blocco centrale'),
  cooldown: T('Defaticamento'),
}
export const PHASE_ORDER: Phase[] = ['warmup', 'main', 'cooldown']

export const STATUS_LABEL: Record<SessionStatus, string> = {
  planned: T('Da fare'),
  done: T('Completato'),
  partial: T('Parziale'),
  skipped: T('Saltato'),
}
export const STATUS_BADGE: Record<SessionStatus, string> = {
  planned: 'bg-line/60 text-muted',
  done: 'bg-inc/15 text-inc',
  partial: 'bg-warn/15 text-warn',
  skipped: 'bg-exp/15 text-exp',
}

export const FEELS: { id: Feel; emoji: string; label: string }[] = [
  { id: 'great', emoji: '🤩', label: T('Fortissimo') },
  { id: 'good', emoji: '😊', label: T('Bene') },
  { id: 'ok', emoji: '😐', label: T('Così così') },
  { id: 'tired', emoji: '😮‍💨', label: T('Stanco') },
  { id: 'bad', emoji: '🤕', label: T('Male') },
]
