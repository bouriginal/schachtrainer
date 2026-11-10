import { Chess } from 'chess.js'
import { AbortedError, type AnalysisResult, type AnalyzeOptions, type EngineClient } from '../core/engine/types'

/**
 * Deterministische Fake-Engine für Tests: spielt den ersten legalen Zug
 * (alphabetisch nach UCI) und bewertet jede Stellung mit 0.
 * Mit `responses` lassen sich Ergebnisse für bestimmte FENs vorgeben.
 */
export class FakeEngine implements EngineClient {
  calls: { fen: string; options: AnalyzeOptions }[] = []
  responses = new Map<string, AnalysisResult>()

  async analyze(fen: string, options: AnalyzeOptions): Promise<AnalysisResult> {
    this.calls.push({ fen, options })
    await Promise.resolve()
    if (options.signal?.aborted) throw new AbortedError()
    const preset = this.responses.get(fen)
    if (preset) return preset
    const moves = new Chess(fen)
      .moves({ verbose: true })
      .map((m) => m.from + m.to + (m.promotion ?? ''))
      .sort()
    return {
      fen,
      bestMove: moves[0] ?? null,
      lines: moves[0] ? [{ multipv: 1, depth: options.depth ?? 1, score: { type: 'cp', value: 0 }, pv: [moves[0]] }] : [],
    }
  }

  dispose() {}
}

/** wartet, bis alle anstehenden Microtasks/Promises abgearbeitet sind */
export const flush = () => new Promise((r) => setTimeout(r, 0))
