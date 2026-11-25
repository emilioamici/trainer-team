import { useSyncExternalStore } from 'react'
import { PALETTES, type PaletteInfo } from './palettes.data'

export { PALETTES }
export type PaletteId = 'default' | PaletteInfo['id']
const KEY = 'trainer:palette'
export const DEFAULT_COLORS = { light: '#eceef2', dark: '#1c1f26' }

export const getPalette = (): PaletteId => {
  try { const v = localStorage.getItem(KEY); return PALETTES.some((p) => p.id === v) ? (v as PaletteId) : 'default' } catch { return 'default' }
}

/** Colore della barra del browser per palette e modo. */
export const paletteColors = (id: PaletteId = getPalette()) => {
  const p = PALETTES.find((x) => x.id === id)
  return p ? { light: p.light, dark: p.dark } : DEFAULT_COLORS
}

const listeners = new Set<() => void>()
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }
/** Palette attiva, aggiornata in tempo reale (serve a chi cambia aspetto, come il logo). */
export const usePalette = (): PaletteId => useSyncExternalStore(subscribe, getPalette, () => 'default' as PaletteId)

export const applyPalette = (id: PaletteId) => {
  const root = document.documentElement
  try { id === 'default' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, id) } catch { /* ignora */ }
  if (id === 'default') delete root.dataset.palette
  else root.dataset.palette = id
  listeners.forEach((cb) => cb())
}
