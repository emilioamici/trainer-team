import { t } from '../i18n'
import { vapidKey, workerPost, WorkerError } from './workerService'

const FLAG = 'trainer:push'
const SIG = 'trainer:pushSig'
const ls = { get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* ignora */ } } }

export const pushSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const pushWanted = () => ls.get(FLAG) === '1'
export const permission = () => (typeof Notification === 'undefined' ? 'denied' : Notification.permission)
export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

const keyBytes = (s: string) => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(p)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

const subscription = async (create: boolean): Promise<PushSubscription | null> => {
  const reg = await navigator.serviceWorker.ready
  const cur = await reg.pushManager.getSubscription()
  if (cur || !create) return cur
  if (!vapidKey()) throw new Error(t('Manca la chiave VAPID pubblica.'))
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey()) as BufferSource })
}

/** Da chiamare in risposta a un tocco (iOS lo richiede). */
export const enablePush = async (token: string, fileIds: string[]): Promise<void> => {
  if (!pushSupported()) throw new Error(t('Questo browser non supporta le notifiche push.'))
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error(t('Permesso per le notifiche negato: abilitalo dalle impostazioni del dispositivo.'))
  const sub = await subscription(true)
  await register(sub!, token, fileIds)
  ls.set(FLAG, '1')
}

const register = async (sub: PushSubscription, token: string, fileIds: string[]) => {
  await workerPost('/subscribe', token, { subscription: sub.toJSON(), fileIds })
  ls.set(SIG, `${sub.endpoint}|${[...fileIds].sort().join(',')}`)
}

/** Aggiorna i file a cui il dispositivo è iscritto (nuovo atleta, nuovo piano collegato). Solo se è cambiato qualcosa. */
export const syncPushFiles = async (token: string, fileIds: string[]): Promise<void> => {
  if (!pushWanted() || !pushSupported() || permission() !== 'granted') return
  const sub = await subscription(false)
  if (!sub) return
  if (ls.get(SIG) === `${sub.endpoint}|${[...fileIds].sort().join(',')}`) return
  await register(sub, token, fileIds)
}

export const disablePush = async (token: string | null): Promise<void> => {
  ls.set(FLAG, null); ls.set(SIG, null)
  if (!pushSupported()) return
  const sub = await subscription(false)
  if (!sub) return
  if (token) await workerPost('/unsubscribe', token, { endpoint: sub.endpoint }).catch(() => undefined)
  await sub.unsubscribe().catch(() => undefined)
}

export interface PushResult { sent: number; failed: number; removed: number; codes?: number[] }

/** Prova di invio: dice la verità usando la risposta del server. */
export const testPush = async (token: string): Promise<string> => {
  try {
    const r = await workerPost<PushResult>('/test', token, { title: 'Trainer Team', body: t('Notifica di prova: funziona!'), url: location.origin + import.meta.env.BASE_URL })
    if (r.sent > 0) return t('Notifica inviata: dovrebbe comparire a breve.')
    if (r.removed > 0) return t('L’iscrizione di questo dispositivo era scaduta: disattiva e riattiva le notifiche.')
    if (r.failed > 0) return t('Il servizio push ha rifiutato l’invio (codice {code}).', { code: (r.codes ?? []).join(', ') || '?' })
    return t('Nessun dispositivo iscritto: attiva le notifiche su questo dispositivo.')
  } catch (e) {
    return e instanceof WorkerError ? t('Errore del server ({code}): {msg}', { code: e.status, msg: e.message }) : String(e)
  }
}

/** Notifica agli altri iscritti al file (dopo che i dati sono stati inviati a Drive). */
export const sendNotify = (token: string, body: { fileId: string; title: string; body: string; tag: string }) =>
  workerPost<PushResult>('/notify', token, { ...body, url: location.origin + import.meta.env.BASE_URL })
