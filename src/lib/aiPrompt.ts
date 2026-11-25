import { DISCIPLINES_LIST } from './db'

/**
 * Prompt da incollare in qualsiasi AI (ChatGPT, Claude, Gemini…) insieme a un file con un piano di allenamento già fatto
 * (PDF, Excel, Word, foto, testo…): l'AI lo trasforma nel JSON importabile dall'app. Le discipline si leggono dal codice,
 * così il prompt resta allineato quando se ne aggiungono.
 */

const DISC: Record<string, { it: string; en: string }> = {
  strength: { it: 'forza, palestra, pesi, potenziamento, crossfit, calisthenics', en: 'strength, gym, weights, conditioning, crossfit, calisthenics' },
  power_plyo: { it: 'potenza, pliometria, salti, lanci', en: 'power, plyometrics, jumps, throws' },
  agility_footwork: { it: 'agilità, footwork, scaletta, coni, coordinazione', en: 'agility, footwork, ladder, cones, coordination' },
  tennis_conditioning: { it: 'condizionamento, circuiti, metabolico specifico per lo sport', en: 'conditioning, circuits, sport-specific metabolic work' },
  mobility_prehab: { it: 'mobilità, stretching, prevenzione, riabilitazione, core stability', en: 'mobility, stretching, prehab, rehab, core stability' },
  ergo: { it: 'cardio e ergometri: bike, remoergometro, skierg, nuoto, ellittica', en: 'cardio and ergometers: bike, rower, skierg, swimming, elliptical' },
  recovery: { it: 'recupero, scarico, corsa lenta di scarico, riposo attivo', en: 'recovery, easy/shake-out sessions, active rest' },
  other: { it: 'tutto il resto (tennis, padel, partite, gare non di corsa, sport vari) e ciò che non rientra altrove', en: 'everything else (tennis, padel, matches, non-running races, other sports) and anything that fits nowhere else' },
  run_quality: { it: 'corsa di qualità: ripetute, soglia, ritmi gara, progressivi, gare di corsa', en: 'quality running: intervals, tempo/threshold, race pace, progressions, running races' },
  run_long: { it: 'corsa continua o lunga: fondo, lungo', en: 'steady or long running' },
  hyrox: { it: 'Hyrox, metcon, functional fitness, circuiti con stazioni', en: 'Hyrox, metcon, functional fitness, station circuits' },
}
export const disciplineHint = (id: string, lang: 'it' | 'en') => DISC[id]?.[lang]

/** Esempio incluso nel prompt: deve restare importabile (c'è un test). */
export const PROMPT_EXAMPLE = {
  format: 'trainer-team-plan',
  version: 1,
  athlete: 'Nome Cognome',
  sessions: [
    {
      date: '2026-03-02', title: 'Ripetute 6×800 m', discipline: 'run_quality', coachNotes: 'Stesso passo su tutte le ripetute.',
      blocks: [
        { phase: 'warmup', title: 'Corsa facile + andature', duration: "15'" },
        { phase: 'main', title: 'Ripetute', sets: '6', distance: '800 m', pace: '4:05 /km', rest: "90''" },
        { phase: 'cooldown', title: 'Defaticamento', duration: "10'" },
      ],
      status: 'done',
      feedback: { comment: 'Risultato: 6 ripetute tra 3:15 e 3:20. Sensazioni: buone, ultima dura.', rpe: 7, durationMin: 62, feel: 'good' },
    },
    {
      day: 3, week: 0, title: 'Forza gambe', discipline: 'strength',
      blocks: [
        { phase: 'main', title: 'Back squat', sets: '4', reps: '6', load: '70 kg', rest: "2'" },
        { phase: 'main', title: 'Trazioni', supersetId: 'A', sets: '3', reps: '8', rest: "60''" },
        { phase: 'main', title: 'Plank', supersetId: 'A', sets: '3', duration: "45''", rest: "60''" },
      ],
    },
  ],
}

export interface PromptOptions { lang: 'it' | 'en'; athleteName?: string; today: string }

