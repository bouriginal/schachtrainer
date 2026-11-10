import type { Square } from 'chess.js'
import type { Color, PlayedMove } from '../chess/game'
import { winFor, type MoveClass } from '../coach/classify'
import { reviewMove, type CoachArrow } from '../coach/explain'
import type { FindingKind } from '../coach/findings'
import type { AnalysisResult, EngineClient, Score } from '../engine/types'

/** Kompakte, speicherbare Bewertung eines Zugs */
export interface PlyAnalysis {
  /** Bewertung NACH dem Zug, Sicht Weiß */
  score: Score
  moveClass: MoveClass
  label: string
  winLoss: number
  sentences: string[]
  bestSan: string | null
  bestLineSan: string[]
  arrows: CoachArrow[]
  highlights: Partial<Record<Square, 'danger' | 'good'>>
  /** negative Befunde zum Zug – Grundlage für Fehlermuster */
  kinds: FindingKind[]
}

export interface GameAnalysis {
  depth: number
  analyzedAt: number
  /** Bewertung der Startstellung, Sicht Weiß */
  startScore: Score
  plies: PlyAnalysis[]
  /** Genauigkeit in Prozent je Farbe (Lichess-Formel) */
  accuracy: Record<Color, number>
  counts: Record<Color, Record<MoveClass, number>>
}

/** Genauigkeit eines Zugs aus dem Verlust an Gewinnchance (Formel wie Lichess) */
export function moveAccuracy(winLoss: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * winLoss) - 3.1669))
}

export interface AnalyzeGameOptions {
  depth?: number
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

/**
 * Analysiert eine Partie Zug für Zug: Jede Stellung wird einmal von der Engine bewertet;
 * die Analyse der Stellung i ist zugleich "nachher" für Zug i−1 und "vorher" für Zug i.
 * Jeder Zug läuft durch denselben Coach (reviewMove) wie im freien Spiel.
 */
export async function analyzeGame(startFen: string, moves: readonly PlayedMove[], engine: EngineClient, opts: AnalyzeGameOptions = {}): Promise<GameAnalysis> {
  const { depth = 12, signal, onProgress } = opts
  const fens = [startFen, ...moves.map((m) => m.fenAfter)]
  const results: AnalysisResult[] = []
  for (let i = 0; i < fens.length; i++) {
    results.push(await engine.analyze(fens[i], { depth, multiPv: 1, signal }))
    onProgress?.(i + 1, fens.length)
  }
  const plies: PlyAnalysis[] = []
  const counts: GameAnalysis['counts'] = { w: emptyCounts(), b: emptyCounts() }
  const acc: Record<Color, number[]> = { w: [], b: [] }
  moves.forEach((m, i) => {
    const r = reviewMove({ fenBefore: fens[i], uci: m.uci, before: results[i], after: results[i + 1] })
    if (!r) throw new Error(`Zug ${i + 1} (${m.san}) ist ungültig`)
    counts[m.color][r.moveClass]++
    acc[m.color].push(moveAccuracy(r.winLoss))
    plies.push({
      score: r.scoreAfter,
      moveClass: r.moveClass,
      label: r.label,
      winLoss: Math.round(r.winLoss * 10) / 10,
      sentences: r.sentences,
      bestSan: r.bestSan,
      bestLineSan: r.bestLineSan.slice(0, 5),
      arrows: r.arrows,
      highlights: r.highlights,
      kinds: r.findings.filter((f) => f.subject === 'move' && f.polarity < 0).map((f) => f.kind),
    })
  })
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 100)
  return {
    depth,
    analyzedAt: Date.now(),
    startScore: results[0].lines[0]?.score ?? { type: 'cp', value: 0 },
    plies,
    accuracy: { w: avg(acc.w), b: avg(acc.b) },
    counts,
  }
}

const emptyCounts = (): Record<MoveClass, number> => ({ best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 })

/** Wendepunkte: die Züge mit dem größten Verlust (nur Fehler/Patzer), optional nur einer Farbe */
export function keyMoments(a: GameAnalysis, moves: readonly PlayedMove[], color?: Color, max = 3): number[] {
  return a.plies
    .map((p, i) => ({ i, p }))
    .filter(({ i, p }) => (!color || moves[i].color === color) && (p.moveClass === 'mistake' || p.moveClass === 'blunder'))
    .sort((x, y) => y.p.winLoss - x.p.winLoss)
    .slice(0, max)
    .map(({ i }) => i)
    .sort((x, y) => x - y)
}

/** Gewinnchance für Weiß nach jedem Halbzug (für den Bewertungsgraphen), Index 0 = Startstellung */
export function winCurve(a: GameAnalysis): number[] {
  return [winFor(a.startScore, 'w'), ...a.plies.map((p) => winFor(p.score, 'w'))]
}
