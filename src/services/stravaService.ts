import { T } from '../i18n'
import { health, workerPost, WorkerError } from './workerService'

/** Collegamento a Strava tramite il Worker: l'app vede solo l'elenco delle proprie attività e salva il link scelto. */
export const stravaAvailable = async (): Promise<boolean> => !!(await health())?.strava

export interface StravaStatus { connected: boolean; full: boolean }
export const stravaStatus = (token: string) => workerPost<StravaStatus>('/strava/status', token, {})

export interface StravaActivity { id: number; name: string; sport: string; date: string }
/** Attività dell'atleta: `from`/`to` (data ISO) restringono l'elenco, senza limiti mostra le ultime. */
export const stravaActivities = async (token: string, range?: { from: string; to: string }): Promise<StravaActivity[]> => {
  const sec = (iso: string, endOfDay: boolean) => Math.floor(new Date(`${iso}T${endOfDay ? '23:59:59' : '00:00:00'}Z`).getTime() / 1000)
  const body = range ? { after: sec(range.from, false), before: sec(range.to, true) } : {}
  return (await workerPost<{ activities: StravaActivity[] }>('/strava/activities', token, body)).activities
}
export const stravaDisconnect = (token: string) => workerPost('/strava/disconnect', token, {})

export const stravaUrlOf = (id: number) => `https://www.strava.com/activities/${id}`

/** Apre il consenso di Strava; al ritorno l'indirizzo contiene #strava=ok (o un errore). */
export const connectStrava = async (token: string) => {
  const ret = location.origin + import.meta.env.BASE_URL
  const r = await workerPost<{ url: string }>('/strava/connect', token, { return: ret })
  location.href = r.url
}

export type StravaReturn = 'ok' | 'denied' | 'scope' | 'full' | 'error'
/** Al ritorno da Strava: legge e toglie #strava=… dalla barra. */
export const captureStrava = (): StravaReturn | null => {
  const m = /[#&]strava=(ok|denied|scope|full|error)/.exec(location.hash)
  if (!m) return null
  try { history.replaceState(null, '', location.pathname + location.search) } catch { /* ignora */ }
  return m[1] as StravaReturn
}

export const stravaMessage = (r: StravaReturn): string =>
  ({
    ok: T('Strava collegato!'),
    denied: T('Collegamento a Strava annullato.'),
    scope: T('Serve il permesso di leggere le attività: riprova e lascia la spunta attiva.'),
    full: T('Troppi atleti collegati a Strava: riprova più avanti.'),
    error: T('Collegamento a Strava non riuscito: riprova.'),
  })[r]

export { WorkerError }
