import { describe, expect, it } from 'vitest'
import {
  cloneSessionsWithNewIds,
  COACH_EXPORT_FORMAT,
  exportAllAthletes,
  exportPlan,
  isMultiAthletePlan,
  parseMultiAthletePlan,
  parsePlanFile,
  templatePlan,
} from './planIO'
import { addSessions, blankSession, newAthlete, newDb } from './db'
import type { Source } from '../types'

describe('import/export piano', () => {
  it('il modello si importa partendo dal lunedì scelto', () => {
    const r = parsePlanFile(JSON.stringify(templatePlan()), '2026-03-02', 'coach')
    expect(r.sessions.map((s) => s.date)).toEqual(['2026-03-02', '2026-03-04', '2026-03-05', '2026-03-07'])
    expect(r.sessions[0].blocks).toHaveLength(3)
    expect(r.sessions.every((s) => s.status === 'planned')).toBe(true)
  })
  it('week sposta in avanti, date assolute restano', () => {
    const r = parsePlanFile(JSON.stringify([{ day: 2, week: 1, title: 'a' }, { date: '2026-05-05', title: 'b' }, { title: 'senza data' }]), '2026-03-02', 'athlete')
    expect(r.sessions.map((s) => s.date)).toEqual(['2026-03-10', '2026-05-05'])
    expect(r.skipped).toBe(1)
  })
  it('errori chiari', () => {
    expect(() => parsePlanFile('non json', '2026-03-02', 'coach')).toThrow()
    expect(() => parsePlanFile('{"x":1}', '2026-03-02', 'coach')).toThrow()
  })
  it('export → import ricostruisce lo stesso piano (con nuovi id)', () => {
    let db = newDb(newAthlete('T'), 'x')
    db = addSessions(db, [{ ...blankSession('2026-03-02', 'coach'), title: 'Corsa', blocks: [{ id: 'b', phase: 'warmup', title: 'Riscaldamento', duration: "10'" }] }], 'x')
    const out = exportPlan(db)
    const back = parsePlanFile(JSON.stringify(out), '2026-03-02', 'coach')
    expect(back.sessions[0]).toMatchObject({ date: '2026-03-02', title: 'Corsa' })
    expect(back.sessions[0].blocks[0]).toMatchObject({ phase: 'warmup', duration: "10'" })
    expect(back.sessions[0].id).not.toBe(db.sessions[0].id)
  })
  it('il feedback si esporta solo se richiesto', () => {
    let db = newDb(newAthlete('T'), 'x')
    db = addSessions(db, [{ ...blankSession('2026-03-02', 'coach'), status: 'done', feedback: { rpe: 5, loggedAt: '' } }], 'x')
    expect(JSON.stringify(exportPlan(db))).not.toContain('feedback')
    expect(JSON.stringify(exportPlan(db, { withLog: true }))).toContain('feedback')
  })
  it('esporta e reimporta tutti gli atleti per il coach', () => {
    let db1 = newDb(newAthlete('Mario Rossi', 'Maratona'), 'coach')
    db1 = addSessions(db1, [{ ...blankSession('2026-03-02', 'coach'), title: 'Corsa Mario' }], 'coach')
    const s1: Source = { id: 'athlete:1', kind: 'coach-athlete', fileId: null, name: 'Mario Rossi' }

    let db2 = newDb(newAthlete('Giulia Bianchi', 'Hyrox'), 'coach')
    db2 = addSessions(db2, [{ ...blankSession('2026-03-03', 'coach'), title: 'WOD Giulia' }], 'coach')
    const s2: Source = { id: 'athlete:2', kind: 'coach-athlete', fileId: null, name: 'Giulia Bianchi' }

    const exported = exportAllAthletes([{ source: s1, db: db1 }, { source: s2, db: db2 }])
    expect(exported.format).toBe(COACH_EXPORT_FORMAT)
    expect(exported.athletes).toHaveLength(2)
    expect(exported.athletes[0].athleteName).toBe('Mario Rossi')
    expect(exported.athletes[1].athleteName).toBe('Giulia Bianchi')

    const jsonStr = JSON.stringify(exported)
    expect(isMultiAthletePlan(jsonStr)).toBe(true)
    expect(isMultiAthletePlan('{"format":"trainer-team-plan","sessions":[]}')).toBe(false)

    const parsed = parseMultiAthletePlan(jsonStr, '2026-03-02', 'coach')
    expect(parsed.athletes).toHaveLength(2)
    expect(parsed.athletes[0].athleteName).toBe('Mario Rossi')
    expect(parsed.athletes[0].sessions[0].title).toBe('Corsa Mario')
    expect(parsed.athletes[1].athleteName).toBe('Giulia Bianchi')
    expect(parsed.athletes[1].sessions[0].title).toBe('WOD Giulia')
  })
  it('cloneSessionsWithNewIds rigenera gli id di sessioni e blocchi', () => {
    let db = newDb(newAthlete('T'), 'x')
    db = addSessions(db, [{ ...blankSession('2026-03-02', 'coach'), title: 'Corsa', blocks: [{ id: 'b-orig', phase: 'warmup', title: 'Riscaldamento' }] }], 'x')
    const cloned = cloneSessionsWithNewIds(db.sessions)
    expect(cloned).toHaveLength(1)
    expect(cloned[0].id).not.toBe(db.sessions[0].id)
    expect(cloned[0].blocks[0].id).not.toBe(db.sessions[0].blocks[0].id)
    expect(cloned[0].title).toBe('Corsa')
  })
})
