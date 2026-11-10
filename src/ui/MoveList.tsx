import { useEffect, useRef } from 'react'
import type { PlayedMove } from '../core/chess/game'
import { germanSan } from '../core/chess/board'

export interface MoveMark {
  symbol: string
  /** CSS-Klasse für die Farbe, z. B. "blunder" */
  tone: string
}

interface MoveListProps {
  moves: readonly PlayedMove[]
  /** Bewertungszeichen (?!, ?, ??) je Zugindex */
  marks?: Record<number, MoveMark>
  /** markierter Zug (Index) – in der Analyse die aktuelle Stellung */
  active?: number | null
  /** macht Züge anklickbar */
  onSelect?: (index: number) => void
}

/** Zugliste in Paaren ("1. e4 e5"); beginnt korrekt, wenn Schwarz den ersten Zug hat. */
export function MoveList({ moves, marks = {}, active = null, onSelect }: MoveListProps) {
  // nur die Liste selbst scrollen, nicht die ganze Seite (wichtig am Handy)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    if (active === null) el.scrollTop = el.scrollHeight
    else {
      // nur innerhalb der Liste scrollen – scrollIntoView würde am Handy die ganze Seite verschieben
      const a = el.querySelector<HTMLElement>('.move.active')
      if (a) el.scrollTop = a.offsetTop - el.offsetTop - el.clientHeight / 2
    }
  }, [moves.length, active])

  type Cell = { san: string; index: number }
  const rows: { no: number; white?: Cell; black?: Cell }[] = []
  moves.forEach((m, index) => {
    const cell = { san: m.san, index }
    const last = rows[rows.length - 1]
    if (m.color === 'w' || !last || last.black) rows.push({ no: rows.length + 1, [m.color === 'w' ? 'white' : 'black']: cell })
    else last.black = cell
  })
  const show = (c?: Cell) => {
    if (!c) return null
    const mark = marks[c.index]
    const content = (
      <>
        {germanSan(c.san)}
        {mark && mark.symbol && <span className={`mark mark-${mark.tone}`}>{mark.symbol}</span>}
      </>
    )
    return onSelect ? (
      <button type="button" className={`move-btn ${active === c.index ? 'active' : ''}`} aria-current={active === c.index} onClick={() => onSelect(c.index)}>
        {content}
      </button>
    ) : (
      content
    )
  }

  if (moves.length === 0) return <p className="muted">Noch keine Züge.</p>
  return (
    <div className="move-list" aria-label="Zugliste" ref={listRef}>
      {rows.map((r) => (
        <div className="move-row" key={r.no}>
          <span className="move-no">{r.no}.</span>
          <span className={`move ${active === r.white?.index ? 'active' : ''}`}>{r.white ? show(r.white) : '…'}</span>
          <span className={`move ${active === r.black?.index ? 'active' : ''}`}>{show(r.black)}</span>
        </div>
      ))}
    </div>
  )
}
