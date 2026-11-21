export type ThemePref = 'auto' | 'light' | 'dark'
const KEY = 'trainer:theme'
export const THEME_COLOR = { light: '#e8e9eb', dark: '#26282b' }

export const getTheme = (): ThemePref => {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto' } catch { return 'auto' }
}

export const applyTheme = (pref: ThemePref) => {
  const root = document.documentElement
  try { pref === 'auto' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, pref) } catch { /* ignora */ }
  if (pref === 'auto') delete root.dataset.theme
  else root.dataset.theme = pref
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  metas.forEach((m) => {
    if (pref === 'auto') m.content = m.media.includes('dark') ? THEME_COLOR.dark : THEME_COLOR.light
    else m.content = THEME_COLOR[pref]
  })
}
