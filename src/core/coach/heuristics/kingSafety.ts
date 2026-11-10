import type { Chess, Square } from 'chess.js'
import type { Color } from '../../chess/game'
import { attackedSquares, fileOf, fileState, rankOf } from '../../chess/board'
import type { Finding, FindingSubject } from '../findings'
import type { MoveContext } from '../context'

const homeRank = (c: Color) => (c === 'w' ? 1 : 8)

function kingSquare(chess: Chess, color: Color): Square | null {
  return chess.findPiece({ type: 'k', color })[0] ?? null
}

/** König noch in der Mitte (d/e-Linie auf der Grundreihe)? */
export function kingInCenter(chess: Chess, color: Color): boolean {
  const k = kingSquare(chess, color)
  if (!k) return false
  const f = fileOf(k)
  return (f === 3 || f === 4) && rankOf(k) === homeRank(color)
}

/** Eigene Zug-Eigenschaften: Rochade, Rochaderecht verloren, Bauernschild geschwächt. */
export function kingSafetyOfMove(ctx: MoveContext, subject: FindingSubject): Finding[] {
  const { move, mover, before } = ctx
  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    return [
      {
        kind: 'castled',
        subject,
        polarity: 1,
        weight: 2,
        squares: [move.to],
        side: move.isKingsideCastle() ? 'king' : 'queen',
      },
    ]
  }
  const rights = before.getCastlingRights(mover)
  if (move.piece === 'k' && (rights.k || rights.q) && ctx.fullmove <= 25) {
    return [{ kind: 'lost_castling', subject, polarity: -1, weight: 2.2, squares: [move.to], square: move.to }]
  }
  // Bauernschild: Bauer vor dem rochierten König zieht (ohne zu schlagen)
  const k = kingSquare(before, mover)
  if (move.piece === 'p' && !move.captured && k && rankOf(k) === homeRank(mover)) {
    const kf = fileOf(k)
    const castledSide = kf >= 6 || kf <= 2
    const pf = fileOf(move.from)
    const pawnHomeRank = mover === 'w' ? 2 : 7
    if (castledSide && Math.abs(pf - kf) <= 1 && rankOf(move.from) === pawnHomeRank) {
      return [{ kind: 'pawn_shield', subject, polarity: -1, weight: 1.6, squares: [move.from, move.to, k], square: move.to }]
    }
  }
  return []
}

/**
 * König in der Mitte nach dem Zug. Wird gemeldet, wenn es ernst wird: ab Zug 8,
 * bei offener e-/d-Linie oder wenn die Gegnerantwort das Umfeld des Königs angreift.
 */
export function kingInCenterAfter(ctx: MoveContext, reply: MoveContext | null): Finding[] {
  const { after, mover, move } = ctx
  if (move.isKingsideCastle() || move.isQueensideCastle() || move.piece === 'k') return []
  if (!kingInCenter(after, mover)) return []
  const k = kingSquare(after, mover)!
  const openCentre = [3, 4].some((f) => fileState(after, f, mover) !== 'closed')

  let replyNearKing = false
  if (reply) {
    const kf = fileOf(k)
    const zone = attackedSquares(reply.after, reply.move.to).filter((sq) => {
      const p = reply.after.get(sq)
      return p?.color === mover && Math.abs(fileOf(sq) - kf) <= 2 && Math.abs(rankOf(sq) - rankOf(k)) <= 1
    })
    replyNearKing = zone.length > 0
  }
  if (ctx.fullmove < 8 && !openCentre && !replyNearKing) return []
  return [{ kind: 'king_in_center', subject: 'move', polarity: -1, weight: replyNearKing ? 2.6 : 1.7, squares: [k], square: k }]
}
