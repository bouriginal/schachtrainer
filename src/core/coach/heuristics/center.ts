import type { Square } from 'chess.js'
import type { Finding, FindingSubject } from '../findings'
import { fileOf } from '../../chess/board'
import { undevelopedMinors, type MoveContext } from '../context'

const CENTER = new Set(['d4', 'e4', 'd5', 'e5'])

/** Zentrumskontrolle in der Eröffnung: Bauern ins Zentrum gut, Randbauern früh eher nicht. */
export function center(ctx: MoveContext, subject: FindingSubject): Finding[] {
  const { move, mover, before } = ctx
  if (move.piece !== 'p' || ctx.fullmove > 10) return []
  // Schlagzüge ins Zentrum sind Abtausch, keine Besetzung – das erklären andere Heuristiken
  if (CENTER.has(move.to) && !move.captured) {
    return [{ kind: 'center_pawn', subject, polarity: 1, weight: 1.4, squares: ['d4', 'e4', 'd5', 'e5'] as Square[], square: move.to }]
  }
  const f = fileOf(move.to)
  const flank = f <= 1 || f >= 6 // a, b, g, h
  if (flank && !move.captured && ctx.fullmove <= 8 && undevelopedMinors(before, mover) >= 2) {
    return [{ kind: 'flank_pawn', subject, polarity: -1, weight: 1.1, squares: [move.to], square: move.to }]
  }
  return []
}
