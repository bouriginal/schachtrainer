import { describe, expect, it } from 'vitest'
import { gameTitle, parsePgn } from '../chess/pgn'
import { analysis } from '../../test/analysis'
import { FakeEngine } from '../../test/fakeEngine'
import { analyzeGame, keyMoments, moveAccuracy, winCurve } from './gameAnalysis'

const LICHESS_PGN = `[Event "Rated Blitz game"]
[Site "https://lichess.org/abcd1234"]
[Date "2026.11.01"]
[White "ich"]
[Black "gegner"]
[Result "0-1"]

1. e4 { [%clk 0:03:00] } 1... e5 2. Nf3 Nc6 3. Nxe5?? { Patzer } (3. Bb5 a6) 3... Nxe5 4. d4 Qh4 0-1

[Event "Zweite"]
[White "a"]
[Black "b"]
[Result "1/2-1/2"]

1. d4 d5 1/2-1/2`

describe('parsePgn', () => {
  it('liest mehrere Partien samt Kopfzeilen und ignoriert Kommentare und Varianten', () => {
    const games = parsePgn(LICHESS_PGN)
    expect(games).toHaveLength(2)
    expect(games[0].moves.map((m) => m.san).join(' ')).toBe('e4 e5 Nf3 Nc6 Nxe5 Nxe5 d4 Qh4')
    expect(games[0].result).toBe('0-1')
    expect(games[0].headers.White).toBe('ich')
    expect(games[0].moves[0].fenAfter).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')
    expect(games[1].result).toBe('1/2-1/2')
  })
  it('meldet Fehler verständlich', () => {
    expect(() => parsePgn('')).toThrow('Der PGN-Text ist leer.')
    expect(() => parsePgn('1. e4 e5 2. Ke3 Ke6 3. Kxe8')).toThrow(/Partie 1/)
  })
  it('bildet einen lesbaren Titel', () => {
    expect(gameTitle({ White: 'ich', Black: 'gegner', Date: '2026.11.01' })).toBe('ich – gegner, 2026.11.01')
    expect(gameTitle({ White: '?', Black: '?', Date: '????.??.??' })).toBe('Weiß – Schwarz')
  })
})

describe('analyzeGame', () => {
  const [game] = parsePgn(LICHESS_PGN)
  const fens = [game.startFen, ...game.moves.map((m) => m.fenAfter)]

  /** Engine-Antworten: ausgeglichen bis 3.Sxe5??, danach klar für Schwarz */
  const engine = () => {
    const e = new FakeEngine()
    const evals = [30, 30, 30, 30, 40, -250, -250, -260, -270]
    const best = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'c6e5', 'd2d4', 'd8h4', 'e5f3']
    fens.forEach((f, i) => e.responses.set(f, analysis(f, [evals[i], best[i]])))
    return e
  }

  it('bewertet jeden Zug mit dem Coach und berechnet Genauigkeit', async () => {
    const progress: number[] = []
    const a = await analyzeGame(game.startFen, game.moves, engine(), { onProgress: (d) => progress.push(d) })
    expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(a.plies).toHaveLength(8)
    expect(a.plies[4]).toMatchObject({ moveClass: 'blunder', bestSan: 'Bb5', kinds: ['hanging_after'] })
    expect(a.plies[4].sentences[0]).toContain('Springer auf e5')
    expect(a.counts.w.blunder).toBe(1)
    expect(a.accuracy.b).toBeGreaterThan(a.accuracy.w)
  })

  it('findet die Wendepunkte und die Bewertungskurve', async () => {
    const a = await analyzeGame(game.startFen, game.moves, engine())
    expect(keyMoments(a, game.moves, 'w')).toEqual([4])
    const curve = winCurve(a)
    expect(curve).toHaveLength(9)
    expect(curve[5]).toBeLessThan(30)
  })

  it('Genauigkeit: 100 % ohne Verlust, sinkt mit dem Verlust', () => {
    expect(Math.round(moveAccuracy(0))).toBe(100)
    expect(moveAccuracy(10)).toBeLessThan(moveAccuracy(5))
    expect(moveAccuracy(100)).toBe(0)
  })
})
