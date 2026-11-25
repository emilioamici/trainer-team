/** Collegamento a un'attività Strava: si salva solo il link (nessun dato di Strava entra nell'app). */
const hostOk = (h: string) => h === 'strava.com' || h.endsWith('.strava.com') || h === 'strava.app.link' || h.endsWith('.strava.app.link')

/** Estrae un link Strava valido dal testo incollato (anche dentro un messaggio di condivisione). null se non c'è. */
export const extractStravaUrl = (raw: string | undefined | null): string | null => {
  for (const m of (raw ?? '').matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    try {
      const u = new URL(m[0].replace(/[.,;:!?]+$/, ''))
      if (u.protocol !== 'https:' && u.protocol !== 'http:') continue
      if (!hostOk(u.hostname.toLowerCase())) continue
      if (u.pathname.length < 2) continue // la sola home non è un'attività
      u.protocol = 'https:'
      u.hash = ''
      return u.toString()
    } catch { /* non è un indirizzo */ }
  }
  return null
}
