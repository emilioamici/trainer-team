import type { Discipline, SessionStatus, TrainingPlanDatabase, WorkoutBlock, WorkoutFeedback, WorkoutSession } from '../types'
import { addDays, todayISO, weekStart } from './dates'
import { newAthlete, newDb } from './db'

const b = (phase: WorkoutBlock['phase'], title: string, extra: Partial<WorkoutBlock> = {}): WorkoutBlock => ({
  id: `b-${Math.random().toString(36).slice(2, 9)}`,
  phase,
  title,
  ...extra,
})

interface Tpl {
  day: number
  title: string
  discipline: Discipline
  notes?: string
  blocks: WorkoutBlock[]
  attendance?: string[]
  log?: Partial<WorkoutFeedback>
}

const GROUP_MEMBERS = ['Matteo B.', 'Sofia V.', 'Leonardo T.', 'Edoardo F.', 'Chiara M.', 'Gabriele R.']

const weekTemplateGroup = (): Tpl[] => [
  {
    day: 1,
    title: 'Forza funzionale & Core tennis',
    discipline: 'strength',
    notes: 'Profondità squat e controllo nei cambi di carico.',
    attendance: ['Matteo B.', 'Sofia V.', 'Leonardo T.', 'Edoardo F.', 'Chiara M.'],
    blocks: [
      b('warmup', 'Mobilità anche 90-90 e caviglie', { duration: "8'", equipment: 'Tappetino' }),
      b('main', 'Back Squat con bilanciere', { sets: '4', reps: '6', load: 'Bilanciere con 45 kg', rest: "2'", equipment: 'Bilanciere' }),
      b('main', 'Affondi Bulgari con manubri', { sets: '3', reps: '8+8', load: 'Manubri da 12 kg', rest: "90''", equipment: 'Manubri' }),
      b('main', 'Pallof Press anti-rotazione', { sets: '3', reps: '10+10', load: 'Elastico medio', rest: "45''", equipment: 'Elastici' }),
      b('cooldown', 'Foam roller & allungamento', { duration: "8'", equipment: 'Foam Roller' }),
    ],
    log: { durationMin: 60, rpe: 7, feel: 'good', comment: 'Ottima seduta, carichi rispettati da tutti.' },
  },
  {
    day: 2,
    title: 'Prevenzione, Core & Mobilità spalla',
    discipline: 'mobility_prehab',
    notes: 'Rinforzo cuffia dei rotatori e stabilizzatori del tronco.',
    attendance: ['Matteo B.', 'Sofia V.', 'Leonardo T.', 'Edoardo F.', 'Chiara M.', 'Gabriele R.'],
    blocks: [
      b('warmup', 'Dislocazioni spalle con bastone / elastico', { sets: '2', reps: '10', rest: "30''" }),
      b('main', 'Extrarotatori spalla con elastico (Cuffia rotatori)', { sets: '3', reps: '15+15', load: 'Elastico rosso', rest: "30''" }),
      b('main', 'Russian Twist con palla medica / disco', { sets: '3', reps: '12+12', load: 'Palla da 4 kg', rest: "45''" }),
      b('cooldown', 'Foam Roller & rilascio miofasciale', { duration: "10'" }),
    ],
    log: { durationMin: 40, rpe: 4, feel: 'good' },
  },
  {
    day: 3,
    title: 'Agilità, Footwork & Scaletta coordinazione',
    discipline: 'agility_footwork',
    notes: 'Rapidità di piedi, focus su split-step e frenata esterna.',
    attendance: ['Matteo B.', 'Sofia V.', 'Leonardo T.', 'Edoardo F.', 'Gabriele R.'],
    blocks: [
      b('warmup', 'Scaletta coordinazione: Icky Shuffle', { sets: '4', reps: '1 passaggio', rest: "45''", equipment: 'Scaletta' }),
      b('main', 'Spider Drill (Test del Ragno con coni)', { sets: '3', reps: '1 giro', rest: "2'", equipment: 'Coni' }),
      b('main', 'Navette 5-10-5 m con frenata decisa', { sets: '4', reps: '1 navetta', rest: "75''", equipment: 'Coni' }),
      b('main', 'Split-step reattivo + scatto a segnale', { sets: '6', reps: '1 scatto', rest: "45''" }),
      b('cooldown', 'Decompressione colonna & respirazione', { duration: "6'" }),
    ],
    log: { durationMin: 55, rpe: 8, feel: 'great', comment: 'Navette con ritmo eccellente.' },
  },
  {
    day: 5,
    title: 'Potenza, Pliometria & Spalle',
    discipline: 'power_plyo',
    notes: 'Trasferimento cinetico anca-spalla per servizio e accelerazione colpi.',
    attendance: ['Matteo B.', 'Sofia V.', 'Leonardo T.', 'Chiara M.', 'Gabriele R.'],
    blocks: [
      b('warmup', 'Extrarotatori spalla con elastico (Cuffia rotatori)', { sets: '3', reps: '12+12', load: 'Elastico rosso', rest: "30''", equipment: 'Elastici' }),
      b('main', 'Lanci palla medica rotazionali (Dritto/Rovescio)', { sets: '3', reps: '6+6', load: 'Palla medica 3 kg', rest: "60''", equipment: 'Palla medica' }),
      b('main', 'Box Jump con atterraggio morbido', { sets: '4', reps: '5', load: 'Box 50 cm', rest: "90''", equipment: 'Box' }),
      b('main', 'Slam palla medica a terra', { sets: '3', reps: '8', load: 'Palla medica 5 kg', rest: "60''", equipment: 'Palla medica' }),
      b('cooldown', 'Sleeper stretch spalla dominante', { duration: "8'" }),
    ],
    log: { durationMin: 50, rpe: 7, feel: 'good', comment: 'Palla medica esplosiva, spalle ben riscaldate.' },
  },
  {
    day: 6,
    title: 'Test match & Tennis specifico',
    discipline: 'other',
    notes: 'Applicazione del footwork e reattività in partita.',
    attendance: GROUP_MEMBERS,
    blocks: [
      b('main', 'Partita a set con focus su recupero tra punti', { duration: "75'" }),
    ],
    log: { durationMin: 75, rpe: 6, feel: 'great' },
  },
  {
    day: 7,
    title: 'Scarico & Mobilità attiva',
    discipline: 'recovery',
    blocks: [
      b('main', 'Camminata sciolta + mobilità articolare', { duration: "25'" }),
      b('cooldown', 'Stretching catena cinetica posteriore', { duration: "10'" }),
    ],
    log: { durationMin: 35, rpe: 2, feel: 'good' },
  },
]

