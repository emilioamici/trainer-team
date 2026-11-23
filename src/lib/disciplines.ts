import { Bike, Dumbbell, Flame, Footprints, HeartPulse, Leaf, Route, Timer, Trophy, Zap, type LucideIcon } from 'lucide-react'
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
  strength: { label: T('Forza & Carichi'), icon: Dumbbell, badge: 'bg-warn/15 text-warn', dot: 'bg-warn', text: 'text-warn' },
  power_plyo: { label: T('Potenza & Pliometria'), icon: Zap, badge: 'bg-brand/10 text-brand', dot: 'bg-brand', text: 'text-brand' },
  agility_footwork: { label: T('Agilità & Footwork'), icon: Footprints, badge: 'bg-exp/15 text-exp', dot: 'bg-exp', text: 'text-exp' },
  tennis_conditioning: { label: T('Condizionamento & Circuiti'), icon: Timer, badge: 'bg-trf/15 text-trf', dot: 'bg-trf', text: 'text-trf' },
  mobility_prehab: { label: T('Mobilità & Prevenzione'), icon: HeartPulse, badge: 'bg-inc/15 text-inc', dot: 'bg-inc', text: 'text-inc' },
  ergo: { label: T('Cardio & Ergometri'), icon: Bike, badge: 'bg-inc/15 text-inc', dot: 'bg-inc', text: 'text-inc' },
  recovery: { label: T('Recupero & Scarico'), icon: Leaf, badge: 'bg-inc/15 text-inc', dot: 'bg-inc', text: 'text-inc' },
  other: { label: T('Campo & Tennis'), icon: Trophy, badge: 'bg-muted/15 text-muted', dot: 'bg-muted', text: 'text-muted' },
  // Retrocompatibilità
  run_quality: { label: T('Corsa & Velocità'), icon: Zap, badge: 'bg-exp/15 text-exp', dot: 'bg-exp', text: 'text-exp' },
  run_long: { label: T('Corsa continua'), icon: Route, badge: 'bg-trf/15 text-trf', dot: 'bg-trf', text: 'text-trf' },
  hyrox: { label: T('Metcon & Functional'), icon: Flame, badge: 'bg-brand/10 text-brand', dot: 'bg-brand', text: 'text-brand' },
}

export const DISCIPLINE_ORDER: Discipline[] = [
  'strength',
  'power_plyo',
  'agility_footwork',
  'tennis_conditioning',
  'mobility_prehab',
  'ergo',
  'recovery',
  'other',
]

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
