import { describe, expect, it } from 'vitest'
import { parseInviteCode } from './invite'

describe('parseInviteCode', () => {
  const id = '1AbC_dEf-GhIjKlMnOpQrStUv'
  it('accetta codice, link d’invito e link di Drive', () => {
    expect(parseInviteCode(id)).toBe(id)
    expect(parseInviteCode(`  https://utente.github.io/trainer-team/#join=${id} `)).toBe(id)
    expect(parseInviteCode(`https://drive.google.com/file/d/${id}/view?usp=sharing`)).toBe(id)
    expect(parseInviteCode(`https://drive.google.com/open?id=${id}`)).toBe(id)
  })
  it('rifiuta testo non valido', () => {
    expect(parseInviteCode('')).toBeNull()
    expect(parseInviteCode('ciao')).toBeNull()
    expect(parseInviteCode('due parole')).toBeNull()
  })
})
