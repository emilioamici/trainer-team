import type { WorkoutBlock, WorkoutSession } from '../types'

/** Converte testi come "90''", "2'", "1'30\"", "1:30", "2 min", "45s" in secondi.
 *  Un numero senza unità usa `unit` ('s' secondi, 'm' minuti). Intervalli ("90-120''"): vale il primo valore. */
export const parseSeconds = (raw: string | undefined, unit: 's' | 'm'): number | null => {
  if (!raw) return null
  const s = raw
    .toLowerCase().replace(/,/g, '.').replace(/[’‘´`]/g, "'").replace(/[“”]/g, '"')
    .replace(/(\d+(?:\.\d+)?)\s*[-–]\s*\d+(?:\.\d+)?/, '$1') // intervallo: vale il primo valore
    .trim()
  let m = s.match(/(\d+)\s*:\s*(\d{1,2})/)
  if (m) return +m[1] * 60 + +m[2]
  m = s.match(/(\d+)\s*(?:'|min\w*|m)\s*(\d+)\s*(?:"|''|s\w*)?/)
  if (m) return +m[1] * 60 + +m[2]
  m = s.match(/(\d+(?:\.\d+)?)\s*(''|"|[a-z]+|')?/)
  if (!m) return null
  const n = +m[1]
  const u = m[2]
  if (!u) return Math.round(n * (unit === 'm' ? 60 : 1))
  if (u === "''" || u === '"' || u.startsWith('s')) return Math.round(n)
  if (u === "'" || u.startsWith('m')) return Math.round(n * 60)
  if (u.startsWith('h') || u.startsWith('or')) return Math.round(n * 3600)
  return Math.round(n * (unit === 'm' ? 60 : 1))
}

export const parseSets = (raw: string | undefined): number => {
  const n = parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 30) : 1
}

export const fmtClock = (sec: number): string => {
  const s = Math.max(0, Math.ceil(sec))
  const h = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`
}

export type StepKind = 'work' | 'rest' | 'manual'
export interface TimerStep {
  kind: StepKind
  label: string
  /** durata in secondi: assente = serve premere "Fatto" */
  seconds?: number
  blockId?: string
  set?: number
  sets?: number
  /** testo di dettaglio (ripetizioni, carico, distanza...) */
  detail?: string
  superset?: boolean
}

const detailOf = (b: WorkoutBlock) =>
  [b.reps && `${b.reps} rip`, b.distance, b.pace, b.zone, b.load].filter(Boolean).join(' · ')

/** Gruppi di blocchi consecutivi: un superset vale solo con almeno 2 blocchi adiacenti con lo stesso id. */
export const groupBlocks = (blocks: WorkoutBlock[]): WorkoutBlock[][] => {
  const out: WorkoutBlock[][] = []
  for (const b of blocks) {
    const last = out[out.length - 1]
    if (b.supersetId && last && last[0].supersetId === b.supersetId && last[0].phase === b.phase) last.push(b)
    else out.push([b])
  }
  return out.map((g) => (g.length > 1 ? g : [{ ...g[0], supersetId: undefined }]))
}

const ORDER = { warmup: 0, main: 1, cooldown: 2 } as const

/** Costruisce la sequenza guidata: lavoro (a tempo o manuale) e recuperi. */
export const buildSteps = (blocks: WorkoutBlock[]): TimerStep[] => {
  const sorted = [...blocks].sort((a, b) => ORDER[a.phase] - ORDER[b.phase])
  const steps: TimerStep[] = []
  const work = (b: WorkoutBlock, set: number, sets: number, superset: boolean): TimerStep => {
    const dur = parseSeconds(b.duration, 'm')
    return {
      kind: dur ? 'work' : 'manual', label: b.title || '—', seconds: dur ?? undefined, blockId: b.id,
      set, sets, detail: detailOf(b) || undefined, superset,
    }
  }
  for (const g of groupBlocks(sorted)) {
    if (g.length === 1) {
      const b = g[0]
      const n = parseSets(b.sets)
      const rest = parseSeconds(b.rest, 's')
      for (let i = 1; i <= n; i++) {
        steps.push(work(b, i, n, false))
        if (rest && i < n) steps.push({ kind: 'rest', label: b.title, seconds: rest, blockId: b.id, set: i, sets: n })
      }
      const r = rest
      if (r && n >= 1) steps.push({ kind: 'rest', label: b.title, seconds: r, blockId: b.id, set: n, sets: n })
    } else {
      const rounds = Math.max(...g.map((b) => parseSets(b.sets)))
      const rest = [...g].reverse().map((b) => parseSeconds(b.rest, 's')).find((x) => !!x) ?? null
      for (let r = 1; r <= rounds; r++) {
        for (const b of g) if (parseSets(b.sets) >= r) steps.push(work(b, r, parseSets(b.sets), true))
        if (rest) steps.push({ kind: 'rest', label: g.map((b) => b.title).join(' + '), seconds: rest, set: r, sets: rounds, superset: true })
      }
    }
  }
  // niente recupero finale in coda
  while (steps.length && steps[steps.length - 1].kind === 'rest') steps.pop()
  return steps
}

/** Utile per decidere se mostrare "Avvia": serve almeno un tempo o un recupero. */
export const hasTimedSteps = (blocks: WorkoutBlock[]) => buildSteps(blocks).some((s) => s.seconds)

export const totalSeconds = (steps: TimerStep[]) => steps.reduce((a, s) => a + (s.seconds ?? 0), 0)

/** Intervalli rapidi: N × (lavoro + recupero). */
export const intervalSteps = (workSec: number, restSec: number, rounds: number): TimerStep[] => {
  const out: TimerStep[] = []
  for (let i = 1; i <= rounds; i++) {
    out.push({ kind: 'work', label: '', seconds: workSec, set: i, sets: rounds })
    if (restSec > 0 && i < rounds) out.push({ kind: 'rest', label: '', seconds: restSec, set: i, sets: rounds })
  }
  return out
}

export const sessionMinutesHint = (s: WorkoutSession) => Math.round(totalSeconds(buildSteps(s.blocks)) / 60)