const weekTemplatePro = (): Tpl[] => [
  {
    day: 1,
    title: 'Forza Massima & Trap Bar (Individual Athlete)',
    discipline: 'strength',
    notes: 'Focus su spinta massimale e stabilità ginocchio/anca.',
    blocks: [
      b('warmup', 'Y-T-W Scapolari alla panca', { sets: '2', reps: '8 per posizione', rest: "45''" }),
      b('main', 'Trap Bar Deadlift (Stacco)', { sets: '4', reps: '5', load: 'Trap Bar con 75 kg', rest: "2'", equipment: 'Trap Bar' }),
      b('main', 'Distensioni panca piana con manubri', { sets: '4', reps: '8', load: 'Manubri da 24 kg', rest: "90''", equipment: 'Manubri' }),
      b('main', 'Landmine Press mono-braccio', { sets: '3', reps: '8+8', load: 'Bilanciere con 20 kg', rest: "60''", equipment: 'Landmine' }),
      b('cooldown', 'Stretching & mobilità anche 90-90', { duration: "10'" }),
    ],
    log: { durationMin: 65, rpe: 8, feel: 'good', comment: 'Trap bar solida a 75kg, manubri da 24kg completati senza aiuti.' },
  },
  {
    day: 3,
    title: 'Potenza Rotazionale & Balzi reattivi',
    discipline: 'power_plyo',
    notes: 'Velocità esecutiva e trasferimento per il servizio.',
    blocks: [
      b('warmup', 'Dislocazioni spalle con bastone', { sets: '2', reps: '10', rest: "30''" }),
      b('main', 'Lanci palla medica rotazionali', { sets: '4', reps: '6+6', load: 'Palla medica 4 kg', rest: "75''", equipment: 'Palla medica' }),
      b('main', 'Push Press esplosivo con manubri', { sets: '4', reps: '5', load: 'Manubri da 16 kg', rest: "90''", equipment: 'Manubri' }),
      b('main', 'Balzi laterali con arresto (Skater Jumps)', { sets: '3', reps: '6+6', rest: "60''" }),
      b('cooldown', 'Sleeper stretch spalla', { duration: "8'" }),
    ],
    log: { durationMin: 55, rpe: 7, feel: 'great', comment: 'Grande feeling sui balzi e spinta spalla fluida.' },
  },
  {
    day: 4,
    title: 'Condizionamento & Intervalli SkiErg',
    discipline: 'tennis_conditioning',
    notes: 'Resistenza anaerobica a navetta.',
    blocks: [
      b('warmup', 'BikeErg riscaldamento', { duration: "8'" }),
      b('main', 'SkiErg: ripetute di potenza', { sets: '5', reps: '250 m', load: 'Passo < 1:52 /500 m', rest: "60''", equipment: 'SkiErg' }),
      b('main', 'Circuito Interval Tennis (20" ON / 20" OFF)', { sets: '3 giri', reps: '6 stazioni', rest: "2'" }),
      b('cooldown', 'Foam roller & decompressione', { duration: "8'" }),
    ],
    log: { durationMin: 50, rpe: 8, feel: 'tired', comment: 'Intervalli tirati al massimo.' },
  },
  {
    day: 5,
    title: 'Mobilità & Prevenzione Cuffia Rotatori',
    discipline: 'mobility_prehab',
    notes: 'Prevenzione sovraccarichi tornei e spalla dominante.',
    blocks: [
      b('main', 'Extrarotatori con elastico (Cuffia rotatori)', { sets: '3', reps: '15+15', load: 'Elastico verde', rest: "30''", equipment: 'Elastici' }),
      b('main', 'Intrarotatori con elastico', { sets: '2', reps: '12+12', load: 'Elastico leggero', rest: "30''", equipment: 'Elastici' }),
      b('main', 'Plank laterale con abduzione gamba', { sets: '3', reps: '30 sec per lato', rest: "30''" }),
      b('cooldown', 'Foam roller & allungamento dorsali', { duration: "10'" }),
    ],
    log: { durationMin: 40, rpe: 3, feel: 'great', comment: 'Spalla perfettamente sciolta.' },
  },
  {
    day: 6,
    title: 'Seduta Campo & Footwork ATP',
    discipline: 'agility_footwork',
    notes: 'Cambio di superficie e frenate secche.',
    blocks: [
      b('main', 'Navette 5-10-5 m con frenata decisa', { sets: '5', reps: '1 navetta', rest: "60''" }),
      b('main', 'Split-step reattivo + scatto a segnale', { sets: '8', reps: '1 scatto', rest: "45''" }),
    ],
    log: { durationMin: 45, rpe: 7, feel: 'good' },
  },
]

