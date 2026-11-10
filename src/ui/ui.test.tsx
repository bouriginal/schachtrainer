// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { applyUci, START_FEN, type PlayedMove } from '../core/chess/game'
import { EvalBar } from './EvalBar'
import { MoveList } from './MoveList'

describe('MoveList', () => {
  it('zeigt Züge paarweise mit Zugnummer', () => {
    const moves: PlayedMove[] = []
    let fen = START_FEN
    for (const u of ['e2e4', 'c7c5', 'g1f3']) {
      const m = applyUci(fen, u)!
      moves.push(m)
      fen = m.fenAfter
    }
    render(<MoveList moves={moves} />)
    const rows = screen.getByLabelText('Zugliste').querySelectorAll('.move-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toBe('1.e4c5')
    expect(rows[1].textContent).toBe('2.Sf3') // deutsche Notation
  })
  it('hängt Bewertungszeichen an', () => {
    const m = applyUci(START_FEN, 'g2g4')!
    render(<MoveList moves={[m]} marks={{ 0: { symbol: '?!', tone: 'inaccuracy' } }} />)
    expect(screen.getByText('?!')).toHaveClass('mark-inaccuracy')
  })
  it('zeigt einen Hinweis ohne Züge', () => {
    render(<MoveList moves={[]} />)
    expect(screen.getByText('Noch keine Züge.')).toBeInTheDocument()
  })
})

describe('EvalBar', () => {
  it('zeigt die Bewertung als Text und Wert', () => {
    render(<EvalBar score={{ type: 'cp', value: 120 }} orientation="white" />)
    const bar = screen.getByRole('meter', { name: 'Bewertung' })
    expect(bar).toHaveAttribute('aria-valuetext', 'Bewertung +1.2')
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThan(50)
  })
})
