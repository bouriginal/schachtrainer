/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { claudeProxy } from './server/claudeProxy.ts'

export default defineConfig(({ mode }) => {
  // Alle Variablen aus .env laden (auch ohne VITE_-Präfix) – sie bleiben im Node-Prozess.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      claudeProxy(env.ANTHROPIC_API_KEY || undefined),
      // Installierbare App (PWA): Manifest + Service Worker, der alles für den Offline-Betrieb vorhält
      VitePWA({
        registerType: 'autoUpdate',
        // Manifest mit Cookies laden – nötig, wenn die Seite per Vercel-Login geschützt ist
        useCredentials: true,
        includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'Schachtrainer',
          short_name: 'Schach',
          description: 'Schach verstehen statt Züge auswendig lernen – mit Coach, Eröffnungen, Taktik und Endspielen.',
          lang: 'de',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          background_color: '#f6f5f2',
          theme_color: '#2f6f3e',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // auch Engine (WASM, ~1,8 MB) und Puzzle-Daten vorhalten → komplett offline nutzbar
          globPatterns: ['**/*.{js,css,html,svg,png,wasm,json,webmanifest}'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    test: {
      environment: 'node',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      exclude: ['src/**/*.integration.test.ts', 'node_modules/**'],
    },
  }
})
