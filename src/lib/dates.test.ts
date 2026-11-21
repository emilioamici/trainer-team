import { describe, expect, it } from 'vitest'
import { addDays, addMonths, monthGrid, weekDays, weekStart } from './dates'

describe('date', () => {
  it('la settimana inizia di lunedì', () => {
    expect(weekStart('2026-03-08')).toBe('2026-03-02') // domenica
    expect(weekStart('2026-03-02')).toBe('2026-03-02')
    expect(weekDays('2026-03-02')[6]).toBe('2026-03-08')
  })
  it('somma giorni e mesi a cavallo di mese/anno', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01')
  })
  it('la griglia del mese è a settimane intere', () => {
    const g = monthGrid('2026-03-15')
    expect(g.length % 7).toBe(0)
    expect(g[0]).toBe('2026-02-23')
    expect(g).toContain('2026-03-31')
  })
})
