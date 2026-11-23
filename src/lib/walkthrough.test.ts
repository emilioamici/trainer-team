import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { isWalkthroughDone, markWalkthroughDone, placeTooltip, resetWalkthrough, stepsFor } from './walkthrough'

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(p) ? [p] : [] })
const anchors = new Set<string>()
for (const f of walk(join(__dirname, '..'))) for (const m of readFileSync(f, 'utf8').matchAll(/data-tour="([\w-]+)"/g)) anchors.add(m[1])

describe('passi del tour', () => {
  for (const role of ['coach', 'athlete'] as const) {
    const steps = stepsFor(role)
    it(`${role}: id univoci e testi presenti`, () => {
      expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length)
      for (const s of steps) { expect(s.title.length).toBeGreaterThan(2); expect(s.body.length).toBeGreaterThan(10) }
      expect(steps.length).toBeGreaterThanOrEqual(8)
    })
    it(`${role}: ogni elemento evidenziato esiste nel codice (data-tour)`, () => {
      for (const s of steps) if (s.target) expect(anchors.has(s.target), `${s.id} → data-tour="${s.target}"`).toBe(true)
    })
  }
  it('il tour copre le sezioni principali e termina con le impostazioni', () => {
    expect(stepsFor('coach').map((s) => s.target)).toEqual(expect.arrayContaining(['nav', 'team-add', 'plan-add', 'sync', 'notifications']))
    expect(stepsFor('athlete').map((s) => s.target)).toEqual(expect.arrayContaining(['today-feedback', 'progress-stats']))
    for (const r of ['coach', 'athlete'] as const) expect(stepsFor(r).at(-1)?.target).toBe('settings')
  })
})

describe('placeTooltip', () => {
  const vp = { w: 390, h: 844 }, card = { w: 340, h: 200 }
  it('senza elemento: al centro', () => {
    const p = placeTooltip(null, card, vp)
    expect(p.where).toBe('center'); expect(p.left).toBe(25); expect(p.top).toBe(322)
  })
  it('sotto l’elemento se c’è spazio', () => {
    const p = placeTooltip({ top: 100, left: 20, width: 100, height: 40 }, card, vp)
    expect(p.where).toBe('below'); expect(p.top).toBe(154)
  })
  it('sopra se sotto non c’è spazio (elementi in basso, es. la barra)', () => {
    const p = placeTooltip({ top: 760, left: 16, width: 358, height: 60 }, card, vp)
    expect(p.where).toBe('above'); expect(p.top + card.h).toBeLessThan(760)
  })
  it('sempre dentro i margini orizzontali', () => {
    for (const left of [0, 20, 300, 380]) {
      const p = placeTooltip({ top: 100, left, width: 40, height: 40 }, card, vp)
      expect(p.left).toBeGreaterThanOrEqual(16); expect(p.left + card.w).toBeLessThanOrEqual(vp.w - 16)
    }
  })
  it('se non entra né sopra né sotto: al centro', () => {
    expect(placeTooltip({ top: 150, left: 20, width: 350, height: 540 }, card, vp).where).toBe('center')
  })
})

describe('stato del tour', () => {
  beforeEach(() => resetWalkthrough())
  it('si ricorda quando è stato completato', () => {
    expect(isWalkthroughDone()).toBe(false)
    markWalkthroughDone(); expect(isWalkthroughDone()).toBe(true)
    resetWalkthrough(); expect(isWalkthroughDone()).toBe(false)
  })
})
