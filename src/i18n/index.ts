import { useSyncExternalStore } from 'react'
import { en } from './en'

export type LangPref = 'auto' | 'it' | 'en'
const KEY = 'trainer:lang'
const listeners = new Set<() => void>()

const read = (): LangPref => {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'it' || v === 'en' ? v : 'auto'
  } catch {
    return 'auto'
  }
}
let pref: LangPref = read()

export const getLangPref = () => pref
export const setLangPref = (v: LangPref) => {
  pref = v
  try {
    if (v === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, v)
  } catch { /* storage non disponibile */ }
  listeners.forEach((l) => l())
}
export const lang = (): 'it' | 'en' => {
  if (pref !== 'auto') return pref
  const nav = typeof navigator !== 'undefined' ? navigator.language || 'it' : 'it'
  return nav.toLowerCase().startsWith('it') ? 'it' : 'en'
}
export const locale = () => (lang() === 'it' ? 'it-IT' : 'en-GB')
export const useLangPref = () =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => pref)

const fill = (s: string, vars?: Record<string, string | number>) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s

/** Traduce un testo italiano (la chiave è il testo stesso). Se manca la voce inglese torna l'italiano. */
export const t = (it: string, vars?: Record<string, string | number>) => fill(lang() === 'en' ? en[it] ?? it : it, vars)
/** Marcatore per testi tradotti in un secondo momento (tabelle): restituisce la chiave e la rende visibile al test-guardia. */
export const T = (it: string) => it
/** Come t() ma per testi con <b>…</b>: restituisce i frammenti [testo, grassetto?]. */
export const tb = (it: string, vars?: Record<string, string | number>): { text: string; bold: boolean }[] =>
  t(it, vars)
    .split(/(<b>.*?<\/b>)/g)
    .filter(Boolean)
    .map((p) => (p.startsWith('<b>') ? { text: p.slice(3, -4), bold: true } : { text: p, bold: false }))
