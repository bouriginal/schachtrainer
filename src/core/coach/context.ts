import { Chess, type Move } from 'chess.js'
import type { Color } from '../chess/game'
import { fullmoveOf } from '../chess/board'

/** Ein Zug samt Stellung davor und danach – Eingabe für alle Heuristiken. */
export interface MoveContext {
  fenBefore: string
  fenAfter: string
  before: Chess
  after: Chess
  move: Move
  mover: Color
  /** Zugnummer vor dem Zug */
  fullmove: number
}

export function buildContext(fenBefore: string, uci: string): MoveContext | null {
  const chess = new Chess(fenBefore)
  let move: Move
  try {
    move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  } catch {
    return null
  }
  return {
    fenBefore,
    fenAfter: chess.fen(),
    before: new Chess(fenBefore),
    after: chess,
    move,
    mover: move.color,
    fullmove: fullmoveOf(fenBefore),
  }
}

/** Startfelder der Leichtfiguren je Farbe */
export const MINOR_HOME: Record<Color, string[]> = {
  w: ['b1', 'g1', 'c1', 'f1'],
  b: ['b8', 'g8', 'c8', 'f8'],
}

/** Anzahl der Leichtfiguren, die noch auf ihrem Startfeld stehen */
export function undevelopedMinors(chess: Chess, color: Color): number {
  return MINOR_HOME[color].filter((sq) => {
    const p = chess.get(sq as never)
    return p && p.color === color && (p.type === 'n' || p.type === 'b')
  }).length
}

export const isOpening = (ctx: MoveContext) => ctx.fullmove <= 12
