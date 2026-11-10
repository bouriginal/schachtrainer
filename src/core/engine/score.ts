import type { Score } from './types'

/** Große Zahl für Mattbewertungen; je kürzer das Matt, desto größer. */
const MATE_CP = 100_000

/** Bewertung als vergleichbare Centipawn-Zahl (Matt wird auf sehr große Werte abgebildet). */
export function scoreToCp(score: Score): number {
  if (score.type === 'cp') return score.value
  if (score.value === 0) return -MATE_CP // Matt auf dem Brett: Seite am Zug ist matt – hier nur Fallback
  return Math.sign(score.value) * (MATE_CP - Math.abs(score.value))
}

/**
 * Gewinnwahrscheinlichkeit für Weiß in Prozent (0–100).
 * Logistische Kurve wie bei Lichess (Koeffizient aus deren öffentlicher Kalibrierung).
 */
export function winPercent(score: Score): number {
  if (score.type === 'mate') return score.value > 0 ? 100 : 0
  const cp = Math.max(-1000, Math.min(1000, score.value))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

/** Kurze Anzeige, z. B. "+1.3", "−0.4", "M3", "−M2". */
export function formatScore(score: Score): string {
  if (score.type === 'mate') {
    return score.value >= 0 ? `M${score.value}` : `−M${Math.abs(score.value)}`
  }
  const pawns = score.value / 100
  const s = Math.abs(pawns).toFixed(1)
  if (pawns > 0.04) return `+${s}`
  if (pawns < -0.04) return `−${s}`
  return '0.0'
}
