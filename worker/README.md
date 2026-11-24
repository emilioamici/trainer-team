# Worker Cloudflare — accesso persistente + notifiche push

Il Worker è **facoltativo**: senza, l'app funziona (popup di Google ogni ora, niente push). Con il Worker ottieni:

- **Accesso persistente** (OAuth "broker"): resti collegato a Google per mesi, senza popup. Il *token di rinnovo* di Google resta **solo nel Worker**, cifrato (AES-GCM) in KV; all'app arriva solo un identificativo di sessione casuale.
- **Notifiche push** anche con l'app chiusa: l'atleta avvisa il coach quando completa un allenamento, il coach avvisa l'atleta quando cambia il piano. Il contenuto è cifrato end-to-end verso il dispositivo (RFC 8291) e non viene conservato.

Il piano gratuito di Cloudflare basta e avanza per una squadra.

> **Importante:** con l'app Google in modalità *Testing* il token di rinnovo scade dopo 7 giorni e l'accesso non è davvero persistente. In Google Cloud → *Pubblico* (schermata di consenso) scegli **Pubblica app / In produzione**: con il solo scope `drive.file` non serve verifica. Non caricare un logo nel branding (lo richiederebbe).

## Cosa conserva il Worker
Solo: sessioni (token di rinnovo **cifrato**, 180 giorni), iscrizioni push dei dispositivi, e per ogni file Drive l'elenco delle email iscritte. **Non** vede né conserva i piani di allenamento.

## Passo per passo

Serve Node 18+ e un account Cloudflare gratuito. Dalla cartella `worker`:

1. **Accedi e crea il KV**
   ```bash
   cd worker
   npx wrangler login
   npx wrangler kv namespace create KV      # copia l'id che stampa
   ```
2. **Configura**: `cp wrangler.example.toml wrangler.toml` e compila `id` (KV), `GOOGLE_CLIENT_ID`, `ALLOWED_ORIGINS` (es. `https://tuo-utente.github.io`, solo schema+dominio, **senza** percorso) e `VAPID_SUBJECT` (`mailto:tua-email`). `wrangler.toml` è ignorato da Git.
3. **Genera le chiavi** (dalla radice del progetto):
   ```bash
   node worker/scripts/gen-keys.mjs
   ```
   Copia `VAPID_PUBLIC_KEY` in `wrangler.toml` (`[vars]`).
4. **Imposta i segreti** (si incolla il valore quando richiesto; mai in `wrangler.toml`):
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_SECRET   # dal Client ID OAuth in Google Cloud
   npx wrangler secret put SESSION_KEY            # output di gen-keys
   npx wrangler secret put VAPID_PRIVATE_KEY      # output di gen-keys
   ```
5. **Deploy**: `npx wrangler deploy`. Stampa l'indirizzo, es. `https://trainer-team.tuo-account.workers.dev`. Aprendo `…/health` nel browser vedi `{"ok":true,"auth":true,"push":true}`.
6. **Google Cloud** → Credenziali → il tuo ID client OAuth (tipo *Applicazione web*) → **URI di reindirizzamento autorizzati**: aggiungi `https://trainer-team.tuo-account.workers.dev/auth/callback`.
7. **GitHub** → Settings → Secrets and variables → Actions → **Variables**:
   - `VITE_PUSH_URL` = indirizzo del Worker (senza `/` finale)
   - `VITE_VAPID_PUBLIC_KEY` = la chiave pubblica VAPID
   Poi rilancia il workflow *Deploy su GitHub Pages*.
8. **Nell'app**: Profilo → *Collega Google* (ora passa dalla pagina di consenso e resti collegato) → *Notifiche* → *Attiva notifiche* → *Invia una notifica di prova*.

> **iPhone:** servono iOS 16.4+ e l'app **aggiunta alla schermata Home**; il permesso si chiede toccando l'interruttore. Safari non ammette push silenziose: il service worker mostra sempre la notifica.

Dopo ogni modifica al Worker: `npx wrangler deploy` (a mano). Senza Git: scarica lo ZIP del repository e sostituisci per intero la cartella `worker/src`.

