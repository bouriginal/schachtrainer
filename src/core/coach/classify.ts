import { winPercent } from '../engine/score'
import type { Score } from '../engine/types'
import type { Color } from '../chess/game'

export type MoveClass = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

/**
 * Schwellen für den Verlust an Gewinnwahrscheinlichkeit (Prozentpunkte, aus Sicht des Ziehenden).
 * Entspricht den Lichess-Werten (0,1 / 0,2 / 0,3 auf deren −1…1-Skala = 5 / 10 / 15 %).
 */
export const THRESHOLDS = { good: 2, inaccuracy: 5, mistake: 10, blunder: 15 } as const

export const CLASS_LABEL: Record<MoveClass, string> = {
  best: 'Bester Zug',
  good: 'Guter Zug',
  inaccuracy: 'Ungenau',
  mistake: 'Fehler',
  blunder: 'Patzer',
}

/** Gewinnchance in Prozent aus Sicht von `color` */
export function winFor(score: Score, color: Color): number {
  const w = winPercent(score)
  return color === 'w' ? w : 100 - w
}

export interface Classification {
  moveClass: MoveClass
  /** Verlust an Gewinnwahrscheinlichkeit in Prozentpunkten (≥ 0) */
  winLoss: number
  winBefore: number
  winAfter: number
}

/**
 * @param bestScore Bewertung der Stellung vor dem Zug (= nach dem besten Zug), Sicht Weiß
 * @param afterScore Bewertung nach dem gespielten Zug, Sicht Weiß
 * @param isBestMove der gespielte Zug ist der Engine-Zug
 */
export function classifyMove(bestScore: Score, afterScore: Score, mover: Color, isBestMove: boolean): Classification {
  const winBefore = winFor(bestScore, mover)
  const winAfter = winFor(afterScore, mover)
  const winLoss = Math.max(0, winBefore - winAfter)
  let moveClass: MoveClass
  if (isBestMove || winLoss < THRESHOLDS.good) moveClass = isBestMove ? 'best' : 'good'
  else if (winLoss < THRESHOLDS.inaccuracy) moveClass = 'good'
  else if (winLoss < THRESHOLDS.mistake) moveClass = 'inaccuracy'
  else if (winLoss < THRESHOLDS.blunder) moveClass = 'mistake'
  else moveClass = 'blunder'
  // Ein verpasstes eigenes Matt ist immer mindestens ein Fehler, auch in Gewinnstellung
  if (bestScore.type === 'mate' && Math.sign(bestScore.value) === (mover === 'w' ? 1 : -1) && afterScore.type !== 'mate') {
    if (moveClass === 'best' || moveClass === 'good' || moveClass === 'inaccuracy') moveClass = 'mistake'
  }
  return { moveClass, winLoss, winBefore, winAfter }
}

export const isBad = (c: MoveClass) => c === 'mistake' || c === 'blunder'
