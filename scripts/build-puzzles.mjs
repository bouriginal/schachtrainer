// Baut einen kleinen Auszug aus der Lichess-Puzzle-Datenbank (Lizenz: CC0).
// Liest die ~300 MB große .csv.zst als Datenstrom, filtert unterwegs und bricht ab,
// sobald alle Kontingente voll sind. Es wird nichts Großes auf die Festplatte geschrieben.
//
//   npm run puzzles
//
// CSV-Spalten: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
// FEN = Stellung VOR dem Zug des Gegners; Moves[0] = Gegnerzug, danach abwechselnd die Lösung.
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createZstdDecompress } from 'node:zlib'

const URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'puzzles', 'puzzles.json')

/** Motive für Einsteiger, in Prioritätsreihenfolge (ein Puzzle zählt für das erste passende Motiv) */
const THEMES = [
  'mateIn1',
  'hangingPiece',
  'fork',
  'pin',
  'skewer',
  'mateIn2',
  'backRankMate',
  'discoveredAttack',
  'trappedPiece',
  'doubleCheck',
  'deflection',
  'attraction',
  'capturingDefender',
  'promotion',
  'smotheredMate',
  'xRayAttack',
]
const BANDS = [
  { id: 'leicht', min: 400, max: 899 },
  { id: 'mittel', min: 900, max: 1199 },
  { id: 'schwer', min: 1200, max: 1600 },
]
const PER_BAND = 45

const quota = new Map(THEMES.flatMap((t) => BANDS.map((b) => [`${t}/${b.id}`, PER_BAND])))
const open = () => [...quota.values()].reduce((a, b) => a + b, 0)
const puzzles = []

const controller = new AbortController()
const res = await fetch(URL, { signal: controller.signal })
if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen: ${res.status}`)

const raw = Readable.fromWeb(res.body)
const unzip = createZstdDecompress()
// Nach dem gewollten Abbruch melden die Streams einen AbortError – der ist erwartet
const ignoreAbort = (e) => {
  if (e?.name !== 'AbortError' && e?.code !== 'ABORT_ERR' && e?.code !== 'ERR_STREAM_PREMATURE_CLOSE') throw e
}
raw.on('error', ignoreAbort)
unzip.on('error', ignoreAbort)
const lines = createInterface({ input: raw.pipe(unzip), crlfDelay: Infinity })
let read = 0
try {
  for await (const line of lines) {
    if (read++ === 0) continue // Kopfzeile
    if (read % 200_000 === 0) console.log(`[puzzles] ${read.toLocaleString('de')} Zeilen gelesen, noch ${open()} offen`)
    const [id, fen, moves, rating, rd, popularity, plays, themes] = line.split(',')
    const r = Number(rating)
    if (Number(rd) > 100 || Number(popularity) < 85 || Number(plays) < 300) continue
    const ms = moves.split(' ')
    if (ms.length > 8) continue
    const band = BANDS.find((b) => r >= b.min && r <= b.max)
    if (!band) continue
    const ts = themes.split(' ')
    const theme = THEMES.find((t) => ts.includes(t) && quota.get(`${t}/${band.id}`) > 0)
    if (!theme) continue
    quota.set(`${theme}/${band.id}`, quota.get(`${theme}/${band.id}`) - 1)
    puzzles.push({ id, fen, moves, rating: r, theme, themes: ts.filter((t) => THEMES.includes(t)) })
    if (open() === 0) break
  }
} finally {
  lines.close()
  controller.abort() // Rest der Datei nicht mehr laden
  raw.destroy()
  unzip.destroy()
}

puzzles.sort((a, b) => a.rating - b.rating)
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(
  OUT,
  JSON.stringify({
    source: 'Lichess Puzzle Database (database.lichess.org), Lizenz CC0',
    generatedAt: new Date().toISOString().slice(0, 10),
    puzzles,
  }) + '\n',
)
const missing = [...quota].filter(([, n]) => n > 0)
console.log(`[puzzles] ${puzzles.length} Aufgaben nach ${OUT} geschrieben (${read.toLocaleString('de')} Zeilen gelesen).`)
if (missing.length) console.log(`[puzzles] Nicht voll geworden: ${missing.map(([k, n]) => `${k} (−${n})`).join(', ')}`)
