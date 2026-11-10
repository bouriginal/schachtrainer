// Erzeugt die App-Icons (PNG) aus einer SVG-Vorlage. Nutzt `sips` (macOS).
// Die erzeugten PNGs liegen im Repo – das Skript ist nur nötig, wenn sich das Icon ändert.
//   node scripts/build-icons.mjs
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
mkdirSync(out, { recursive: true })

/** scale < 1 lässt mehr Rand (für "maskable": Inhalt muss im inneren 80-%-Kreis liegen) */
const svg = (scale) => {
  const s = 360 * scale
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" fill="#2f6f3e"/><text x="${256 - 24 * scale}" y="${256 + 80 * scale}" font-size="${s}" text-anchor="middle" fill="#ffffff" font-family="Apple Symbols, Arial Unicode MS, sans-serif">♞</text></svg>`
}

const variants = [
  { name: 'icon', scale: 1, sizes: [192, 512] },
  { name: 'maskable', scale: 0.78, sizes: [512] },
  { name: 'apple-touch-icon', scale: 0.95, sizes: [180] },
]
for (const v of variants) {
  const svgPath = join(out, `${v.name}.svg`)
  writeFileSync(svgPath, svg(v.scale))
  for (const size of v.sizes) {
    const png = join(out, v.sizes.length > 1 ? `${v.name}-${size}.png` : `${v.name}.png`)
    execFileSync('sips', ['-s', 'format', 'png', '-z', String(size), String(size), svgPath, '--out', png], { stdio: 'ignore' })
  }
}
writeFileSync(join(out, 'README.txt'), 'Generiert von scripts/build-icons.mjs – nicht von Hand bearbeiten.\n')
console.log('[icons] fertig:', out)
