import { describe, expect, it } from 'vitest'
import { prettyPlanName } from './bridgeService'

describe('prettyPlanName', () => {
  it('toglie prefisso, suffisso e codice finale dal nome del file', () => {
    expect(prettyPlanName('training-plan-emilio-amici-1648.json')).toBe('Emilio Amici')
    expect(prettyPlanName('training-plan-gruppo-1-c34b.json')).toBe('Gruppo 1')
    expect(prettyPlanName('training-plan-personal.json')).toBe('Personal')
  })
  it('se non riconosce il formato restituisce il nome com’è', () => {
    expect(prettyPlanName('altro.txt')).toBe('Altro.txt')
  })
})
