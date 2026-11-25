/**
 * Chi può entrare come coach. Con la variabile di build VITE_COACH_EMAILS (email separate da virgola) solo quegli account Google
 * possono usare il ruolo Coach; tutti gli altri restano atleti. Nell'app finiscono solo gli hash SHA-256 delle email
 * (vedi vite.config.ts), non gli indirizzi in chiaro. Senza variabile non c'è nessuna restrizione.
 */
declare const __COACH_HASHES__: string[] | undefined

const hashes = (): string[] => (typeof __COACH_HASHES__ !== 'undefined' ? __COACH_HASHES__ : []) ?? []

export const coachRestricted = (): boolean => hashes().length > 0

export const sha256Hex = async (s: string): Promise<string> => {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase()

/** L'account può usare il ruolo Coach? */
export const isCoachEmail = async (email: string | null | undefined, list: string[] = hashes()): Promise<boolean> =>
  list.length === 0 || (!!email && list.includes(await sha256Hex(normalizeEmail(email))))
