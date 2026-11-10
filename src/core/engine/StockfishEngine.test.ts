import { describe, expect, it } from 'vitest'
import { StockfishEngine } from './StockfishEngine'
import { AbortedError, type UciTransport } from './types'

/** simuliert Stockfish: antwortet auf Handshake, `go` beantwortet der Test selbst */
class FakeTransport implements UciTransport {
  sent: string[] = []
  private listener: (l: string) => void = () => {}
  send(cmd: string) {
    this.sent.push(cmd)
    if (cmd === 'uci') queueMicrotask(() => this.emit('id name Fake', 'uciok'))
    if (cmd === 'isready') queueMicrotask(() => this.emit('readyok'))
    if (cmd === 'stop') queueMicrotask(() => this.emit('bestmove 0000'))
  }
  onLine(l: (line: string) => void) {
    this.listener = l
  }
  terminate() {}
  emit(...lines: string[]) {
    for (const l of lines) this.listener(l)
  }
  goCount() {
    return this.sent.filter((s) => s.startsWith('go')).length
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))
const FEN_BLACK = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

describe('StockfishEngine', () => {
  it('führt den UCI-Handshake aus und sendet Position und Suche', async () => {
    const t = new FakeTransport()
    const engine = new StockfishEngine(t)
    const p = engine.analyze(FEN_BLACK, { depth: 8, multiPv: 2 })
    await tick()
    expect(t.sent).toEqual([
      'uci',
      'setoption name Hash value 32',
      'isready',
      'setoption name MultiPV value 2',
      `position fen ${FEN_BLACK}`,
      'go depth 8',
    ])
    t.emit(
      'info depth 8 multipv 1 score cp 30 pv e7e5 g1f3',
      'info depth 8 multipv 2 score cp 10 pv c7c5',
      'bestmove e7e5 ponder g1f3',
    )
    const r = await p
    expect(r.bestMove).toBe('e7e5')
    // Schwarz am Zug: +30 aus Sicht von Schwarz = −30 aus Sicht von Weiß
    expect(r.lines.map((l) => [l.pv[0], l.score])).toEqual([
      ['e7e5', { type: 'cp', value: -30 }],
      ['c7c5', { type: 'cp', value: -10 }],
    ])
  })

  it('arbeitet Aufträge nacheinander ab', async () => {
    const t = new FakeTransport()
    const engine = new StockfishEngine(t)
    const a = engine.analyze(FEN_BLACK, { depth: 1 })
    const b = engine.analyze(FEN_BLACK, { movetimeMs: 100 })
    await tick()
    expect(t.goCount()).toBe(1)
    t.emit('info depth 1 score cp 0 pv e7e5', 'bestmove e7e5')
    await a
    expect(t.sent.at(-1)).toBe('go movetime 100')
    t.emit('info depth 1 score cp 0 pv d7d5', 'bestmove d7d5')
    expect((await b).bestMove).toBe('d7d5')
  })

  it('bricht laufende und wartende Aufträge ab', async () => {
    const t = new FakeTransport()
    const engine = new StockfishEngine(t)
    const c1 = new AbortController()
    const c2 = new AbortController()
    const running = engine.analyze(FEN_BLACK, { depth: 20, signal: c1.signal })
    const waiting = engine.analyze(FEN_BLACK, { depth: 20, signal: c2.signal })
    const after = engine.analyze(FEN_BLACK, { depth: 1 })
    await tick()
    c2.abort()
    c1.abort()
    await expect(waiting).rejects.toBeInstanceOf(AbortedError)
    await expect(running).rejects.toBeInstanceOf(AbortedError)
    expect(t.sent).toContain('stop')
    await tick()
    t.emit('info depth 1 score cp 0 pv e7e5', 'bestmove e7e5')
    expect((await after).bestMove).toBe('e7e5')
    expect(t.goCount()).toBe(2) // der wartende Auftrag wurde nie gestartet
  })
})
