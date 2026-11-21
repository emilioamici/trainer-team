# Worker Cloudflare — accesso persistente + notifiche push

Il Worker è **facoltativo**: senza, l'app funziona (popup di Google ogni ora, niente push). Con il Worker ottieni:

- **Accesso persistente** (OAuth "broker"): resti collegato a Google per mesi, senza popup. Il *token di rinnovo* di Google resta **solo nel Worker**, cifrato (AES-GCM) in KV; all'app arriva solo un identificativo di sessione casuale.
- **Notifiche push** anche con l'app chiusa: l'atleta avvisa il coach quando completa un allenamento, il coach avvisa l'atleta quando cambia il piano. Il contenuto è cifrato end-to-end verso il dispositivo (RFC 8291) e non viene conservato.

Il piano gratuito di Cloudflare basta e avanza per una squadra.

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

## Sicurezza (in breve)
- Le chiamate dal browser sono accettate solo dalle origini in `ALLOWED_ORIGINS`; `/auth/start` accetta solo indirizzi di ritorno su quelle origini.
- Ogni richiesta porta un token Google: il Worker verifica che sia emesso per **questa** app (`tokeninfo` → `aud`), con scope `drive.file`, e ne ricava l'email. Il token d'accesso non viene mai salvato.
- Si può iscrivere un dispositivo a un file, e inviare avvisi su un file, solo se l'account **ha accesso a quel file** (verificato su Drive con il suo token).
- Solo host push noti (FCM, Mozilla, Apple, Windows); corpo massimo 8 KB; massimo 5 dispositivi per account, 20 destinatari per avviso; TTL su tutto.
- I segreti si impostano con `wrangler secret put`, mai in `wrangler.toml`.

## Diagnostica
- `npx wrangler tail` mostra le richieste in diretta.
- `/test` risponde `{ sent, failed, removed, codes? }`: `sent > 0` ok; `removed` = iscrizione scaduta; `failed` = rifiuto del servizio push (con codice); tutto a 0 = nessun dispositivo iscritto.
- Piano gratuito KV: 1000 scritture/giorno. Il Worker scrive solo quando serve (iscrizioni nuove, rinnovo sessione dopo 30 giorni).

## Test
`npm test` dalla radice esegue anche i test del Worker (cifratura push verificata con un ricevente indipendente, firma VAPID, flusso OAuth, sicurezza e fan-out delle notifiche) con KV e fetch simulati.
