import { health, workerPost } from './workerService'

/** Importazione con AI (Gemini) tramite il Worker: la chiave API non è mai nell'app. */
export const aiAvailable = async (): Promise<boolean> => !!(await health())?.ai

export const AI_MAX_BYTES = 5 * 1024 * 1024

const BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', html: 'text/html', htm: 'text/html', json: 'application/json',
}
/** Tipo MIME accettato da Gemini, oppure null (Word/Excel non sono leggibili direttamente). */
export const aiMime = (f: { name: string; type: string }): string | null => {
  const ext = f.name.toLowerCase().split('.').pop() ?? ''
  const t = f.type || BY_EXT[ext] || ''
  return Object.values(BY_EXT).includes(t) ? t : BY_EXT[ext] ?? null
}

const toBase64 = (f: File): Promise<string> =>
  new Promise((ok, ko) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result).split(',')[1] ?? '')
    r.onerror = () => ko(new Error('Lettura del file non riuscita'))
    r.readAsDataURL(f)
  })

/** Toglie eventuali ``` attorno al JSON e lo rende leggibile. */
export const cleanAiJson = (raw: string): string => {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s }
}

export interface AiResult { text: string; remaining: number; limit: number }
export const convertWithAi = async (file: File, prompt: string, token: string): Promise<AiResult> => {
  const mimeType = aiMime(file)
  if (!mimeType) throw new Error('Formato non supportato: usa PDF, immagine, testo o CSV (Word/Excel: esporta in PDF)')
  if (file.size > AI_MAX_BYTES) throw new Error('File troppo grande (massimo 5 MB)')
  const r = await workerPost<{ text: string; remaining: number; limit: number }>('/ai/import', token, { mimeType, data: await toBase64(file), prompt })
  return { text: cleanAiJson(r.text), remaining: r.remaining, limit: r.limit }
}
