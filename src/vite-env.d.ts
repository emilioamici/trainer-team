/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_GOOGLE_API_KEY?: string
  readonly VITE_GOOGLE_APP_ID?: string
}

declare const __COACH_HASHES__: string[] | undefined

// Google Identity Services / Picker (caricati a richiesta): tipi minimi.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Window { google?: any; gapi?: any }
