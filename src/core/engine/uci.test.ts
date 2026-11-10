import { describe, expect, it } from 'vitest'
import { parseBestMove, parseInfo, rawToLine, sideToMoveFromFen } from './uci'

describe('parseInfo', () => {
  it('liest Tiefe, MultiPV, cp-Bewertung und Variante', () => {
    const r = parseInfo('info depth 12 seldepth 18 multipv 2 score cp -35 nodes 1234 nps 50000 time 20 pv e7e5 g1f3 b8c6')
    expect(r).toEqual({ depth: 12, multipv: 2, score: { type: 'cp', value: -35 }, pv: ['e7e5', 'g1f3', 'b8c6'] })
  })

  it('liest Mattbewertungen', () => {
    expect(parseInfo('info depth 5 score mate -2 pv h7h8')?.score).toEqual({ type: 'mate', value: -2 })
  })

  it('ignoriert Schranken und Zeilen ohne Variante', () => {
    expect(parseInfo('info depth 10 score cp 20 lowerbound pv e2e4')).toBeNull()
    expect(parseInfo('info depth 10 currmove e2e4 currmovenumber 1')).toBeNull()
    expect(parseInfo('info string NNUE evaluation enabled')).toBeNull()
    expect(parseInfo('bestmove e2e4')).toBeNull()
  })

  it('setzt MultiPV standardmäßig auf 1', () => {
    expect(parseInfo('info depth 1 score cp 10 pv d2d4')?.multipv).toBe(1)
  })
})

describe('parseBestMove', () => {
  it('liest den Zug und ignoriert ponder', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4')
    expect(parseBestMove('bestmove e7e8q')).toBe('e7e8q')
  })
  it('gibt null bei (none) und undefined für andere Zeilen', () => {
    expect(parseBestMove('bestmove (none)')).toBeNull()
    expect(parseBestMove('readyok')).toBeUndefined()
  })
})

describe('Perspektive', () => {
  it('dreht die Bewertung, wenn Schwarz am Zug ist', () => {
    const raw = { depth: 1, multipv: 1, score: { type: 'cp' as const, value: 50 }, pv: ['e7e5'] }
    expect(rawToLine(raw, 'b').score).toEqual({ type: 'cp', value: -50 })
    expect(rawToLine(raw, 'w').score).toEqual({ type: 'cp', value: 50 })
  })
  it('liest die Seite am Zug aus der FEN', () => {
    expect(sideToMoveFromFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toBe('b')
    expect(sideToMoveFromFen('8/8/8/8/8/8/8/K6k w - - 0 1')).toBe('w')
  })
})
