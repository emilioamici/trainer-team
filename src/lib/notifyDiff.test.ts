import { describe, expect, it } from 'vitest'
import { blankSession, mergeDb, newAthlete, newDb, setLog, upsertSession } from './db'
import { diffNotifications } from './notifyDiff'

const wait = () => new Promise((r) => setTimeout(r, 5))
const base = () => {
  let db = newDb(newAthlete('Luca Rossi'), 'x')
  db = upsertSession(db, { ...blankSession('2026-03-02', 'coach'), title: 'Test 10 km' }, 'coach')
  return db
}

describe('avvisi in-app dal confronto con Drive', () => {
  it('coach: il feedback dell’atleta genera un avviso, il proprio lavoro no', async () => {
    const local = base()
    await wait()
    const remote = setLog(local, local.sessions[0].id, 'done', { rpe: 7, loggedAt: '' }, 'atleta')
    const n = diffNotifications(local, mergeDb(local, remote), 'coach-athlete', 'athlete:a1')
    expect(n).toHaveLength(1)
    expect(n[0]).toMatchObject({ title: 'Luca Rossi', kind: 'feedback', targetId: 'athlete:a1' })
    expect(n[0].body).toContain('Test 10 km'); expect(n[0].body).toContain('RPE 7')
    // modifiche solo locali: nessun avviso
    expect(diffNotifications(remote, mergeDb(remote, local), 'coach-athlete', 'a')).toEqual([])
  })
  it('atleta: nuova sessione o sessione modificata dal coach', async () => {
    const local = base()
    await wait()
    const remote = upsertSession(upsertSession(local, { ...local.sessions[0], title: 'Test 12 km' }, 'coach'), { ...blankSession('2026-03-03', 'coach'), title: 'Forza' }, 'coach')
    const n = diffNotifications(local, mergeDb(local, remote), 'linked', 'linked:f')
    expect(n.map((x) => x.kind)).toEqual(['workout', 'workout'])
    expect(n.map((x) => x.body).join('|')).toContain('Forza')
  })
  it('oltre 3 cambi: un solo avviso riepilogativo', async () => {
    const local = newDb(newAthlete('A'), 'x')
    await wait()
    let remote = local
    for (let i = 0; i < 5; i++) remote = upsertSession(remote, { ...blankSession(`2026-03-0${i + 1}`, 'coach'), title: 'S' + i }, 'coach')
    const n = diffNotifications(local, mergeDb(local, remote), 'linked', 'l')
    expect(n).toHaveLength(1); expect(n[0].body).toContain('5')
  })
  it('personal e demo: mai avvisi; nessun cambiamento: nessun avviso', () => {
    const db = base()
    expect(diffNotifications(db, db, 'personal', 'personal')).toEqual([])
    expect(diffNotifications(db, db, 'linked', 'l')).toEqual([])
  })
})