const toSession = (t: Tpl, date: string, status: SessionStatus): WorkoutSession => {
  const stamp = `${date}T08:00:00.000Z`
  return {
    id: `demo-${date}-${t.day}`,
    date,
    title: t.title,
    discipline: t.discipline,
    blocks: t.blocks.map((x, i) => ({ ...x, id: `b-${date}-${t.day}-${i}` })),
    coachNotes: t.notes ?? '',
    createdBy: 'coach',
    planUpdatedAt: stamp,
    status,
    feedback: status === 'planned' ? null : { loggedAt: stamp, ...(t.log ?? {}) },
    logUpdatedAt: stamp,
    updatedAt: stamp,
    ...(t.attendance ? { attendance: t.attendance } : {}),
  }
}

/** Piano di esempio ancorato alla settimana corrente: settimana scorsa completata, questa in corso, la prossima pianificata. */
export const sampleDb = (variant: 1 | 2): TrainingPlanDatabase => {
  const athlete =
    variant === 1
      ? newAthlete(
          'Agonistica U16 - Gruppo A',
          'Preparazione atletica FIT · Agonistica',
          null,
          'Coach FIT',
          'group',
          GROUP_MEMBERS,
          'Lun - Mer - Ven 16:30 - 18:00'
        )
      : newAthlete(
          'Marco Rossi (Individual Athlete ATP)',
          'ATP Tour · Potenza & Prevenzione',
          null,
          'Coach FIT',
          'individual',
          [],
          ''
        )
  athlete.id = `demo-athlete-${variant}`
  athlete.updatedAt = '2000-01-01T00:00:00.000Z'
  const db = newDb(athlete, 'demo')
  db.meta.dbId = `demo-db-${variant}`
  const today = todayISO()
  const mon = weekStart(today)
  const sessions: WorkoutSession[] = []
  const tpl = variant === 1 ? weekTemplateGroup() : weekTemplatePro()
  for (let w = -1; w <= 1; w++) {
    for (const t of tpl) {
      const date = addDays(mon, w * 7 + t.day - 1)
      const status: SessionStatus = date < today ? (t.day === 3 && w === 0 ? 'partial' : 'done') : 'planned'
      if (variant === 2 && date < today && t.day === 5) {
        sessions.push(toSession(t, date, 'skipped'))
        continue
      }
      sessions.push(toSession(t, date, status))
    }
  }
  db.sessions = sessions
  return db
}
