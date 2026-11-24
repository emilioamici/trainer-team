import { getSession, health, workerPost } from './workerService'

/**
 * Ponte del Worker verso i piani su Drive (vedi worker/src/bridge.ts): chi è invitato (o presenta il codice) ma non ha
 * accesso diretto al file con il permesso `drive.file` legge e scrive passando dal Worker, senza Google Picker né chiave API.
 * Funziona solo se il coach ha registrato il piano aprendo l'app con l'accesso persistente.
 */

export const bridgeAvailable = async (): Promise<boolean> => !!(await health())?.bridge

/** Il coach (proprietario del file) lo affida al Worker con la sua sessione persistente. false se non applicabile. */
export const registerHouse = async (fileId: string, token: string): Promise<boolean> => {
  const session = getSession()
  if (!session || !(await bridgeAvailable())) return false
  try { await workerPost('/house/register', token, { fileId, session }); return true } catch { return false }
}

/** Chi presenta il codice viene aggiunto tra gli scrittori del file. Lancia WorkerError (404 = piano non collegato, 403 = non consentito). */
export const joinHouse = (fileId: string, token: string) => workerPost<{ ok: boolean; joined: boolean; name: string }>('/house/join', token, { fileId })

export interface BridgeHouse { id: string; name: string; modifiedTime: string }
/** I piani a cui questo account è stato invitato (file condivisi con lui e collegati al ponte). */
export const myHouses = async (token: string): Promise<BridgeHouse[]> => {
  if (!(await bridgeAvailable())) return []
  try { const j = await workerPost<{ houses?: BridgeHouse[] }>('/house/mine', token, {}); return Array.isArray(j.houses) ? j.houses : [] } catch { return [] }
}

/** "training-plan-emilio-amici-1648.json" → "Emilio Amici" */
export const prettyPlanName = (fileName: string): string => {
  const base = fileName.replace(/\.json$/i, '').replace(/^training-plan-/, '').replace(/-[a-z0-9]{4}$/, '').replace(/-/g, ' ').trim()
  return base ? base.replace(/(^|\s)\w/g, (c) => c.toUpperCase()) : fileName
}
