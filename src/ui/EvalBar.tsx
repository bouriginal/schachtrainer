import { formatScore, winPercent } from '../core/engine/score'
import type { Score } from '../core/engine/types'

/**
 * Bewertungsbalken. Höhe = Gewinnwahrscheinlichkeit für Weiß (nicht linear in
 * Centipawns, damit kleine Vorteile sichtbar bleiben und große nicht übertreiben).
 */
export function EvalBar({ score, orientation }: { score: Score | null; orientation: 'white' | 'black' }) {
  const white = score ? winPercent(score) : 50
  const label = score ? formatScore(score) : '…'
  const whiteBetter = white >= 50
  return (
    <div
      className={`eval-bar ${orientation === 'black' ? 'flipped' : ''}`}
      role="meter"
      aria-label="Bewertung"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(white)}
      aria-valuetext={score ? `Bewertung ${label}` : 'wird berechnet'}
      title={score ? `Bewertung: ${label} (positiv = Weiß besser)` : 'Bewertung wird berechnet'}
    >
      <div className="eval-white" style={{ '--pct': `${white}%` } as React.CSSProperties} />
      <span className={`eval-label ${whiteBetter ? 'on-white' : 'on-black'}`}>{label}</span>
    </div>
  )
}
