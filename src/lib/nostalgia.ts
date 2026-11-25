import { useSyncExternalStore } from 'react'

/**
 * «Modalità Nostalgia» (solo coach): mascotte e logo diversi e tema sempre scuro.
 * Il flag è per dispositivo; vale solo mentre il ruolo è Coach.
 */
const KEY = 'trainer:nostalgia'
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }

let flag = read(KEY) === '1'
let coach = read('trainer:role') === 'coach'
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((cb) => cb())
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }

export const nostalgiaFlag = () => flag
/** Attiva davvero: flag acceso e ruolo coach. */
export const nostalgiaActive = () => flag && coach

export const setNostalgia = (on: boolean) => {
  flag = on
  try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY) } catch { /* ignora */ }
  emit()
}
/** Lo chiama l'app quando cambia il ruolo. */
export const setNostalgiaCoach = (isCoach: boolean) => { if (coach !== isCoach) { coach = isCoach; emit() } }

export const useNostalgia = (): boolean => useSyncExternalStore(subscribe, nostalgiaActive, () => false)
