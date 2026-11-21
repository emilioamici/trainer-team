import { describe, expect, it } from 'vitest'
import { exportPlan, parsePlanFile, templatePlan } from './planIO'
import { addSessions, blankSession, newAthlete, newDb } from './db'

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
})
