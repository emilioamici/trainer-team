# FM Training 🏋️

Web app **mobile-first (PWA)** per gestire e tracciare piani di allenamento — running, Hyrox, fitness funzionale, palestra, tennis — con ruoli **Atleta** e **Coach** e sincronizzazione su **Google Drive**. Nessun backend per i dati: tutto gira nel browser e i dati stanno nel tuo Drive. Un **Worker Cloudflare facoltativo** aggiunge l'accesso persistente e le notifiche push (vedi sotto).

Stile grafico e architettura: temi grigio chiaro e grigio antracite + automatico, Liquid Glass solo su navigazione/fogli/avvisi, sfondo vivo, logo con icona manubrio in testata.

**Stack:** React 18 · Vite · TypeScript strict · Tailwind CSS 3.4 · Framer Motion · lucide-react · vite-plugin-pwa.

## Funzioni

- **Oggi** – l'allenamento del giorno a blocchi (riscaldamento / blocco centrale / defaticamento), note del coach, "Completa & inserisci feedback".
- **Timer e superset** – dal tasto «Timer» (Oggi) o «Avvia timer» (dettaglio sessione) parte un timer guidato: serie, recuperi, esercizi a tempo (campo *Durata*) o da spuntare con «Fatto», +15 s di recupero, pausa/salta/indietro, suoni e vibrazione, schermo sempre acceso (Wake Lock); a fine allenamento il tempo precompila il feedback. «Timer rapido» in Oggi: lavoro/recupero/giri liberi. Nell'editor «Aggiungi superset» o «Unisci al precedente in superset»: gli esercizi si alternano (A1, B1, recupero, A2, B2…). Nel JSON basta lo stesso `supersetId` su blocchi consecutivi. Limite iPhone: a schermo bloccato il web non può suonare.
- **Importa con AI** (Coach, serve il Worker con `GEMINI_API_KEY`) – in Importa, «Converti un file con l'AI»: PDF/foto/CSV letti da Gemini (piano gratuito) con tetto mensile; il JSON compare per il controllo prima dell'import. Vedi `worker/README.md`.
- **Temi colore** – Profilo → Aspetto → Colori: 7 palette (Notte viola, Caffè bordeaux, Foresta, Rubino e blu, Oceano, Pesca e rosa, Junior Tennis Perugia con il suo logo al posto di quello dell'app) oltre al Classico, ognuna con variante chiara e scura. Si rigenerano con `node scripts/gen-palettes.mjs` (modifica i colori lì, non in `src/palettes.css`).
- **FM Training, mascotte e icona** – nome «FM Training»; due mascotte (atleta e coach, in `public/brand/mascot-*.webp`, intere e a mezzobusto) compaiono in accesso, intestazione (avatar in base al ruolo), stati vuoti, timer, tutorial e impostazioni. L'icona è «FM» bianca su antracite: si rigenera con `python3 scripts/gen-icons.py` (serve Pillow).
- **Piano** – vista settimanale e mensile, aggiunta/modifica/duplica/elimina sessioni, copia della settimana precedente, **import/export JSON** (con modello di esempio).
- **Atleti / Progressi** – *Coach*: elenco atleti, completamento settimanale, feedback recenti, inviti. *Atleta*: sessioni, ore, km, RPE medio, grafici e storico.
- **Profilo** – ruolo (Atleta/Coach, cambiabile in ogni momento), tema e lingua (italiano/inglese), Client ID, stato di sincronizzazione, collegamento a un coach, backup.
- **Tutorial e tour guidato**: il tutorial iniziale spiega i concetti; il *tour guidato* (Impostazioni → «Tour guidato», o dall'ultimo passo del tutorial) evidenzia i pulsanti reali dell'app, cambiando scheda da solo, con passi diversi per coach e atleta.
- **Modalità demo**: senza login l'app funziona subito con dati di esempio (Profilo → Backup e dati per nasconderli).
- **Offline-first**: copia locale in IndexedDB; sincronizzazione ogni 2 minuti, dopo ogni modifica (debounce 2 s), alla riconnessione e col pulsante "Sincronizza ora".

## Come funzionano i file su Drive

L'app chiede **solo** lo scope `https://www.googleapis.com/auth/drive.file`: vede esclusivamente i file che crea o che l'utente apre con il Google Picker. Ogni atleta = **un file JSON** (`training-plan-….json`), con struttura `schemaVersion · meta · athlete · sessions · deleted`.

### Modalità A — Solo Atleta (autonomo)

1. Apri l'app, **Profilo → Collega Google**.
2. L'app crea `training-plan-personal.json` sul **tuo Drive personale** (appena il piano contiene qualcosa) e lo tiene sincronizzato.
3. Nessun coach, nessuna condivisione: i dati sono solo tuoi.

### Modalità B — Coach → Invito Atleta

1. Il coach passa a **Ruolo: Coach** e collega Google.
2. **Atleti → + Nuovo atleta**: l'app crea un file JSON **dedicato a quell'atleta sul Drive del coach** (dati e privacy di ogni atleta restano isolati) e aggiorna il *registro* `training-plan-registry.json` (l'elenco dei suoi atleti, ritrovato da qualsiasi dispositivo).
3. Dal foglio **Gestisci atleta** il coach genera l'**invito**: l'app condivide il file con l'email dell'atleta (ruolo *writer*, con email di Drive) e mostra **link** `…/#join=<fileId>` e **codice** (= ID del file) da copiare o inviare.
4. L'**atleta** accede con Google e si collega in uno di questi modi (l'app prova nell'ordine: accesso diretto → **ponte del Worker** → Picker):
   - **Invito con email**: il coach inserisce l'email Google dell'atleta e tocca *Invia*. Dopo l'accesso l'atleta trova l'invito **da solo** in *Impostazioni → Collegati a un Coach* (se è l'unico e non ha altri piani collegati, si collega automaticamente).
   - **Solo codice o link**: l'atleta incolla il codice (o apre il link `…#join=`) in *Collegati a un Coach*. Il Worker condivide il file con il suo account Google; **chi ha il codice può entrare, quindi non va pubblicato**.
   - **Picker** (ultima risorsa): con `drive.file` un file condiviso da altri si apre dal Picker di Google; serve una chiave API valida e su iPhone spesso non funziona.

   Il **ponte del Worker** (`worker/src/bridge.ts`) evita il Picker: il coach, aprendo l'app con l'accesso persistente, *registra* il file di ogni atleta; da quel momento chi è tra le condivisioni del file su Drive lo legge e lo scrive passando dal Worker, senza Picker e senza chiave API. Senza Worker restano solo l'invito con email e il Picker.
5. Da quel momento l'atleta vede il piano del coach, spunta gli allenamenti e scrive feedback **sullo stesso file**. Per impostazione predefinita non può creare/modificare allenamenti: il coach lo abilita da *Gestisci atleta → "L'atleta può modificare gli allenamenti"*.
6. Un atleta può avere **sia** un piano personale **sia** uno o più piani collegati a coach (selettore rapido in cima a Oggi/Piano/Progressi). Un coach può allenare anche sé stesso scegliendo "Il mio piano".

**Conflitti:** a ogni sincronizzazione si legge prima Drive (versione del file) e si **unisce per record** (ultimo che scrive vince, cancellazioni con "lapidi"); la parte *piano* (coach) e la parte *log* (atleta) di una sessione hanno marche temporali separate, quindi se coach e atleta lavorano insieme sulla stessa sessione non si perdono a vicenda. Una copia locale non riconciliata non sovrascrive mai Drive.

## Configurare Google Cloud (passo per passo)

1. Vai su <https://console.cloud.google.com/> e crea un **progetto** (es. "FM Training").
2. **API e servizi → Libreria** → abilita **Google Drive API** e **Google Picker API**.
3. **API e servizi → Schermata consenso OAuth** (Google Auth Platform): tipo *Esterno*; nome app, email di supporto; in *Accesso ai dati* aggiungi lo scope `.../auth/drive.file` (non sensibile: non richiede verifica). Aggiungi come **utenti di prova** i tuoi account (e quelli di coach/atleti) finché l'app è in modalità *Testing*. **Attenzione:** in modalità *Testing* Google fa scadere il token di rinnovo dopo **7 giorni**, quindi l'accesso persistente del Worker non dura. Per la persistenza vera passa l'app in **Produzione** (*Pubblico → Pubblica app*): con il solo scope `drive.file` non serve nessuna verifica. *Non caricare un logo*: obbligherebbe alla verifica dell'app.
4. **Credenziali → Crea credenziali → ID client OAuth** → tipo **Applicazione web**. In **Origini JavaScript autorizzate** aggiungi:
   - `https://<tuo-utente>.github.io` (solo schema + dominio, **senza** percorso)
   - `http://localhost:5173` per lo sviluppo.
   Copia il **Client ID** (è pubblico).
5. **Credenziali → Crea credenziali → Chiave API**: copiala e **limitala** (restrizione per sito web: `https://<tuo-utente>.github.io/*` e `http://localhost:5173/*`; restrizione API: *Google Picker API*).
6. Il **numero del progetto** (Console → Impostazioni progetto) è l'`APP_ID` del Picker.

> Il Picker (API key + App ID) serve **solo** se non usi il ponte del Worker. Senza, la modalità Solo Atleta e il coach funzionano comunque.

### Se il Picker dice «API key invalid»
L'errore viene da Google, non dall'app: la chiave API della build non è accettata per il Picker. Controlla, nell'ordine:
1. **Variabile giusta**: `VITE_GOOGLE_API_KEY` in GitHub → Settings → Secrets and variables → Actions → **Variables** (non Secrets), senza spazi o a capo, e il deploy rifatto dopo averla salvata. Deve essere la *chiave API* (inizia per `AIza…`), non il Client ID.
2. **Stesso progetto**: la chiave API, il Client ID e l'App ID (numero del progetto) devono essere dello **stesso** progetto Google Cloud.
3. **API abilitata**: nel progetto devono essere abilitate **Google Picker API** e **Google Drive API** (API e servizi → Libreria).
4. **Restrizioni della chiave**: *Restrizioni applicazione* → *Siti web* con `https://<tuo-utente>.github.io/*` (con `/*` finale, senza il nome del repository nell'origine); *Restrizioni API* → *Google Picker API* (provando, anche senza restrizioni per escludere questa causa). Dopo la modifica Google impiega qualche minuto.
5. **Cache dell'app**: dopo un nuovo deploy chiudi e riapri l'app (o aggiorna la pagina) per scaricare la versione nuova.
Con il ponte del Worker attivo non serve nulla di tutto questo.

## Worker (facoltativo): accesso persistente e notifiche

Senza Worker l'app funziona: il token Google dura 1 ora (rinnovo silenzioso o popup) e non ci sono push. Con il Worker (`worker/`, guida in [`worker/README.md`](worker/README.md)) resti collegato per mesi e ricevi le notifiche: l'**atleta** avvisa il **coach** quando completa un allenamento, il coach avvisa l'atleta quando cambia il piano. Gli avvisi partono **dopo** che i dati sono arrivati su Drive (anche se la modifica era stata fatta offline). Il Worker non vede né conserva i piani; la funzione si attiva solo se `/health` la dichiara. Il deploy del Worker è manuale (`npx wrangler deploy`).

## Variabili di configurazione

Nessun segreto nel repository: sono variabili **pubbliche** della build (hanno la precedenza su quelle inserite nel dispositivo, utili solo in sviluppo).

| Variabile | Uso |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Client ID OAuth (tipo Web) |
| `VITE_GOOGLE_API_KEY` | Chiave API ristretta al Picker |
| `VITE_GOOGLE_APP_ID` | Numero del progetto Google Cloud |
| `VITE_PUSH_URL` | *(Worker)* indirizzo del Worker, senza `/` finale |
| `VITE_VAPID_PUBLIC_KEY` | *(Worker)* chiave pubblica VAPID per le push |

In GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**. In locale copia `.env.example` in `.env.local`.

## Sviluppo

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: merge, import/export, inviti, date, traduzioni, Worker
npm run build      # tsc + build di produzione (con service worker)
```

I flussi coach → invito → atleta → feedback → offline (`e2e/drive-flow.cjs`) e accesso persistente + notifiche in coda (`e2e/worker-flow.cjs`) si provano con Google/Drive/Worker simulati: `npx vite preview --port 4173 &` poi `node e2e/<file>.cjs` (serve `playwright`).

## Pubblicare su GitHub Pages

1. Su GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Imposta le tre variabili (sopra).
3. Fai push su `main`: `.github/workflows/deploy.yml` esegue test e build (con `BASE_PATH=/<nome-repo>/`, letto da `vite.config.ts`) e pubblica. L'indirizzo sarà `https://<utente>.github.io/<nome-repo>/`.
4. Su iPhone: Safari → Condividi → **Aggiungi alla schermata Home**.

## Import / export del piano

**Piano → icona ⇅**: esporta la settimana, tutto il piano (con o senza feedback) o scarica il **modello** (`public/esempio-piano.json`). Nel file ogni sessione ha `date` (`AAAA-MM-GG`) **oppure** `day` (1 = lunedì … 7 = domenica, con `week` facoltativo): all'importazione scegli il lunedì di partenza e le sessioni vengono **aggiunte** al piano. Discipline: `run_quality`, `run_long`, `hyrox`, `strength`, `ergo`, `other`, `recovery`; fasi: `warmup`, `main`, `cooldown`.

```json
{ "day": 1, "title": "Ripetute 6×800 m", "discipline": "run_quality",
  "blocks": [ { "phase": "main", "title": "Ripetute", "sets": "6", "distance": "800 m", "pace": "4:05 /km", "rest": "90'' trotando" } ] }
```

## Privacy

Nessun server proprio, nessun analytics. I dati vivono nel Drive dell'utente (o del coach, condiviso con l'atleta) e nel browser. Dettagli in [`public/privacy.html`](public/privacy.html). I backup/export JSON contengono dati personali: non metterli in un repository pubblico.

## Struttura

```
src/
  services/googleDriveService.ts   GIS + Drive v3 (crea, leggi, aggiorna, condividi) + Picker
  services/workerService.ts        sessione persistente col Worker (/auth/*, /health)
  services/pushService.ts          iscrizione push, prova, avvisi
worker/                            Worker Cloudflare (OAuth broker + Web Push) — vedi worker/README.md
public/push-sw.js                  gestione push nel service worker (mostra sempre la notifica)
  state/engine.ts                  piani, registro coach, sincronizzazione (pull→merge→push), inviti
  lib/db.ts                        schema, parseDb, merge per record, mutazioni, statistiche
  lib/planIO.ts                    import/export JSON e modello
  pages/                           Oggi · Piano · Atleti/Progressi · Profilo
  components/                      UI (vetro, fogli, accordion…), editor allenamento, feedback
  i18n/                            italiano (chiavi) + inglese, con test-guardia
```
