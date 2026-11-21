import type { Discipline, SessionStatus, TrainingPlanDatabase, WorkoutBlock, WorkoutFeedback, WorkoutSession } from '../types'
import { addDays, todayISO, weekStart } from './dates'
import { newAthlete, newDb } from './db'

const b = (phase: WorkoutBlock['phase'], title: string, extra: Partial<WorkoutBlock> = {}): WorkoutBlock => ({ id: `b-${Math.random().toString(36).slice(2, 9)}`, phase, title, ...extra })

interface Tpl { day: number; title: string; discipline: Discipline; notes?: string; blocks: WorkoutBlock[]; log?: Partial<WorkoutFeedback> }

const weekTemplate = (): Tpl[] => [
  { day: 1, title: 'Ripetute 6×800 m', discipline: 'run_quality', notes: 'Stesso passo su tutte le ripetute: se la 5ª è lenta, la 6ª no!',
    blocks: [b('warmup', 'Corsa facile + andature', { duration: "15'", zone: 'Z2' }), b('main', 'Ripetute', { sets: '6', distance: '800 m', pace: '4:05 /km', rest: "90'' trotando" }), b('cooldown', 'Defaticamento', { duration: "10'", zone: 'Z1' })],
    log: { durationMin: 62, distanceKm: 11.2, avgPace: '5:32', rpe: 7, feel: 'good', comment: 'Ripetute regolari, ultima un po’ dura.' } },
  { day: 2, title: 'Forza gambe + core', discipline: 'strength', notes: 'Cura la profondità dello squat.',
    blocks: [b('warmup', 'Mobilità anche e caviglie', { duration: "8'" }), b('main', 'Back squat', { sets: '4', reps: '6', load: '70 kg', rest: "2'" }), b('main', 'Affondi camminati', { sets: '3', reps: '12+12', load: '2×16 kg', rest: "90''" }), b('main', 'Plank + dead bug', { sets: '3', duration: "45''", rest: "30''" }), b('cooldown', 'Stretching', { duration: "6'" })],
    log: { durationMin: 58, rpe: 6, feel: 'ok', comment: 'Squat pesante ma pulito.' } },
  { day: 3, title: 'SkiErg + BikeErg', discipline: 'ergo',
    blocks: [b('warmup', 'BikeErg facile', { duration: "8'", zone: 'Z1-Z2' }), b('main', 'SkiErg', { sets: '5', distance: '500 m', pace: '2:00 /500 m', rest: "60''" }), b('main', 'BikeErg', { sets: '4', duration: "4'", load: '220 W', rest: "2'" }), b('cooldown', 'Pedalata sciolta', { duration: "6'", zone: 'Z1' })],
    log: { durationMin: 50, rpe: 7, feel: 'tired', comment: 'Gambe ancora cariche dal giorno prima.' } },
  { day: 4, title: 'Hyrox · Metcon', discipline: 'hyrox', notes: 'Obiettivo: transizioni veloci, niente pause lunghe.',
    blocks: [b('warmup', 'Riscaldamento specifico', { duration: "10'", notes: 'Corsa leggera + 2 giri di sled leggero' }), b('main', 'Giro Hyrox (×3)', { sets: '3', notes: '1 km corsa + 50 m sled push + 25 wall ball', rest: "3'" }), b('cooldown', 'Camminata + respirazione', { duration: "8'" })],
    log: { durationMin: 55, rpe: 8, feel: 'great', comment: 'Wall ball senza interruzioni nei primi due giri.' } },
  { day: 5, title: 'Recupero attivo', discipline: 'recovery', blocks: [b('main', 'Camminata o nuoto facile', { duration: "30'", zone: 'Z1' }), b('cooldown', 'Foam roller', { duration: "10'" })],
    log: { durationMin: 35, rpe: 2, feel: 'good' } },
  { day: 6, title: 'Lungo progressivo', discipline: 'run_long', notes: 'Ultimi 4 km a ritmo maratona.',
    blocks: [b('warmup', 'Corsa molto facile', { duration: "10'", zone: 'Z1-Z2' }), b('main', 'Corsa continua', { distance: '16 km', zone: 'Z2 → Z3 ultimi 4 km' }), b('cooldown', 'Camminata', { duration: "5'" })],
    log: { durationMin: 95, distanceKm: 16.4, avgPace: '5:47', rpe: 6, feel: 'good', comment: 'Bene, finale in progressione.' } },
  { day: 7, title: 'Tennis (libero)', discipline: 'other', blocks: [b('main', 'Partita o palleggio', { duration: "60'" })],
    log: { durationMin: 60, rpe: 4, feel: 'great' } },
]

const toSession = (t: Tpl, date: string, status: SessionStatus): WorkoutSession => {
  const stamp = `${date}T08:00:00.000Z`
  return {
    id: `demo-${date}-${t.day}`, date, title: t.title, discipline: t.discipline, blocks: t.blocks.map((x, i) => ({ ...x, id: `b-${date}-${t.day}-${i}` })),
    coachNotes: t.notes ?? '', createdBy: 'coach', planUpdatedAt: stamp,
    status, feedback: status === 'planned' ? null : { loggedAt: stamp, ...(t.log ?? {}) }, logUpdatedAt: stamp, updatedAt: stamp,
  }
}

/** Piano di esempio ancorato alla settimana corrente: settimana scorsa completata, questa in corso, la prossima pianificata. */
export const sampleDb = (variant: 1 | 2): TrainingPlanDatabase => {
  const athlete = variant === 1
    ? newAthlete('Giulia Demo', 'Hyrox · Mezza maratona', null, 'Coach Demo')
    : newAthlete('Marco Demo', 'Corsa 10 km · Forza', null, 'Coach Demo')
  athlete.id = `demo-athlete-${variant}`
  athlete.updatedAt = '2000-01-01T00:00:00.000Z'
  const db = newDb(athlete, 'demo')
  db.meta.dbId = `demo-db-${variant}`
  const today = todayISO()
  const mon = weekStart(today)
  const sessions: WorkoutSession[] = []
  const tpl = weekTemplate()
  for (let w = -1; w <= 1; w++) {
    for (const t of tpl) {
      if (variant === 2 && (t.discipline === 'hyrox' || t.discipline === 'ergo')) continue
      const date = addDays(mon, w * 7 + t.day - 1)
      const status: SessionStatus = date < today ? (t.day === 3 && w === 0 ? 'partial' : 'done') : 'planned'
      if (variant === 2 && date < today && t.day === 5) { sessions.push(toSession(t, date, 'skipped')); continue }
      sessions.push(toSession(t, date, status))
    }
  }
  db.sessions = sessions
  return db
}
