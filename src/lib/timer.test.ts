import { describe, expect, it } from 'vitest'
import { buildSteps, fmtClock, groupBlocks, intervalSteps, parseSeconds } from './timer'
import { parseBlock, duplicateSession, blankSession } from './db'
import type { WorkoutBlock } from '../types'

const b = (o: Partial<WorkoutBlock>): WorkoutBlock => ({ id: Math.random().toString(), phase: 'main', title: 'x', ...o })

describe('parseSeconds', () => {
  it.each([
    ["90''", 'm', 90], ["2'", 's', 120], ['1\'30"', 's', 90], ['1:30', 's', 90], ['2 min', 's', 120],
    ['45 sec', 'm', 45], ['45s', 'm', 45], ['90', 's', 90], ['20', 'm', 1200], ["90-120''", 's', 90], ['1,5 min', 's', 90],
  ] as const)('%s → %i', (raw, unit, out) => expect(parseSeconds(raw, unit)).toBe(out))
  it('non valido', () => { expect(parseSeconds('', 's')).toBeNull(); expect(parseSeconds('libero', 's')).toBeNull() })
})

describe('buildSteps', () => {
  it('serie con recupero, senza recupero finale', () => {
    const st = buildSteps([b({ title: 'Squat', sets: '3', reps: '6', rest: "90''" })])
    expect(st.map((s) => s.kind)).toEqual(['manual', 'rest', 'manual', 'rest', 'manual'])
    expect(st[1].seconds).toBe(90)
  })
  it('esercizio a tempo', () => {
    const st = buildSteps([b({ title: 'Plank', sets: '2', duration: "45''", rest: "30''" })])
    expect(st.map((s) => [s.kind, s.seconds])).toEqual([['work', 45], ['rest', 30], ['work', 45]])
  })
  it('superset: alterna A e B, recupero a fine giro', () => {
    const st = buildSteps([
      b({ title: 'A', sets: '2', reps: '8', supersetId: 's' }),
      b({ title: 'B', sets: '2', duration: "30''", rest: "60''", supersetId: 's' }),
    ])
    expect(st.map((s) => s.kind + ':' + s.label)).toEqual(['manual:A', 'work:B', 'rest:A + B', 'manual:A', 'work:B'])
  })
  it('superset con un solo blocco non è superset', () => {
    expect(groupBlocks([b({ supersetId: 'z' })])[0][0].supersetId).toBeUndefined()
  })
  it('riscaldamento prima del principale', () => {
    const st = buildSteps([b({ title: 'M', phase: 'main' }), b({ title: 'W', phase: 'warmup' })])
    expect(st[0].label).toBe('W')
  })
  it('intervalli', () => {
    expect(intervalSteps(30, 10, 3).map((s) => s.kind)).toEqual(['work', 'rest', 'work', 'rest', 'work'])
  })
})

describe('superset nei dati', () => {
  it('parseBlock conserva supersetId', () => {
    expect(parseBlock({ title: 'a', supersetId: 'A' })?.supersetId).toBe('A')
  })
  it('duplicate rimappa gli id coerentemente', () => {
    const s = { ...blankSession('2026-03-02', 'coach'), blocks: [b({ supersetId: 'q' }), b({ supersetId: 'q' }), b({})] }
    const d = duplicateSession(s, '2026-03-09')
    expect(d.blocks[0].supersetId).toBeTruthy()
    expect(d.blocks[0].supersetId).toBe(d.blocks[1].supersetId)
    expect(d.blocks[0].supersetId).not.toBe('q')
    expect(d.blocks[2].supersetId).toBeUndefined()
  })
})

describe('fmtClock', () => { it('formatta', () => { expect(fmtClock(65)).toBe('01:05'); expect(fmtClock(3700)).toBe('1:01:40') }) })
