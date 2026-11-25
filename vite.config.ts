import { createHash } from 'node:crypto'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Su GitHub Pages l'app vive in /<nome-repo>/: la GitHub Action passa BASE_PATH.
const base = process.env.BASE_PATH || '/'

// Email dei coach (VITE_COACH_EMAILS, separate da virgola): nell'app entrano solo gli hash SHA-256, mai gli indirizzi in chiaro.
const coachHashes = (mode: string) =>
  (process.env.VITE_COACH_EMAILS || loadEnv(mode, process.cwd(), 'VITE_').VITE_COACH_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    .map((e) => createHash('sha256').update(e).digest('hex'))

export default defineConfig(({ mode }) => ({
  base,
  define: { __COACH_HASHES__: JSON.stringify(coachHashes(mode)) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand/*.png', 'brand/*.webp', 'icons/*.png', 'icons/*.svg', 'privacy.html', 'esempio-piano.json', 'push-sw.js'],
      manifest: {
        name: 'FM Training',
        short_name: 'FM Training',
        description: 'Piani di allenamento per atleti e coach, sincronizzati su Google Drive.',
        lang: 'it',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#e8e9eb',
        theme_color: '#e8e9eb',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webp,json}'],
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/privacy\.html$/],
        cleanupOutdatedCaches: true,
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts', 'worker/src/**/*.test.ts'] },
}))
