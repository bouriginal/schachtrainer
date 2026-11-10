// Kopiert die Stockfish-Lite-Single-Thread-Engine (JS + WASM) nach public/engine,
// damit Vite sie als statische Dateien ausliefert und ein Web Worker sie laden kann.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', 'stockfish', 'bin')
const dest = join(root, 'public', 'engine')
const files = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']

mkdirSync(dest, { recursive: true })
for (const f of files) {
  const from = join(src, f)
  if (!existsSync(from)) {
    console.error(`[copy-engine] Datei fehlt: ${from} – ist "stockfish" installiert?`)
    process.exit(1)
  }
  copyFileSync(from, join(dest, f))
}
console.log('[copy-engine] Stockfish nach public/engine kopiert')
