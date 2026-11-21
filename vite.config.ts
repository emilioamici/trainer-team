import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Su GitHub Pages l'app vive in /<nome-repo>/: la GitHub Action passa BASE_PATH.
const base = process.env.BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['cats/*.png', 'icons/*.png', 'privacy.html', 'esempio-piano.json', 'push-sw.js'],
      manifest: {
        name: 'Trainer Team',
        short_name: 'Trainer',
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
        globPatterns: ['**/*.{js,css,html,png,json}'],
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/privacy\.html$/],
        cleanupOutdatedCaches: true,
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts', 'worker/src/**/*.test.ts'] },
})
