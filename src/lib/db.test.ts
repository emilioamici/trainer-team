import { describe, expect, it } from 'vitest'
import { blankSession, mergeDb, mergeRegistry, newAthlete, newDb, parseDb, periodStats, placeholderDb, removeEntry, removeSession, setLog, updateAthlete, upsertEntry, upsertSession, emptyRegistry } from './db'
import { sampleDb } from './sample'

const mk = () => newDb(newAthlete('Test'), 'x')
const sess = (db: ReturnType<typeof mk>, date = '2026-03-02') => {
  const s = { ...blankSession(date, 'coach'), title: 'Corsa' }
  return { db: upsertSession(db, s, 'x'), id: s.id }
}
const wait = () => new Promise((r) => setTimeout(r, 5))

describe('parseDb', () => {
  it('normalizza i campi mancanti', () => {
    const db = parseDb({ sessions: [{ date: '2026-03-02', title: 'x', blocks: [{ title: 'b' }] }], athlete: { name: 'Anna' } })
    expect(db.sessions[0].status).toBe('planned')
    expect(db.sessions[0].blocks[0].phase).toBe('main')
    expect(db.athlete.athleteCanEdit).toBe(false)
  })
  it('scarta sessioni senza data valida e rifiuta versioni future', () => {
    expect(parseDb({ sessions: [{ title: 'x' }] }).sessions).toHaveLength(0)
    expect(() => parseDb({ schemaVersion: 99 })).toThrow()
    expect(() => parseDb(null)).toThrow()
  })
  it('round-trip senza perdere campi', () => {
    const { db } = sess(mk())
    expect(parseDb(JSON.parse(JSON.stringify(db)))).toEqual(db)
  })
  it('limita RPE a 1-10', () => {
    const db = parseDb({ sessions: [{ date: '2026-03-02', feedback: { rpe: 15 }, status: 'done' }] })
    expect(db.sessions[0].feedback?.rpe).toBe(10)
  })
})

describe('mergeDb', () => {
  it('unisce sessioni aggiunte su due dispositivi senza perderne', () => {
    const base = mk()
    const a = sess(base, '2026-03-02').db
    const b = sess(base, '2026-03-03').db
    expect(mergeDb(a, b).sessions).toHaveLength(2)
  })
  it('coach e atleta sulla stessa sessione: piano e log si compongono', async () => {
    const { db: base, id } = sess(mk())
    await wait()
    const coach = upsertSession(base, { ...base.sessions[0], title: 'Corsa modificata dal coach' }, 'coach')
    await wait()
    const athlete = setLog(base, id, 'done', { rpe: 7, comment: 'ok', loggedAt: '' }, 'atleta')
    const m = mergeDb(coach, athlete)
    expect(m.sessions[0].title).toBe('Corsa modificata dal coach')
    expect(m.sessions[0].status).toBe('done')
    expect(m.sessions[0].feedback?.rpe).toBe(7)
    expect(mergeDb(athlete, coach)).toEqual(m)
  })
  it('le cancellazioni sono lapidi: vince la più recente', async () => {
    const { db: base, id } = sess(mk())
    await wait()
    const removed = removeSession(base, id, 'x')
    expect(mergeDb(base, removed).sessions).toHaveLength(0)
    await wait()
    const edited = upsertSession(removed, { ...base.sessions[0], title: 'Resuscitata' }, 'x')
    expect(mergeDb(removed, edited).sessions).toHaveLength(1)
  })
  it('non cancella mai per assenza', () => {
    const { db } = sess(mk())
    expect(mergeDb(db, mk()).sessions).toHaveLength(1)
  })
  it('è idempotente e commutativa', () => {
    const a = sess(mk(), '2026-03-02').db
    const b = sess(mk(), '2026-03-09').db
    const m = mergeDb(a, b)
    expect(mergeDb(m, b)).toEqual(m)
    expect(mergeDb(b, a).sessions.map((s) => s.id).sort()).toEqual(m.sessions.map((s) => s.id).sort())
  })
})

describe('registro del coach', () => {
  it('merge per atleta con lapidi', async () => {
    const e = { athleteId: 'a1', name: 'A', focus: '', email: null, fileId: null, addedAt: '', invitedAt: null, updatedAt: '' }
    const r1 = upsertEntry(emptyRegistry(), e)
    const r2 = upsertEntry(emptyRegistry(), { ...e, athleteId: 'a2', name: 'B' })
    expect(mergeRegistry(r1, r2).athletes).toHaveLength(2)
    await wait()
    const gone = removeEntry(r1, 'a1')
    expect(mergeRegistry(gone, r1).athletes).toHaveLength(0)
  })
})

describe('statistiche e demo', () => {
  it('la demo copre 3 settimane con sessioni completate e pianificate', () => {
    const db = sampleDb(1)
    expect(db.sessions.length).toBeGreaterThan(15)
    expect(db.sessions.some((s) => s.status === 'planned')).toBe(true)
    const st = periodStats(db.sessions)
    expect(st.done).toBeGreaterThan(5)
    expect(st.avgRpe).not.toBeNull()
    expect(parseDb(JSON.parse(JSON.stringify(db)))).toEqual(db)
  })
  it('periodStats somma minuti e km solo di sessioni svolte', () => {
    const st = periodStats([
      { ...blankSession('2026-03-02', 'coach'), status: 'done', feedback: { durationMin: 60, distanceKm: 10, rpe: 6, loggedAt: '' } },
      { ...blankSession('2026-03-03', 'coach'), status: 'skipped', feedback: { durationMin: 99, loggedAt: '' } },
    ])
    expect(st).toMatchObject({ minutes: 60, km: 10, done: 1, skipped: 1, avgRpe: 6 })
  })
})

describe('segnaposto di un piano che esiste già su Drive', () => {
  it('nel merge vince sempre il profilo remoto (colore, icona, orari non si perdono)', () => {
    const remote = mk()
    remote.athlete = { ...remote.athlete, name: 'Gruppo A', color: 'blue', icon: 'trophy', targetKind: 'group', scheduleSlots: [{ id: 's', day: 'Lunedì', startTime: '15:00', endTime: '16:00' }] }
    const placeholder = placeholderDb({ ...newAthlete('Gruppo A'), id: remote.athlete.id }, 'x') // profilo vuoto, creato "adesso"
    for (const m of [mergeDb(placeholder, remote), mergeDb(remote, placeholder)]) {
      expect(m.athlete).toMatchObject({ color: 'blue', icon: 'trophy', targetKind: 'group' })
      expect(m.athlete.scheduleSlots).toHaveLength(1)
    }
  })
  it('una modifica locale successiva batte invece il segnaposto', async () => {
    const placeholder = placeholderDb(newAthlete('Io'), 'x')
    await wait()
    const edited = updateAthlete(placeholder, { name: 'Luca' }, 'x')
    expect(mergeDb(edited, mk()).athlete.name).toBe('Luca')
  })
})
