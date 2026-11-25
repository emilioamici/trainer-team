import { nostalgiaActive } from './nostalgia'
import { applyPalette, getPalette, paletteColors, type PaletteId } from './palette'

export type ThemePref = 'auto' | 'light' | 'dark'
const KEY = 'trainer:theme'
export const THEME_COLOR = { light: '#eceef2', dark: '#1c1f26' }

export const getTheme = (): ThemePref => {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto' } catch { return 'auto' }
}

export const applyTheme = (pref: ThemePref, palette: PaletteId = getPalette()) => {
  applyPalette(palette)
  const colors = paletteColors(palette)
  const root = document.documentElement
  try { pref === 'auto' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, pref) } catch { /* ignora */ }
  const eff: ThemePref = nostalgiaActive() ? 'dark' : pref // Modalità Nostalgia: sempre scuro (la preferenza resta salvata)
  if (eff === 'auto') delete root.dataset.theme
  else root.dataset.theme = eff
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  metas.forEach((m) => {
    if (eff === 'auto') m.content = m.media.includes('dark') ? colors.dark : colors.light
    else m.content = colors[eff]
  })
}
