import type { Finding, FindingSubject } from '../findings'
import { exposure } from '../../chess/board'
import { isOpening, MINOR_HOME, undevelopedMinors, type MoveContext } from '../context'

/** Entwicklung: Leichtfiguren raus, Dame nicht zu früh, nicht dieselbe Figur mehrfach ziehen. */
export function development(ctx: MoveContext, subject: FindingSubject): Finding[] {
  if (!isOpening(ctx)) return []
  const { move, before, mover } = ctx
  const out: Finding[] = []
  const minorsHome = undevelopedMinors(before, mover)
  const isMinor = move.piece === 'n' || move.piece === 'b'

  if (isMinor && MINOR_HOME[mover].includes(move.from)) {
    out.push({ kind: 'develops', subject, polarity: 1, weight: 1.5, squares: [move.to], piece: move.piece, square: move.to })
    return out
  }

  if (move.piece === 'q' && !move.captured && ctx.fullmove <= 7 && minorsHome >= 2) {
    out.push({ kind: 'early_queen', subject, polarity: -1, weight: 1.8, squares: [move.to], piece: 'q', square: move.to })
  }

  // Figur zieht erneut, obwohl andere noch schlafen – außer sie wurde angegriffen (dann ist es Flucht)
  const homeSquare = move.piece === 'n' || move.piece === 'b' ? MINOR_HOME[mover].includes(move.from) : true
  if (
    isMinor &&
    !homeSquare &&
    !move.captured &&
    ctx.fullmove <= 10 &&
    minorsHome >= 2 &&
    !exposure(before, move.from)
  ) {
    out.push({ kind: 'moved_twice', subject, polarity: -1, weight: 1.2, squares: [move.from, move.to], piece: move.piece, square: move.to })
  }
  return out
}
