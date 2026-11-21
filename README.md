# Trainer Team 🐱🏋️

Web app **mobile-first (PWA)** per gestire e tracciare piani di allenamento — running, Hyrox, fitness funzionale, palestra, tennis — con ruoli **Atleta** e **Coach** e sincronizzazione su **Google Drive**. Nessun backend: tutto gira nel browser, i dati stanno nel tuo Drive.

Stile grafico e architettura seguono le linee guida di Money Duo (`LINEE_GUIDA_MONEYDUO.md`): temi grigio chiaro e grigio antracite + automatico, Liquid Glass solo su navigazione/fogli/avvisi, sfondo vivo, logo VHYPE Training Lab in testata.

**Stack:** React 18 · Vite · TypeScript strict · Tailwind CSS 3.4 · Framer Motion · lucide-react · vite-plugin-pwa.

## Funzioni

- **Oggi** – l'allenamento del giorno a blocchi (riscaldamento / blocco centrale / defaticamento), note del coach, "Completa & inserisci feedback".
- **Piano** – vista settimanale e mensile, aggiunta/modifica/duplica/elimina sessioni, copia della settimana precedente, **import/export JSON** (con modello di esempio).
- **Atleti / Progressi** – *Coach*: elenco atleti, completamento settimanale, feedback recenti, inviti. *Atleta*: sessioni, ore, km, RPE medio, grafici e storico.
- **Profilo** – ruolo (Atleta/Coach, cambiabile in ogni momento), tema e lingua (italiano/inglese), Client ID, stato di sincronizzazione, collegamento a un coach, backup.
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
4. L'**atleta** apre il link (o **Profilo → Collegati a un Coach** e incolla link/codice), accedendo con **lo stesso account Google invitato**. Con `drive.file` un file condiviso da altri si apre solo con il **Picker**: l'app lo propone limitato a quel solo file (un tocco).
5. Da quel momento l'atleta vede il piano del coach, spunta gli allenamenti e scrive feedback **sullo stesso file**. Per impostazione predefinita non può creare/modificare allenamenti: il coach lo abilita da *Gestisci atleta → "L'atleta può modificare gli allenamenti"*.
6. Un atleta può avere **sia** un piano personale **sia** uno o più piani collegati a coach (selettore rapido in cima a Oggi/Piano/Progressi). Un coach può allenare anche sé stesso scegliendo "Il mio piano".

**Conflitti:** a ogni sincronizzazione si legge prima Drive (versione del file) e si **unisce per record** (ultimo che scrive vince, cancellazioni con "lapidi"); la parte *piano* (coach) e la parte *log* (atleta) di una sessione hanno marche temporali separate, quindi se coach e atleta lavorano insieme sulla stessa sessione non si perdono a vicenda. Una copia locale non riconciliata non sovrascrive mai Drive.

## Configurare Google Cloud (passo per passo)

1. Vai su <https://console.cloud.google.com/> e crea un **progetto** (es. "Trainer Team").
2. **API e servizi → Libreria** → abilita **Google Drive API** e **Google Picker API**.
3. **API e servizi → Schermata consenso OAuth** (Google Auth Platform): tipo *Esterno*; nome app, email di supporto; in *Accesso ai dati* aggiungi lo scope `.../auth/drive.file` (non sensibile: non richiede verifica). Aggiungi come **utenti di prova** i tuoi account (e quelli di coach/atleti) finché l'app è in modalità *Testing*. *Non caricare un logo*: obbligherebbe alla verifica dell'app.
4. **Credenziali → Crea credenziali → ID client OAuth** → tipo **Applicazione web**. In **Origini JavaScript autorizzate** aggiungi:
   - `https://<tuo-utente>.github.io` (solo schema + dominio, **senza** percorso)
   - `http://localhost:5173` per lo sviluppo.
   Copia il **Client ID** (è pubblico).
5. **Credenziali → Crea credenziali → Chiave API**: copiala e **limitala** (restrizione per sito web: `https://<tuo-utente>.github.io/*` e `http://localhost:5173/*`; restrizione API: *Google Picker API*).
6. Il **numero del progetto** (Console → Impostazioni progetto) è l'`APP_ID` del Picker.

> Il Picker (API key + App ID) serve **solo** per collegare un atleta al file del coach. Senza, la modalità Solo Atleta e il coach funzionano comunque.

## Variabili di configurazione

Nessun segreto nel repository: sono variabili **pubbliche** della build (hanno la precedenza su quelle inserite nel dispositivo, utili solo in sviluppo).

| Variabile | Uso |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Client ID OAuth (tipo Web) |
| `VITE_GOOGLE_API_KEY` | Chiave API ristretta al Picker |
| `VITE_GOOGLE_APP_ID` | Numero del progetto Google Cloud |

In GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**. In locale copia `.env.example` in `.env.local`.

## Sviluppo

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: merge, import/export, inviti, date, traduzioni
npm run build      # tsc + build di produzione (con service worker)
```

Il flusso coach → invito → atleta → feedback → offline si prova con Google/Drive/Picker simulati: `npx vite preview --port 4173 &` poi `node e2e/drive-flow.cjs` (serve `playwright`).

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
  state/engine.ts                  piani, registro coach, sincronizzazione (pull→merge→push), inviti
  lib/db.ts                        schema, parseDb, merge per record, mutazioni, statistiche
  lib/planIO.ts                    import/export JSON e modello
  pages/                           Oggi · Piano · Atleti/Progressi · Profilo
  components/                      UI (vetro, fogli, accordion…), editor allenamento, feedback
  i18n/                            italiano (chiavi) + inglese, con test-guardia
```
