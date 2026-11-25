import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PALETTES } from './palettes.data'

describe('temi colore', () => {
  const css = readFileSync('src/palettes.css', 'utf8')
  it('ogni palette ha le tre varianti (chiaro, scuro automatico, scuro manuale) con tutti i token', () => {
    expect(PALETTES.length).toBeGreaterThanOrEqual(6)
    for (const p of PALETTES) {
      expect(css).toContain(`:root[data-palette='${p.id}'] {`)
      expect(css).toContain(`:root[data-palette='${p.id}']:not([data-theme='light'])`)
      expect(css).toContain(`:root[data-palette='${p.id}'][data-theme='dark']`)
    }
    for (const tkn of ['bg', 'surface', 'ink', 'muted', 'line', 'brand', 'onbrand', 'glass', 'blob-a', 'scrim']) {
      expect(css.split(`--${tkn}:`).length - 1).toBe(PALETTES.length * 3)
    }
  })
  it('id sicuri e colori esadecimali', () => {
    for (const p of PALETTES) {
      expect(p.id).toMatch(/^[a-z]+$/)
      for (const c of [p.light, p.dark, ...p.swatch]) expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})
