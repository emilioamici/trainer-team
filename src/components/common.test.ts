import { describe, expect, it } from 'vitest'
import { visibleMembers } from './common'
import { newAthlete, newDb } from '../lib/db'
import type { Source } from '../types'

const group = () => { const db = newDb({ ...newAthlete('Gruppo A'), targetKind: 'group', members: ['Anna', 'Bruno'] }, 'x'); return db }
const src = (kind: Source['kind']): Source => ({ id: 'x', kind, fileId: null, name: 'x' })

describe('componenti del gruppo visibili', () => {
  it('il coach (e il piano personale) vedono i componenti', () => {
    expect(visibleMembers(src('coach-athlete'), group())).toEqual(['Anna', 'Bruno'])
    expect(visibleMembers(src('personal'), group())).toEqual(['Anna', 'Bruno'])
  })
  it('chi è atleta di un gruppo (piano collegato) non vede presenze né componenti', () => {
    expect(visibleMembers(src('linked'), group())).toEqual([])
  })
  it('senza piano o senza componenti: vuoto', () => {
    expect(visibleMembers(null, null)).toEqual([])
    expect(visibleMembers(src('coach-athlete'), newDb(newAthlete('Singolo'), 'x'))).toEqual([])
  })
})
