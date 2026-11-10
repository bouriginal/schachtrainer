import { describe, expect, it } from 'vitest'
import { START_FEN } from '../chess/game'
import { suggestPlans } from './plans'

const ids = (fen: string, color: 'w' | 'b' = 'w', max = 2) => suggestPlans(fen, color, max).map((p) => p.id)

describe('suggestPlans', () => {
  it('empfiehlt in der Startstellung Zentrum und Entwicklung', () => {
    expect(ids(START_FEN, 'w', 3)).toEqual(['develop', 'center'])
  })

  it('stellt eine hängende eigene Figur an erste Stelle', () => {
    // weißer Springer f3 vom Bauern e4 angegriffen
    const fen = 'rnbqkbnr/pppp1ppp/8/8/4p3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4'
    const [first] = suggestPlans(fen, 'w')
    expect(first.id).toBe('save-piece')
    expect(first.title).toBe('Sichere deinen Springer auf f3')
  })

  it('weist auf ungedecktes gegnerisches Material hin', () => {
    const fen = '4k3/8/8/3n4/8/8/8/3RK3 w - - 0 30'
    expect(suggestPlans(fen, 'w')[0]).toMatchObject({ id: 'win-material', squares: ['d5', 'd1'] })
  })

  it('empfiehlt die Rochade und nennt die Figuren, die im Weg stehen', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
    const castle = suggestPlans(fen, 'w', 3).find((p) => p.id === 'castle')!
    expect(castle.why).toContain('f1')
  })

  it('empfiehlt nach der Rochade einen Turm auf die offene Linie', () => {
    const fen = 'r4rk1/pp3ppp/2n2n2/8/8/2N2N2/PP3PPP/R4RK1 w - - 0 15'
    expect(ids(fen)).toContain('rook-file')
    expect(suggestPlans(fen, 'w').find((p) => p.id === 'rook-file')!.title).toMatch(/offene [c-e]-Linie/)
  })

  it('empfiehlt im Bauernendspiel König aktivieren und Freibauer schieben', () => {
    const fen = '8/5k2/8/1P6/8/8/5K2/8 w - - 0 50'
    expect(ids(fen)).toEqual(['push-passer', 'activate-king'])
  })

  it('funktioniert für Schwarz', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    expect(ids(fen, 'b', 3)).toEqual(['develop', 'center'])
  })

  it('liefert immer mindestens einen Plan', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 40'
    expect(suggestPlans(fen, 'w').length).toBeGreaterThan(0)
  })
})
