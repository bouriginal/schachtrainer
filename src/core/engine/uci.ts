import type { AnalysisLine, Score } from './types'

/** Rohdaten einer `info`-Zeile; Bewertung noch aus Sicht der Seite am Zug. */
export interface RawInfo {
  depth: number
  multipv: number
  score: Score
  pv: string[]
}

/**
 * Parst eine UCI-`info`-Zeile. Gibt `null` zurück, wenn die Zeile keine
 * vollständige Variante (Tiefe, Bewertung, PV) enthält oder nur eine Schranke ist.
 */
export function parseInfo(line: string): RawInfo | null {
  if (!line.startsWith('info ')) return null
  const t = line.split(/\s+/)
  let depth: number | null = null
  let multipv = 1
  let score: Score | null = null
  let pv: string[] | null = null

  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        depth = Number(t[++i])
        break
      case 'multipv':
        multipv = Number(t[++i])
        break
      case 'score': {
        const kind = t[++i]
        const value = Number(t[++i])
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') return null
        if (kind === 'cp' || kind === 'mate') score = { type: kind, value }
        break
      }
      case 'pv':
        pv = t.slice(i + 1).filter(Boolean)
        i = t.length
        break
    }
  }
  if (depth === null || score === null || !pv || pv.length === 0) return null
  return { depth, multipv, score, pv }
}

/** Parst `bestmove e2e4 ponder e7e5` → "e2e4"; `(none)` → null. */
export function parseBestMove(line: string): string | null | undefined {
  if (!line.startsWith('bestmove')) return undefined
  const move = line.split(/\s+/)[1]
  return !move || move === '(none)' ? null : move
}

/** Dreht die Bewertung in die Sicht von Weiß. */
export function toWhitePerspective(score: Score, sideToMove: 'w' | 'b'): Score {
  if (sideToMove === 'w') return score
  return { type: score.type, value: -score.value }
}

export function rawToLine(raw: RawInfo, sideToMove: 'w' | 'b'): AnalysisLine {
  return { ...raw, score: toWhitePerspective(raw.score, sideToMove) }
}

export function sideToMoveFromFen(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w'
}