## Endpoint
| Percorso | Scopo |
|---|---|
| `GET /health` | `{ ok, auth, push }` — l'app attiva solo ciò che è dichiarato |
| `GET /auth/start`, `GET /auth/callback` | consenso Google e creazione della sessione |
| `POST /auth/refresh`, `POST /auth/logout` | token d'accesso fresco (1 h) / chiusura sessione (`Authorization: Bearer <sessione>`) |
| `POST /subscribe`, `POST /unsubscribe` | iscrizione push del dispositivo, legata ai file Drive a cui l'account ha accesso |
| `POST /notify` | avviso agli altri iscritti allo stesso file (chi invia deve avere accesso al file) |
| `POST /test` | notifica di prova ai propri dispositivi |
| `POST /house/register` | il **proprietario** del file lo collega al ponte (con la sua sessione persistente) |
| `POST /house/join` | chi presenta il codice (ID del file) viene aggiunto tra gli scrittori del file |
| `POST /house/mine` | i piani condivisi con l'account e collegati al ponte (inviti) |
| `POST /db/meta`, `/db/read`, `/db/write` | lettura e scrittura del piano dal ponte (`/db/write` con `expectedVersion`: 409 se il file è cambiato) |

## Ponte verso i piani (invitati senza Picker)
Con il permesso ristretto `drive.file` un file creato dal coach non è accessibile direttamente a un altro account, a meno di passare dal Picker di Google (che richiede una chiave API valida e su iPhone spesso non funziona). Il ponte lo risolve:
- Il **coach**, aprendo l'app con l'accesso persistente, *registra* sul Worker il file di ogni suo atleta (`/house/register`: solo il proprietario del file; il Worker tiene una copia **cifrata** del suo token di rinnovo). Si ripete ogni 3 giorni e subito dopo ogni invito.
- L'**atleta** legge e scrive il piano da `/db/*`: il Worker usa l'accesso del coach, ma **ricontrolla a ogni chiamata** che l'account compaia tra le condivisioni del file su Drive (togliere l'atleta da Drive chiude subito l'accesso) e che il token Google sia stato emesso per questa app. Il contenuto del piano passa dal Worker ma non viene salvato.
- **Invito con email**: il coach condivide il file (Drive manda l'email); l'atleta trova l'invito in `/house/mine`.
- **Codice**: il codice è l'ID del file. `/house/join` aggiunge chi lo presenta tra gli scrittori del file (massimo 20 account). **Chi ha il codice può entrare**: va dato solo all'atleta; per revocare basta togliere l'account dalla condivisione su Drive.
- Si attiva da solo se l'accesso persistente è configurato: `/health` mostra `"bridge": true`. Non servono chiavi API del Picker.

## Sicurezza (in breve)
- Le chiamate dal browser sono accettate solo dalle origini in `ALLOWED_ORIGINS`; `/auth/start` accetta solo indirizzi di ritorno su quelle origini.
- Ogni richiesta porta un token Google: il Worker verifica che sia emesso per **questa** app (`tokeninfo` → `aud`), con scope `drive.file`, e ne ricava l'email. Il token d'accesso non viene mai salvato.
- Si può iscrivere un dispositivo a un file, e inviare avvisi su un file, solo se l'account **ha accesso a quel file** (verificato su Drive con il suo token, oppure perché compare tra le condivisioni di un piano collegato al ponte).
- Solo host push noti (FCM, Mozilla, Apple, Windows); corpo massimo 8 KB; massimo 5 dispositivi per account, 20 destinatari per avviso; TTL su tutto.
- I segreti si impostano con `wrangler secret put`, mai in `wrangler.toml`.

## Diagnostica
- `npx wrangler tail` mostra le richieste in diretta.
- `/test` risponde `{ sent, failed, removed, codes? }`: `sent > 0` ok; `removed` = iscrizione scaduta; `failed` = rifiuto del servizio push (con codice); tutto a 0 = nessun dispositivo iscritto.
- Piano gratuito KV: 1000 scritture/giorno. Il Worker scrive solo quando serve (iscrizioni nuove, rinnovo sessione dopo 30 giorni).

## Test
`npm test` dalla radice esegue anche i test del Worker (cifratura push verificata con un ricevente indipendente, firma VAPID, flusso OAuth, sicurezza e fan-out delle notifiche) con KV e fetch simulati.
