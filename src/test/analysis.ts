import type { AnalysisResult } from '../core/engine/types'

/** Baut ein Engine-Ergebnis für Tests. Bewertungen in cp aus Sicht von Weiß. */
export function analysis(fen: string, ...lines: [cpOrMate: number | `M${number}`, ...pv: string[]][]): AnalysisResult {
  return {
    fen,
    bestMove: lines[0]?.[1] ?? null,
    lines: lines.map(([s, ...pv], i) => ({
      multipv: i + 1,
      depth: 12,
      score: typeof s === 'number' ? { type: 'cp', value: s } : { type: 'mate', value: Number(s.slice(1)) },
      pv,
    })),
  }
}
