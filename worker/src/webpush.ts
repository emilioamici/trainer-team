import { b64u, concat, utf8, type Env, HttpError } from './util'

export interface PushSub { endpoint: string; keys: { p256dh: string; auth: string } }

/** Solo servizi push noti: il Worker non fa da proxy verso indirizzi arbitrari. */
export const isPushHost = (endpoint: string) => {
  try {
    const u = new URL(endpoint)
    if (u.protocol !== 'https:') return false
    const h = u.hostname
    return h === 'fcm.googleapis.com' || h === 'updates.push.services.mozilla.com' || h.endsWith('.push.apple.com') || h.endsWith('.notify.windows.com') || h.endsWith('.push.services.mozilla.com')
  } catch { return false }
}

const hkdf = async (ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, bytes: number) => {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8))
}

/** Cifratura del messaggio push: RFC 8291 (aes128gcm). */
export const encryptPayload = async (sub: PushSub, plaintext: Uint8Array): Promise<Uint8Array> => {
  const uaPublic = b64u.dec(sub.keys.p256dh)
  const authSecret = b64u.dec(sub.keys.auth)
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length < 16) throw new HttpError(400, 'Chiavi di iscrizione non valide')
  const eph = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', eph.publicKey)) as ArrayBuffer)
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, eph.privateKey, 256))
  const ikm = await hkdf(ecdh, authSecret, concat(utf8('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(ikm, salt, utf8('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(ikm, salt, utf8('Content-Encoding: nonce\0'), 12)
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))))
  const rs = new Uint8Array([0, 0, 0x10, 0]) // record size 4096
  return concat(salt, rs, new Uint8Array([65]), asPublic, ct)
}

/** Intestazione VAPID (RFC 8292): JWT ES256 firmato con la chiave privata del Worker. */
export const vapidAuth = async (env: Env, endpoint: string): Promise<string> => {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) throw new HttpError(503, 'Push non configurato')
  const pub = b64u.dec(env.VAPID_PUBLIC_KEY)
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u.enc(pub.slice(1, 33)), y: b64u.enc(pub.slice(33, 65)), d: env.VAPID_PRIVATE_KEY }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const head = b64u.enc(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64u.enc(utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT })))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${head}.${claims}`)))
  return `vapid t=${head}.${claims}.${b64u.enc(sig)}, k=${env.VAPID_PUBLIC_KEY}`
}

export interface PushPayload { title: string; body: string; tag?: string; url?: string }

/** Invia una push; restituisce lo stato HTTP del servizio push (404/410 = iscrizione scaduta). */
export const sendPush = async (env: Env, sub: PushSub, payload: PushPayload): Promise<number> => {
  const body = await encryptPayload(sub, utf8(JSON.stringify(payload)))
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidAuth(env, sub.endpoint), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal' },
    body,
  })
  return res.status
}