export const buildImportPrompt = ({ lang, athleteName, today }: PromptOptions): string => {
  const year = today.slice(0, 4)
  const name = athleteName?.trim() || (lang === 'it' ? 'Nome Cognome' : 'First Last')
  const example = JSON.stringify({ ...PROMPT_EXAMPLE, athlete: name }, null, 2)
  const disciplines = DISCIPLINES_LIST.map((id) => `- ${id}: ${disciplineHint(id, lang) ?? id}`).join('\n')
  const multi = JSON.stringify({ format: 'trainer-team-coach-export', version: 1, athletes: [{ athleteName: lang === 'it' ? 'Atleta 1' : 'Athlete 1', plan: { format: 'trainer-team-plan', version: 1, athlete: lang === 'it' ? 'Atleta 1' : 'Athlete 1', sessions: ['…'] } }] })

  if (lang === 'en') {
    return `You convert a training plan into a JSON file for the app "FM Training". I am attaching a file (PDF, Excel, Word, photo, text…) that contains a ready-made training plan${athleteName ? ` for ${name}` : ''}.

GOAL: read the WHOLE file and reply with ONLY valid JSON (no text before or after, no comments, no markdown), in the format below.

FORMAT
${example}

FIELDS
- Session: date ("YYYY-MM-DD") OR day (1 = Monday … 7 = Sunday) with optional week (0 = first week); title; discipline; coachNotes; blocks; status; feedback.
- Block: phase ("warmup" | "main" | "cooldown"), title, and only if present in the file (all as text): sets, reps, distance, duration, pace, zone, load, rest, equipment, notes, supersetId (same short text, e.g. "A", on consecutive exercises performed as a superset).
- status: "planned" | "done" | "partial" | "skipped". feedback: comment (text), rpe (number 1-10), durationMin (number), distanceKm (number), avgPace (text), feel ("great" | "good" | "ok" | "tired" | "bad").
- discipline must be one of these ids (if unsure use "other"):
${disciplines}

RULES
1. One session per workout. Two workouts on the same day = two sessions. Rest days with nothing to record are NOT included.
2. Dates: if the file has real dates, use "date" (if the year is missing assume ${year}). If it only has weekdays or "week 1, 2…", use "day" and "week" instead of "date".
3. title: short (max 64 characters). Do not lose information: whatever does not fit a field goes in the block "notes" or in "coachNotes". Keep units and notation as in the file (e.g. "4x1000 m", "@4'05"/km", "90''"). Never invent data.
4. Split into warmup / main / cooldown when it is clear; otherwise a single "main" block.
5. If the file also contains results or a training log (what was actually done): set status ("done", "partial", "skipped") and fill feedback (put the result and the feelings in "comment"; add rpe/durationMin/distanceKm/avgPace only when they are explicit). Without results: status "planned" and no feedback.
6. If the file contains several athletes, use this multi-athlete format with one entry per athlete: ${multi}
7. If the file is too long for a single reply, return a complete, valid JSON for the first part (for example the first months) and I will ask for the next part.
8. If something essential is truly ambiguous (year, athlete, which month), ask ONE short question first; otherwise go ahead.

BEFORE REPLYING, CHECK: valid JSON, no trailing commas, valid dates, disciplines from the list, nothing invented.`
  }
  return `Converti un piano di allenamento in un file JSON per l'app «FM Training». Ti allego un file (PDF, Excel, Word, foto, testo…) che contiene un piano di allenamento già fatto${athleteName ? ` per ${name}` : ''}.

OBIETTIVO: leggi TUTTO il file e rispondi con SOLO un JSON valido (nessun testo prima o dopo, nessun commento, niente markdown), nel formato qui sotto.

FORMATO
${example}

CAMPI
- Sessione: date ("AAAA-MM-GG") OPPURE day (1 = lunedì … 7 = domenica) con week facoltativo (0 = prima settimana); title; discipline; coachNotes; blocks; status; feedback.
- Blocco: phase ("warmup" | "main" | "cooldown"), title e, solo se presenti nel file (tutti come testo): sets, reps, distance, duration, pace, zone, load, rest, equipment, notes, supersetId (stesso testo breve, es. "A", su esercizi consecutivi eseguiti in superset).
- status: "planned" | "done" | "partial" | "skipped". feedback: comment (testo), rpe (numero 1-10), durationMin (numero), distanceKm (numero), avgPace (testo), feel ("great" | "good" | "ok" | "tired" | "bad").
- discipline deve essere uno di questi id (se non sei sicuro usa "other"):
${disciplines}

REGOLE
1. Una sessione per ogni allenamento. Due allenamenti nello stesso giorno = due sessioni. I giorni di riposo senza nulla da registrare NON vanno inseriti.
2. Date: se nel file ci sono date vere usa "date" (se manca l'anno considera ${year}). Se ci sono solo giorni della settimana o "settimana 1, 2…", usa "day" e "week" al posto di "date".
3. title: breve (max 64 caratteri). Non perdere informazioni: ciò che non entra in un campo va in "notes" del blocco o in "coachNotes". Mantieni unità e notazione del file (es. "4x1000 m", "@4'05"/km", "90''"). Non inventare dati.
4. Dividi in warmup / main / cooldown quando è evidente; altrimenti un solo blocco "main".
5. Se il file contiene anche i risultati o il diario (cosa è stato fatto davvero): imposta status ("done", "partial", "skipped") e compila feedback (risultato e sensazioni in "comment"; aggiungi rpe/durationMin/distanceKm/avgPace solo se espliciti). Senza risultati: status "planned" e nessun feedback.
6. Se il file contiene più atleti usa questo formato multi-atleta, una voce per atleta: ${multi}
7. Se il file è troppo lungo per una sola risposta, restituisci un JSON completo e valido per la prima parte (per esempio i primi mesi) e ti chiederò la parte successiva.
8. Se un'informazione essenziale è davvero ambigua (anno, atleta, quale mese), fai UNA breve domanda prima; altrimenti procedi.

PRIMA DI RISPONDERE CONTROLLA: JSON valido, niente virgole finali, date valide, discipline dalla lista, niente di inventato.`
}
