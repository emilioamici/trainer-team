import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { en } from './en'

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) && !/\.test\./.test(p) && !p.endsWith('en.ts') ? [p] : [] })

/** Ogni t('…') / T('…') / tb('…') nel codice deve avere la voce inglese, con gli stessi segnaposto e grassetti. */
const re = /(?<![\w.$])(?:t|T|tb)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`$]*)`)/g
const keys = new Set<string>()
for (const f of walk(join(__dirname, '..'))) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(re)) keys.add((m[1] ?? m[2] ?? m[3]).replace(/\\'/g, "'").replace(/\\"/g, '"'))
}

const holders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
const bolds = (s: string) => (s.match(/<b>/g) ?? []).length

describe('traduzioni', () => {
  it('trova i testi nel codice', () => { expect(keys.size).toBeGreaterThan(100) })
  it('ogni testo ha la voce inglese', () => {
    const missing = [...keys].filter((k) => !(k in en))
    expect(missing).toEqual([])
  })
  it('stessi segnaposto e grassetti', () => {
    for (const k of keys) if (en[k]) { expect(holders(en[k]), k).toBe(holders(k)); expect(bolds(en[k]), k).toBe(bolds(k)) }
  })
  it('nessuna voce inutilizzata nel dizionario', () => {
    expect(Object.keys(en).filter((k) => !keys.has(k))).toEqual([])
  })
})
