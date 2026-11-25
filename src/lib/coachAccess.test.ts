import { describe, expect, it } from 'vitest'
import { isCoachEmail, sha256Hex, normalizeEmail } from './coachAccess'

describe('accesso come coach', () => {
  it('sha256 noto', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
  it('senza elenco nessuna restrizione', async () => {
    expect(await isCoachEmail('chiunque@example.com', [])).toBe(true)
    expect(await isCoachEmail(null, [])).toBe(true)
  })
  it('con elenco: solo l’account indicato, senza distinguere maiuscole e spazi', async () => {
    const list = [await sha256Hex(normalizeEmail('Coach@Example.com'))]
    expect(await isCoachEmail('coach@example.com', list)).toBe(true)
    expect(await isCoachEmail('  COACH@example.com ', list)).toBe(true)
    expect(await isCoachEmail('altro@example.com', list)).toBe(false)
    expect(await isCoachEmail('coach@example.com.evil', list)).toBe(false)
    expect(await isCoachEmail(null, list)).toBe(false)
  })
})
