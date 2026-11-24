import type { Discipline, Source, TrainingPlanDatabase, WorkoutSession } from '../types'
import { addDays, nowISO } from './dates'
import { DISCIPLINES_LIST, parseBlock, parseFeedback } from './db'
import { T } from '../i18n'
import { uid } from './ids'

export const PLAN_FORMAT = 'trainer-team-plan'
export const COACH_EXPORT_FORMAT = 'trainer-team-coach-export'

/**
 * JSON.parse tollerante per le risposte delle AI: toglie i blocchi ``` e il testo prima/dopo il JSON.
 * Se non riesce lancia l'errore normale di JSON.parse.
 */
export const parseJsonLoose = (text: string): unknown => {
  try { return JSON.parse(text) } catch (first) {
    const noFence = text.replace(/^\s*```[a-zA-Z]*\s*/, '').replace(/\s*```\s*$/, '')
    try { return JSON.parse(noFence) } catch { /* sotto */ }
    const open = noFence.search(/[[{]/)
    const close = Math.max(noFence.lastIndexOf('}'), noFence.lastIndexOf(']'))
    if (open >= 0 && close > open) { try { return JSON.parse(noFence.slice(open, close + 1)) } catch { /* sotto */ } }
    throw first
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Esporta sessioni in un file JSON portabile (date assolute). */
export const exportPlan = (db: TrainingPlanDatabase, opts: { from?: string; to?: string; withLog?: boolean } = {}) => {
  const list = db.sessions.filter((s) => (!opts.from || s.date >= opts.from) && (!opts.to || s.date <= opts.to))
  return {
    format: PLAN_FORMAT,
    version: 1,
    exportedAt: nowISO(),
    athlete: db.athlete.name,
    sessions: list.map((s) => ({
      date: s.date, title: s.title, discipline: s.discipline, coachNotes: s.coachNotes, blocks: s.blocks.map((b) => ({ ...b, id: undefined })),
      ...(opts.withLog ? { status: s.status, feedback: s.feedback } : {}),
    })),
  }
}

/** Esporta i piani di tutti gli atleti del coach in un unico file JSON. */
export const exportAllAthletes = (
  athletes: { source: Source; db: TrainingPlanDatabase }[],
  opts: { from?: string; to?: string; withLog?: boolean } = {}
) => ({
  format: COACH_EXPORT_FORMAT,
  version: 1,
  exportedAt: nowISO(),
  athletes: athletes.map(({ source, db }) => ({
    athleteId: db.athlete.id || source.id.replace('athlete:', ''),
    athleteName: db.athlete.name,
    focus: db.athlete.focus,
    plan: exportPlan(db, opts),
  })),
})

export interface ImportResult { sessions: WorkoutSession[]; skipped: number }

export interface MultiAthleteImportItem {
  athleteId?: string
  athleteName: string
  sessions: WorkoutSession[]
  skipped: number
}

/** Verifica se il testo JSON rappresenta un'esportazione multi-atleta del coach. */
export const isMultiAthletePlan = (text: string): boolean => {
  try {
    const raw = parseJsonLoose(text)
    return isObj(raw) && (raw.format === COACH_EXPORT_FORMAT || (Array.isArray(raw.athletes) && raw.athletes.length > 0))
  } catch {
    return false
  }
}

/** Legge un file multi-atleta restituendo le sessioni per ogni atleta. */
export const parseMultiAthletePlan = (
  text: string,
  startMonday: string,
  by: 'coach' | 'athlete'
): { athletes: MultiAthleteImportItem[] } => {
  let raw: unknown
  try { raw = parseJsonLoose(text) } catch { throw new Error(T('Il file non è un JSON valido.')) }
  if (!isObj(raw) || !Array.isArray(raw.athletes)) throw new Error(T('Non trovo l’elenco "athletes" nel file.'))
  const out: MultiAthleteImportItem[] = []
  for (const item of raw.athletes) {
    if (!isObj(item)) continue
    const athleteName = typeof item.athleteName === 'string' && item.athleteName.trim()
      ? item.athleteName.trim()
      : (typeof item.athlete === 'string' && item.athlete.trim() ? item.athlete.trim() : 'Atleta')
    const athleteId = typeof item.athleteId === 'string' ? item.athleteId : undefined
    const planObj = isObj(item.plan) ? item.plan : (Array.isArray(item.sessions) ? { sessions: item.sessions } : null)
    if (planObj) {
      try {
        const res = parsePlanFile(JSON.stringify(planObj), startMonday, by)
        out.push({ athleteId, athleteName, sessions: res.sessions, skipped: res.skipped })
      } catch {
        // ignora se un singolo piano non è valido
      }
    }
  }
  return { athletes: out }
}

/** Clona un elenco di sessioni generando nuovi ID univoci per sessioni e blocchi. */
export const cloneSessionsWithNewIds = (sessions: WorkoutSession[]): WorkoutSession[] => {
  const now = nowISO()
  return sessions.map((s) => ({
    ...s,
    id: uid('s-'),
    blocks: s.blocks.map((b) => ({ ...b, id: uid('b-') })),
    planUpdatedAt: now,
    logUpdatedAt: now,
    updatedAt: now,
  }))
}

/**
 * Legge un piano JSON. Ogni sessione può avere `date` (YYYY-MM-DD) oppure `day` (1 = lunedì … 7 = domenica)
 * ed eventualmente `week` (0 = prima settimana): in quel caso la data si calcola dal lunedì `startMonday`.
 */
export const parsePlanFile = (text: string, startMonday: string, by: 'coach' | 'athlete'): ImportResult => {
  let raw: unknown
  try { raw = parseJsonLoose(text) } catch { throw new Error(T('Il file non è un JSON valido.')) }
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.sessions) ? raw.sessions : null
  if (!list) throw new Error(T('Non trovo l’elenco "sessions" nel file.'))
  const out: WorkoutSession[] = []
  let skipped = 0
  const now = nowISO()
  for (const item of list) {
    if (!isObj(item)) { skipped++; continue }
    let date = typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : ''
    if (!date && typeof item.day === 'number' && item.day >= 1 && item.day <= 7) {
      const week = typeof item.week === 'number' && item.week >= 0 ? Math.floor(item.week) : 0
      date = addDays(startMonday, week * 7 + Math.floor(item.day) - 1)
    }
    if (!date) { skipped++; continue }
    const blocks = (Array.isArray(item.blocks) ? item.blocks : []).map(parseBlock).filter((b) => !!b).map((b) => ({ ...b!, id: uid('b-') }))
    const withLog = item.status === 'done' || item.status === 'partial' || item.status === 'skipped'
    out.push({
      id: uid('s-'), date,
      title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'Allenamento',
      discipline: (DISCIPLINES_LIST as readonly string[]).includes(item.discipline as string) ? (item.discipline as Discipline) : 'other',
      blocks, coachNotes: typeof item.coachNotes === 'string' ? item.coachNotes : '', createdBy: by,
      planUpdatedAt: now, status: withLog ? (item.status as WorkoutSession['status']) : 'planned',
      feedback: withLog ? parseFeedback(item.feedback) : null, logUpdatedAt: now, updatedAt: now,
    })
  }
  return { sessions: out, skipped }
}

/** Modello tracciato: una settimana tipo con date relative (day 1-7), da compilare/caricare. */
export const templatePlan = () => ({
  format: PLAN_FORMAT,
  version: 1,
  note: 'Modello: "day" va da 1 (lunedì) a 7 (domenica); "week" (facoltativo) sposta in avanti di N settimane. In alternativa usa "date": "AAAA-MM-GG". Discipline ammesse: strength, power_plyo, agility_footwork, tennis_conditioning, mobility_prehab, ergo, recovery, other. Fasi: warmup, main, cooldown.',
  sessions: [
    {
      day: 1, title: 'Forza funzionale & Core tennis', discipline: 'strength',
      coachNotes: 'Cura la profondità dello squat e la stabilità.',
      blocks: [
        { phase: 'warmup', title: 'Mobilità anche 90-90 e caviglie', duration: "8'" },
        { phase: 'main', title: 'Back Squat con bilanciere', sets: '4', reps: '6', load: 'Bilanciere con 45 kg', rest: "2'" },
        { phase: 'cooldown', title: 'Foam roller & allungamento', duration: "6'" },
      ],
    },
    {
      day: 3, title: 'Agilità & Footwork tennis', discipline: 'agility_footwork',
      blocks: [
        { phase: 'warmup', title: 'Scaletta coordinazione: Icky Shuffle', sets: '4', reps: '1 passaggio', rest: "45''" },
        { phase: 'main', title: 'Spider Drill con coni', sets: '3', reps: '1 giro', rest: "2'" },
        { phase: 'main', title: 'Navette 5-10-5 m con frenata decisa', sets: '4', reps: '1 navetta', rest: "75''" },
      ],
    },
    {
      day: 4, title: 'Potenza rotazionale & Pliometria', discipline: 'power_plyo',
      blocks: [
        { phase: 'warmup', title: 'Extrarotatori spalla con elastico', sets: '3', reps: '12+12', load: 'Elastico rosso', rest: "30''" },
        { phase: 'main', title: 'Lanci palla medica rotazionali', sets: '4', reps: '6+6', load: 'Palla medica 3 kg', rest: "60''" },
        { phase: 'main', title: 'Box Jump con atterraggio morbido', sets: '4', reps: '5', load: 'Box 50 cm', rest: "90''" },
      ],
    },
    {
      day: 6, title: 'Mobilità & Prevenzione Cuffia Rotatori', discipline: 'mobility_prehab',
      blocks: [
        { phase: 'main', title: 'Extrarotatori ed intrarotatori con elastico', sets: '3', reps: '15+15', load: 'Elastico medio', rest: "30''" },
      ],
    },
  ],
})
