import { describe, expect, it } from 'vitest'
import { buildImportPrompt, disciplineHint, PROMPT_EXAMPLE } from './aiPrompt'
import { DISCIPLINES_LIST } from './db'
import { parsePlanFile } from './planIO'

describe('prompt per l’AI', () => {
  for (const lang of ['it', 'en'] as const) {
    it(`${lang}: elenca tutte le discipline dell'app con una descrizione`, () => {
      const p = buildImportPrompt({ lang, today: '2026-11-24', athleteName: 'Emilio Amici' })
      for (const id of DISCIPLINES_LIST) { expect(disciplineHint(id, lang), id).toBeTruthy(); expect(p).toContain(`- ${id}:`) }
    })
    it(`${lang}: contiene formato, nome atleta, anno e formato multi-atleta`, () => {
      const p = buildImportPrompt({ lang, today: '2026-11-24', athleteName: 'Emilio Amici' })
      expect(p).toContain('trainer-team-plan'); expect(p).toContain('trainer-team-coach-export'); expect(p).toContain('"athlete": "Emilio Amici"'); expect(p).toContain('2026')
      expect(p).not.toContain('undefined')
    })
  }
  it('senza nome usa un segnaposto', () => {
    expect(buildImportPrompt({ lang: 'it', today: '2026-01-01' })).toContain('"athlete": "Nome Cognome"')
  })
  it('l’esempio incluso è importabile dall’app (nessuna sessione scartata, risultati letti)', () => {
    const r = parsePlanFile(JSON.stringify(PROMPT_EXAMPLE), '2026-03-02', 'coach')
    expect(r.skipped).toBe(0); expect(r.sessions).toHaveLength(2)
    expect(r.sessions[0]).toMatchObject({ date: '2026-03-02', status: 'done', discipline: 'run_quality' })
    expect(r.sessions[0].feedback).toMatchObject({ rpe: 7, durationMin: 62, feel: 'good' })
    expect(r.sessions[1]).toMatchObject({ date: '2026-03-04', status: 'planned' }) // day 3 = mercoledì della settimana di partenza
  })
})
