import { useState } from 'react'

/**
 * Bewertungsverlauf einer Partie: Gewinnchance für Weiß je Halbzug (0–100 %).
 * Eine einzige Datenreihe → keine Legende; Fläche oben = Weiß besser. Hover zeigt Zug und
 * Bewertung, Klick springt zur Stellung.
 */
export function EvalGraph({
  values,
  labels,
  current,
  marks = {},
  onSelect,
}: {
  /** Gewinnchance Weiß in %, Index 0 = Startstellung */
  values: number[]
  /** Beschriftung je Index (z. B. "12. Sf3") */
  labels: string[]
  current: number
  /** Indizes mit Fehlern hervorheben: Index → "mistake" | "blunder" */
  marks?: Record<number, string>
  onSelect: (index: number) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 600
  const H = 120
  const n = Math.max(1, values.length - 1)
  const x = (i: number) => (i / n) * W
  const y = (v: number) => H - (v / 100) * H
  const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `0,${H} ${line} ${W},${H}`
  const pick = (clientX: number, rect: DOMRect) => Math.max(0, Math.min(values.length - 1, Math.round(((clientX - rect.left) / rect.width) * n)))
  const shown = hover ?? current

  return (
    <figure className="eval-graph">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Bewertungsverlauf der Partie"
        onMouseMove={(e) => setHover(pick(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => onSelect(pick(e.clientX, e.currentTarget.getBoundingClientRect()))}
      >
        <rect x="0" y="0" width={W} height={H} className="eg-bg" />
        <polygon points={area} className="eg-area" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="eg-mid" />
        <polyline points={line} className="eg-line" vectorEffect="non-scaling-stroke" />
        {Object.entries(marks).map(([i, tone]) => (
          <line key={i} x1={x(Number(i))} x2={x(Number(i))} y1={0} y2={H} className={`eg-mark eg-${tone}`} vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={x(shown)} x2={x(shown)} y1={0} y2={H} className="eg-cursor" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="eg-tip" aria-live="polite">
        {labels[shown]} · Weiß {Math.round(values[shown])} %
      </figcaption>
    </figure>
  )
}

/** Kleiner Verlauf (z. B. Taktik-Wertung). Eine Reihe, Endwert beschriftet. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null
  const W = 200
  const H = 40
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(1, max - min)
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - 4 - ((v - min) / span) * (H - 8)).toFixed(1)}`).join(' ')
  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label}: von ${values[0]} auf ${values[values.length - 1]}`}>
      <polyline points={pts} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Horizontaler Balken mit Beschriftung (Anteil 0–1) */
export function RateBar({ label, rate, detail }: { label: string; rate: number; detail: string }) {
  return (
    <div className="ratebar" title={`${label}: ${detail}`}>
      <span className="rb-label">{label}</span>
      <span className="rb-track" aria-hidden="true">
        <span className="rb-fill" style={{ width: `${Math.round(rate * 100)}%` }} />
      </span>
      <span className="rb-value">{detail}</span>
    </div>
  )
}
