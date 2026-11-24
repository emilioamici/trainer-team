import { verifyBearer } from './google'
import { HttpError, json, type Env } from './util'

/**
 * Importazione di un piano con Gemini: il file arriva dall'app, la chiave API resta qui (segreto del Worker).
 * Tetti: AI_MONTHLY_LIMIT richieste per account al mese e AI_GLOBAL_LIMIT in totale (protezione dagli abusi).
 */
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_PROMPT = 12_000
const DEFAULT_USER_LIMIT = 10
const DEFAULT_GLOBAL_LIMIT = 60
const MODEL = 'gemini-2.5-flash'

export const aiReady = (env: Env) => !!env.GEMINI_API_KEY

/** Tipi che Gemini legge direttamente (Word/Excel no: vanno esportati in PDF o CSV). */
const okMime = (m: string) => m === 'application/pdf' || /^image\/(png|jpe?g|webp|heic|heif)$/.test(m) || /^text\/(plain|csv|html|markdown)$/.test(m) || m === 'application/json'

const limitOf = (v: string | undefined, d: number) => { const n = parseInt(v ?? '', 10); return Number.isFinite(n) && n >= 0 ? n : d }
const month = () => new Date().toISOString().slice(0, 7)
const getN = async (env: Env, k: string) => parseInt((await env.KV.get(k)) ?? '0', 10) || 0
const putN = (env: Env, k: string, n: number) => env.KV.put(k, String(Math.max(0, n)), { expirationTtl: 45 * 86_400 })

const allowed = (env: Env, email: string) => {
  const list = (env.AI_ALLOWED_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return list.length === 0 || list.includes(email)
}

const readBody = async (req: Request) => {
  const text = await req.text()
  if (text.length > Math.ceil(MAX_FILE_BYTES * 1.4) + MAX_PROMPT + 2000) throw new HttpError(413, 'File troppo grande (massimo 5 MB)')
  try { return JSON.parse(text) as { mimeType?: unknown; data?: unknown; prompt?: unknown } } catch { throw new HttpError(400, 'JSON non valido') }
}

export async function aiStatus(env: Env, req: Request, cors: Record<string, string>): Promise<Response> {
  if (!aiReady(env)) throw new HttpError(503, 'Importazione con AI non configurata')
  const me = await verifyBearer(env, req)
  const limit = limitOf(env.AI_MONTHLY_LIMIT, DEFAULT_USER_LIMIT)
  const used = await getN(env, `ai:${month()}:${me.email}`)
  return json({ allowed: allowed(env, me.email), used, limit, remaining: Math.max(0, limit - used) }, 200, cors)
}

export async function aiImport(env: Env, req: Request, cors: Record<string, string>): Promise<Response> {
  if (!aiReady(env)) throw new HttpError(503, 'Importazione con AI non configurata')
  const me = await verifyBearer(env, req)
  if (!allowed(env, me.email)) throw new HttpError(403, 'Funzione riservata al coach')
  const b = await readBody(req)
  const mime = typeof b.mimeType === 'string' ? b.mimeType.toLowerCase() : ''
  const data = typeof b.data === 'string' ? b.data : ''
  const prompt = typeof b.prompt === 'string' ? b.prompt.slice(0, MAX_PROMPT) : ''
  if (!okMime(mime)) throw new HttpError(415, 'Formato non supportato: usa PDF, immagine, testo o CSV (Word/Excel: esporta in PDF)')
  if (!data || !/^[A-Za-z0-9+/=]+$/.test(data) || data.length * 0.75 > MAX_FILE_BYTES) throw new HttpError(413, 'File vuoto o troppo grande (massimo 5 MB)')
  if (prompt.length < 20) throw new HttpError(400, 'Prompt mancante')

  const m = month()
  const userKey = `ai:${m}:${me.email}`
  const globalKey = `ai:${m}:*`
  const userLimit = limitOf(env.AI_MONTHLY_LIMIT, DEFAULT_USER_LIMIT)
  const globalLimit = limitOf(env.AI_GLOBAL_LIMIT, DEFAULT_GLOBAL_LIMIT)
  const [u, g] = await Promise.all([getN(env, userKey), getN(env, globalKey)])
  if (u >= userLimit) throw new HttpError(429, `Hai usato tutte le ${userLimit} importazioni AI di questo mese`)
  if (g >= globalLimit) throw new HttpError(429, 'Limite mensile del servizio raggiunto: riprova il mese prossimo o usa il prompt manuale')
  // si conta prima della chiamata; se Gemini fallisce si restituisce
  await Promise.all([putN(env, userKey, u + 1), putN(env, globalKey, g + 1)])
  const refund = () => Promise.all([putN(env, userKey, u), putN(env, globalKey, g)])

  let res: Response
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL || MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data } }, { text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      }),
    })
  } catch {
    await refund()
    throw new HttpError(502, 'Gemini non raggiungibile')
  }
  if (!res.ok) {
    await refund()
    throw new HttpError(res.status === 429 ? 429 : 502, res.status === 429 ? 'Gemini ha raggiunto il limite gratuito: riprova tra poco' : 'Gemini ha rifiutato la richiesta')
  }
  const j = (await res.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const out = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
  if (!out) {
    await refund()
    throw new HttpError(502, 'Gemini non ha prodotto risultati: riprova con un file più chiaro')
  }
  return json({ text: out, used: u + 1, limit: userLimit, remaining: Math.max(0, userLimit - u - 1) }, 200, cors)
}
