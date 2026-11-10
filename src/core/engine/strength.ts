import { scoreToCp } from './score'
import type { AnalysisLine } from './types'

/**
 * Spielstärke-Stufen für das freie Spiel.
 *
 * Stockfish selbst lässt sich nicht unter ca. 1300 Elo drosseln. Für schwächere Stufen
 * rechnet die Engine deshalb mehrere Kandidatenzüge (MultiPV) mit geringer Tiefe, und
 * wir wählen gelegentlich bewusst einen schlechteren Zug – so entstehen menschenähnliche
 * Fehler statt zufälligem Unsinn. Die Elo-Angaben sind grobe Schätzungen.
 */
export interface StrengthConfig {
  level: number
  label: string
  approxElo: number
  depth?: number
  movetimeMs?: number
  multiPv: number
  /** Wahrscheinlichkeit, nicht den besten Zug zu spielen */
  mistakeChance: number
  /** größter erlaubter Verlust (cp) gegenüber dem besten Zug, wenn ein Fehler gewählt wird */
  maxLossCp: number
}

export const STRENGTH_LEVELS: readonly StrengthConfig[] = [
  { level: 1, label: 'Einsteiger', approxElo: 400, depth: 1, multiPv: 6, mistakeChance: 0.55, maxLossCp: 600 },
  { level: 2, label: 'Anfänger', approxElo: 550, depth: 2, multiPv: 5, mistakeChance: 0.45, maxLossCp: 400 },
  { level: 3, label: 'Gelegenheitsspieler', approxElo: 700, depth: 3, multiPv: 5, mistakeChance: 0.35, maxLossCp: 300 },
  { level: 4, label: 'Vereinsneuling', approxElo: 850, depth: 4, multiPv: 4, mistakeChance: 0.25, maxLossCp: 200 },
  { level: 5, label: 'Fortgeschritten', approxElo: 1000, depth: 5, multiPv: 4, mistakeChance: 0.18, maxLossCp: 150 },
  { level: 6, label: 'Solide', approxElo: 1200, depth: 6, multiPv: 3, mistakeChance: 0.12, maxLossCp: 100 },
  { level: 7, label: 'Vereinsspieler', approxElo: 1400, depth: 8, multiPv: 3, mistakeChance: 0.08, maxLossCp: 60 },
  { level: 8, label: 'Stark', approxElo: 1700, depth: 10, multiPv: 2, mistakeChance: 0.05, maxLossCp: 40 },
  { level: 9, label: 'Experte', approxElo: 2000, depth: 13, multiPv: 1, mistakeChance: 0, maxLossCp: 0 },
  { level: 10, label: 'Maximal', approxElo: 2800, movetimeMs: 1500, multiPv: 1, mistakeChance: 0, maxLossCp: 0 },
]

export const DEFAULT_LEVEL = 2

export function getStrength(level: number): StrengthConfig {
  const clamped = Math.max(1, Math.min(STRENGTH_LEVELS.length, Math.round(level)))
  return STRENGTH_LEVELS[clamped - 1]
}

/**
 * Wählt den Engine-Zug aus den MultiPV-Varianten.
 * `lines` sind aus Sicht von Weiß bewertet; `side` ist die Engine-Farbe.
 * `rng` liefert Zahlen in [0, 1) – im Test deterministisch.
 */
export function pickMove(
  lines: AnalysisLine[],
  config: StrengthConfig,
  side: 'w' | 'b',
  rng: () => number = Math.random,
): string | null {
  const candidates = lines.filter((l) => l.pv.length > 0)
  if (candidates.length === 0) return null
  const sign = side === 'w' ? 1 : -1
  const sorted = [...candidates].sort((a, b) => sign * (scoreToCp(b.score) - scoreToCp(a.score)))
  const best = sorted[0]
  if (sorted.length === 1 || rng() >= config.mistakeChance) return best.pv[0]

  const bestCp = sign * scoreToCp(best.score)
  const alternatives = sorted
    .slice(1)
    .filter((l) => bestCp - sign * scoreToCp(l.score) <= config.maxLossCp)
  if (alternatives.length === 0) return best.pv[0]
  return alternatives[Math.floor(rng() * alternatives.length)].pv[0]
}
