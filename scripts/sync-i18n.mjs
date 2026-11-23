import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f)
    return statSync(p).isDirectory()
      ? walk(p)
      : /\.(ts|tsx)$/.test(p) && !/\.test\./.test(p) && !p.endsWith('en.ts')
        ? [p]
        : []
  })

const re = /(?<![\w.$])(?:t|T|tb)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`$]*)`)/g
const keys = new Set()
for (const f of walk(join(root, 'src'))) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(re)) {
    keys.add((m[1] ?? m[2] ?? m[3]).replace(/\\'/g, "'").replace(/\\"/g, '"'))
  }
}

// Load current en.ts
const enPath = join(root, 'src', 'i18n', 'en.ts')
const enSrc = readFileSync(enPath, 'utf8')

// Parse en map roughly or evaluate
const startIdx = enSrc.indexOf('export const en: Record<string, string> = {')
const endIdx = enSrc.lastIndexOf('}')
const objContent = enSrc.slice(startIdx + 'export const en: Record<string, string> = {'.length, endIdx)

const currentMap = {}
for (const line of objContent.split('\n')) {
  const match = line.match(/^\s*"((?:[^"\\]|\\.)*)":\s*"((?:[^"\\]|\\.)*)",?/)
  if (match) {
    const k = match[1].replace(/\\"/g, '"')
    const v = match[2].replace(/\\"/g, '"')
    currentMap[k] = v
  }
}

const NEW_TRANSLATIONS = {
  "Individual Athlete": "Individual Athlete",
  "Nuovo Individual Athlete": "New Individual Athlete",
  "Componenti del gruppo ({n} selezionati)": "Group members ({n} selected)",
  "Seleziona gli atleti dalla lista per aggiungerli a questo gruppo:": "Select athletes from the list to add them to this group:",
  "Nuovo atleta...": "New athlete...",
  "es. Individual Athlete ATP · Potenza & Prevenzione": "e.g. ATP Individual Athlete · Power & Prevention",
  "Email Google dell’atleta (facoltativa per invito)": "Athlete's Google email (optional for invitation)",
  "Aggiungi dalla lista della scuola tennis:": "Add from tennis academy list:",
  "Codice invito gruppo": "Group invite code",
  "Codice invito per l’atleta": "Invite code for athlete",
  "Invitato": "Invited",
  "Codice invito": "Invite code",
  "Copia codice": "Copy code",
  "Codice copiato negli appunti": "Code copied to clipboard",
  "Il codice da dare all’atleta: dopo l’accesso lo incolla in «Collegati a un Coach».": "The code to give the athlete: after signing in they paste it into \"Connect to a Coach\".",
  "Link invito copiato": "Invite link copied",
  "Copia link": "Copy link",
  "Condividi": "Share",
  "Invia invito via email (Google Drive)": "Send email invitation (Google Drive)",
  "Collega prima Google nelle Impostazioni per inviare inviti automatici via Drive.": "Connect Google in Settings first to send automatic Drive invites.",
  "L’invito via email condivide direttamente il file su Google Drive dell’atleta.": "The email invitation shares the file directly on the athlete's Google Drive.",
  "Team": "Team",
  "Sincronizza": "Sync",
  "Sync…": "Syncing…",
  "Riconnetti": "Reconnect",
  "Sync now": "Sync now",
  "Notifiche ({n} non lette)": "Notifications ({n} unread)",
  "Impostazioni": "Settings",
  "Centro Notifiche": "Notification Center",
  "Nessuna notifica": "No notifications",
  "Qui riceverai gli aggiornamenti su feedback degli atleti, presenze dei gruppi e sincronizzazione.": "Here you will receive updates on athlete feedback, group attendance, and syncing.",
  "Non letta": "Unread",
  "Segna tutte come lette": "Mark all as read",
  "Svuota": "Clear",
  "es. Preparazione Atletica Tennis": "e.g. Tennis Athletic Conditioning",
  "{g} gruppi · {a} atleti individuali": "{g} groups · {a} individual athletes",
  "Individual Athlete ({n})": "Individual Athlete ({n})",
  "Aggiungi un gruppo della scuola tennis o un atleta individuale.": "Add a tennis academy group or an individual athlete.",
  "Gestisci": "Manage",
  "Ultimo: {date}": "Last: {date}",
  "Vedi piano": "View plan",
  "Ultimi feedback": "Recent feedback",
}

// Build merged
const nextMap = {}
for (const k of Array.from(keys).sort()) {
  if (currentMap[k]) {
    nextMap[k] = currentMap[k]
  } else if (NEW_TRANSLATIONS[k]) {
    nextMap[k] = NEW_TRANSLATIONS[k]
  } else {
    nextMap[k] = k
  }
}

// Format back to en.ts
const lines = [
  '/**',
  ' * Dizionario inglese.',
  ' * Ogni voce corrisponde esattamente a una stringa italiana usata nel codice con t(…), T(…) o tb(…).',
  ' * Testato automaticamente da i18n.test.ts: nessuna voce mancante, nessuna voce inutilizzata,',
  ' * stessi segnaposto {nome} e stessi tag <b>.',
  ' */',
  'export const en: Record<string, string> = {',
]

for (const [k, v] of Object.entries(nextMap)) {
  const escK = k.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const escV = v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  lines.push(`  "${escK}": "${escV}",`)
}
lines.push('}\n')

writeFileSync(enPath, lines.join('\n'), 'utf8')
console.log(`Synced ${Object.keys(nextMap).length} keys to en.ts`)
