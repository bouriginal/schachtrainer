// Integrationstest: echter Stockfish (Node-Build) + unser StockfishEngine-Client.
// Läuft nicht bei npm test, sondern mit: npm run test:engine
import { afterAll, beforeAll, expect, it } from 'vitest'
import { StockfishEngine } from './StockfishEngine'
import { getStrength, pickMove } from './strength'
import type { UciTransport } from './types'
import { scoreToCp } from './score'
import { playerColor, type Endgame } from '../endgames/endgame'
import data from '../../data/endgames.json'

const endgames = data.endgames


async function createEngine() {
  let listener: (l: string) => void = () => {}
  const { default: initStockfish } = await import('stockfish')
  const sf = initStockfish('lite-single', (line: string) => {
    const l = String(line)
    setTimeout(() => listener(l), 0)
  })
  const transport: UciTransport = {
    send: (c) => sf.processCommand(c),
    onLine: (l) => (listener = l),
    terminate: () => sf.terminate(),
  }
  return new StockfishEngine(transport)
}

// Der Node-Build von Stockfish lässt sich pro Prozess nur einmal starten → eine gemeinsame Instanz
let engine: StockfishEngine
beforeAll(async () => {
  engine = await createEngine()
})
afterAll(() => engine.dispose())

it('bestätigt das erwartete Ergebnis aller Endspiel-Stellungen', async () => {
  for (const e of endgames as Endgame[]) {
    const r = await engine.analyze(e.fen, { depth: 18 })
    const s = r.lines[0].score
    const forPlayer = playerColor(e) === 'w' ? scoreToCp(s) : -scoreToCp(s)
    if (e.goal === 'draw') expect(Math.abs(forPlayer), e.id).toBeLessThan(150)
    else expect(forPlayer, e.id).toBeGreaterThan(400)
  }
}, 120_000)

it('analysiert mit echtem Stockfish', async () => {
  // beliebige Stellung mit Schwarz am Zug
  const fen = 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R b KQkq - 0 3'
  const r = await engine.analyze(fen, { depth: 10, multiPv: 3 })
  console.log(JSON.stringify(r.lines.map((l) => [l.pv[0], l.score, l.depth])), r.bestMove)
  expect(r.lines).toHaveLength(3)
  expect(r.lines[0].pv[0]).not.toBe(r.lines[1].pv[0])
  const mate = await engine.analyze('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', { depth: 8 })
  console.log(JSON.stringify(mate.lines[0]))
  expect(mate.lines[0].score).toEqual({ type: 'mate', value: 1 })
  expect(mate.bestMove).toBe('a1a8')
  const blackMated = await engine.analyze('r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1', { depth: 8 })
  expect(blackMated.lines[0].score).toEqual({ type: 'mate', value: -1 }) // aus Sicht von Weiß
  const weak = await engine.analyze('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { depth: 1, multiPv: 6 })
  expect(pickMove(weak.lines, getStrength(1), 'w')).toMatch(/^[a-h][1-8][a-h][1-8]$/)
}, 60_000)
