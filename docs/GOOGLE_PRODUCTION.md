# Portare l'app in produzione su Google (checklist)

Con il solo scope **`drive.file`** (non sensibile) **non serve la verifica di Google**: basta pubblicare l'app. Pubblicare è necessario perché in modalità *Testing* il token di rinnovo scade dopo 7 giorni e l'accesso persistente non dura.

Sostituisci `emilioamici` e `trainer-team` se il tuo repository ha un altro nome.

## 0. Prima di tutto: pubblica il sito
Le pagine devono essere online all'indirizzo che darai a Google.
1. Fai il **merge della PR** su `main` e abilita **Settings → Pages → Source: GitHub Actions**.
2. Controlla che si aprano:
   - App: `https://emilioamici.github.io/trainer-team/`
   - Privacy policy: `https://emilioamici.github.io/trainer-team/privacy.html`

## 1. Schermata di consenso OAuth (Google Auth Platform)
**Branding**
| Campo | Valore |
|---|---|
| Nome app | `Trainer Team` (deve coincidere con ciò che l'utente vede nell'app) |
| Email di assistenza | la tua email |
| Logo | **lascia vuoto** (caricarlo obbliga alla verifica) |
| Home page dell'app | `https://emilioamici.github.io/trainer-team/` |
| Link informativa sulla privacy | `https://emilioamici.github.io/trainer-team/privacy.html` |
| Link condizioni di servizio | facoltativo, lascia vuoto |
| Domini autorizzati | `github.io` — **vedi nota sotto** |
| Email contatto sviluppatore | la tua email |

> **Nota `github.io`:** Google chiede di verificare la proprietà dei domini autorizzati, e `github.io` è un dominio condiviso che non puoi verificare. Con solo scope non sensibili i campi di Branding (home page, privacy, domini) sono facoltativi: se Google rifiuta `github.io` come dominio autorizzato, **lasciali vuoti** e pubblica lo stesso. Se vuoi un dominio tuo, usa un dominio personalizzato per GitHub Pages (Settings → Pages → Custom domain) e verificalo in Google Search Console.

**Accesso ai dati (Data Access)**
- Aggiungi **solo** `https://www.googleapis.com/auth/drive.file`.
- Non aggiungere scope `drive` o `drive.readonly` (sono sensibili/limitati e richiederebbero verifica).

**Pubblico (Audience)**
- Tipo di utente: **Esterno**.
- Stato di pubblicazione: **Pubblica app → In produzione**.
- Non devi inviare l'app a verifica: gli scope non sensibili non la richiedono.

## 2. Credenziali (ID client OAuth, tipo Applicazione web)
- **Origini JavaScript autorizzate**: `https://emilioamici.github.io` (senza percorso). Per lo sviluppo anche `http://localhost:5173`.
- **URI di reindirizzamento autorizzati** (solo con il Worker): `https://<tuo-worker>.workers.dev/auth/callback`.

## 3. API abilitate
Google Drive API e Google Picker API.

## 4. Chiave API del Picker (solo se non usi il ponte del Worker)
Limitala per **referrer HTTP** (`https://emilioamici.github.io/*`, `http://localhost:5173/*`) e per **API** (*Google Picker API*). Se il Picker risponde «API key invalid» vedi il README (sezione *Se il Picker dice «API key invalid»*). Con il ponte del Worker il Picker non serve.

## 5. Dopo la pubblicazione
1. In **Profilo → Scollega account** e poi **Collega Google**: serve un nuovo accesso, perché i token emessi in *Testing* scadono dopo 7 giorni.
2. Se hai attivato il Worker, controlla che `…/health` risponda `auth: true`, `push: true` (vedi `worker/README.md`).
3. Prova con un secondo account Google (non di prova): non deve comparire l'avviso "app non verificata" né il blocco "accesso bloccato".

## Cosa descrivere se Google chiede chiarimenti
- **Perché `drive.file`**: l'app salva i piani di allenamento in file JSON sul Drive dell'utente e li condivide con l'atleta invitato; vede solo i file creati dall'app o scelti con il Picker.
- **Uso dei dati**: solo per le funzioni dell'app; nessuna vendita, pubblicità o addestramento di modelli (vedi la sezione *Limited Use* della privacy policy).
- **Server**: facoltativo; conserva il token di rinnovo cifrato e le iscrizioni push, non i piani.
