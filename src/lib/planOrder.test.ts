import { describe, expect, it } from 'vitest'
import { moveInOrder, orderSources, withMainFirst } from './planOrder'

const s = (...ids: string[]) => ids.map((id) => ({ id }))
const ids = (l: { id: string }[]) => l.map((x) => x.id)

describe('ordine dei piani', () => {
  it('senza preferenze resta l’ordine predefinito', () => {
    expect(ids(orderSources(s('a', 'b', 'c'), []))).toEqual(['a', 'b', 'c'])
  })
  it('segue l’ordine scelto; i piani nuovi vanno in coda', () => {
    expect(ids(orderSources(s('personal', 'linked:x', 'linked:y'), ['linked:x', 'personal']))).toEqual(['linked:x', 'personal', 'linked:y'])
  })
  it('ignora id che non esistono più', () => {
    expect(ids(orderSources(s('a', 'b'), ['zzz', 'b', 'a']))).toEqual(['b', 'a'])
  })
  it('sposta su e giù senza uscire dai limiti', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b'])
    expect(moveInOrder(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
    expect(moveInOrder(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c'])
    expect(moveInOrder(['a', 'b', 'c'], 'x', 1)).toEqual(['a', 'b', 'c'])
  })
  it('il piano appena collegato diventa il principale', () => {
    expect(withMainFirst(['personal', 'linked:old'], 'linked:new')).toEqual(['linked:new', 'personal', 'linked:old'])
    expect(withMainFirst(['a', 'b'], 'b')).toEqual(['b', 'a'])
  })
})
