import { describe, expect, it } from 'vitest'
import { applyMove, applyUci, getStatus, isPromotionMove, kingSquare, legalTargets, START_FEN, toPgn, type PlayedMove } from './game'

const play = (...ucis: string[]) => {
  const moves: PlayedMove[] = []
  let fen = START_FEN
  for (const u of ucis) {
    const m = applyUci(fen, u)
    if (!m) throw new Error(`illegal: ${u}`)
    moves.push(m)
    fen = m.fenAfter
  }
  return moves
}

describe('applyMove', () => {
  it('führt legale Züge aus und liefert SAN/UCI', () => {
    const m = applyMove(START_FEN, 'g1', 'f3')
    expect(m).toMatchObject({ san: 'Nf3', uci: 'g1f3', color: 'w', from: 'g1', to: 'f3' })
  })
  it('gibt bei illegalen Zügen null zurück statt zu werfen', () => {
    expect(applyMove(START_FEN, 'e2', 'e5')).toBeNull()
    expect(applyMove(START_FEN, 'e7', 'e5')).toBeNull()
  })
})

describe('Umwandlung', () => {
  const fen = '8/4P3/8/8/8/8/k7/4K3 w - - 0 1'
  it('erkennt Umwandlungszüge', () => {
    expect(isPromotionMove(fen, 'e7', 'e8')).toBe(true)
    expect(isPromotionMove(fen, 'e1', 'd1')).toBe(false)
  })
  it('wandelt in die gewählte Figur um', () => {
    expect(applyMove(fen, 'e7', 'e8', 'n')?.san).toBe('e8=N')
    expect(applyUci(fen, 'e7e8q')?.uci).toBe('e7e8q')
  })
})

describe('getStatus', () => {
  it('erkennt Schachmatt (Schäfermatt)', () => {
    const s = getStatus(START_FEN, play('e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'))
    expect(s).toMatchObject({ over: true, result: '1-0', reason: 'Schachmatt', inCheck: true, turn: 'b' })
  })
  it('erkennt Patt', () => {
    const fen = 'k7/8/1Q6/8/8/8/8/7K w - - 0 1'
    const m = applyUci(fen, 'h1g2')!
    expect(getStatus(fen, [m])).toMatchObject({ over: true, result: '1/2-1/2', reason: 'Patt' })
  })
  it('erkennt ungenügendes Material', () => {
    const fen = 'k7/8/8/8/8/8/1q6/K7 w - - 0 1'
    expect(getStatus(fen, [applyUci(fen, 'a1b2')!])).toMatchObject({ over: true, reason: 'Ungenügendes Material' })
  })
  it('erkennt dreifache Stellungswiederholung', () => {
    const s = getStatus(START_FEN, play('g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'))
    expect(s.reason).toBe('Dreifache Stellungswiederholung')
  })
  it('meldet laufende Partie', () => {
    expect(getStatus(START_FEN, [])).toMatchObject({ over: false, result: '*', turn: 'w', inCheck: false })
  })
})

describe('Hilfsfunktionen', () => {
  it('liefert legale Zielfelder', () => {
    expect(legalTargets(START_FEN, 'g1').sort()).toEqual(['f3', 'h3'])
    expect(legalTargets(START_FEN, 'e4')).toEqual([])
  })
  it('findet den König', () => {
    expect(kingSquare(START_FEN, 'b')).toBe('e8')
  })
  it('erzeugt PGN mit Kopfzeilen', () => {
    const pgn = toPgn(START_FEN, play('e2e4', 'e7e5'), { white: 'Du', black: 'Stockfish', result: '*', date: new Date(2026, 10, 10) })
    expect(pgn).toContain('[White "Du"]')
    expect(pgn).toContain('[Date "2026.11.10"]')
    expect(pgn).toContain('1. e4 e5')
  })
})
