// Genera le chiavi del Worker. Uso: node worker/scripts/gen-keys.mjs
import { webcrypto as crypto } from 'node:crypto'
const b64u = (b) => Buffer.from(b).toString('base64url')

const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey))
const priv = (await crypto.subtle.exportKey('jwk', kp.privateKey)).d
const session = b64u(crypto.getRandomValues(new Uint8Array(32)))

console.log(`
VAPID_PUBLIC_KEY  (variabile, anche in wrangler.toml e in GitHub come VITE_VAPID_PUBLIC_KEY)
${pub}

VAPID_PRIVATE_KEY (SEGRETO → npx wrangler secret put VAPID_PRIVATE_KEY)
${priv}

SESSION_KEY       (SEGRETO → npx wrangler secret put SESSION_KEY)
${session}
`)
