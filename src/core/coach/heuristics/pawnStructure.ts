import type { Chess, Square } from 'chess.js'
import type { Color } from '../../chess/game'
import { fileOf, opposite, piecesOf, rankOf } from '../../chess/board'
import type { Finding, FindingSubject } from '../findings'
import type { MoveContext } from '../context'

interface Structure {
  doubled: Set<number>
  isolated: Set<Square>
  passed: Set<Square>
}

export function pawnStructure(chess: Chess, color: Color): Structure {
  const own = piecesOf(chess, color).filter((p) => p.type === 'p')
  const enemy = piecesOf(chess, opposite(color)).filter((p) => p.type === 'p')
  const perFile = new Map<number, number>()
  for (const p of own) perFile.set(fileOf(p.square), (perFile.get(fileOf(p.square)) ?? 0) + 1)
  const doubled = new Set([...perFile].filter(([, n]) => n > 1).map(([f]) => f))
  const isolated = new Set(own.filter((p) => !perFile.has(fileOf(p.square) - 1) && !perFile.has(fileOf(p.square) + 1)).map((p) => p.square))
  const dir = color === 'w' ? 1 : -1
  const passed = new Set(
    own
      .filter((p) =>
        !enemy.some(
          (e) => Math.abs(fileOf(e.square) - fileOf(p.square)) <= 1 && (rankOf(e.square) - rankOf(p.square)) * dir > 0,
        ),
      )
      .map((p) => p.square),
  )
  return { doubled, isolated, passed }
}

/** Neue Schwächen oder Stärken in der eigenen Bauernstruktur durch den Zug. */
export function pawnStructureChange(ctx: MoveContext, subject: FindingSubject): Finding[] {
  const { before, after, mover, move } = ctx
  const a = pawnStructure(before, mover)
  const b = pawnStructure(after, mover)
  const out: Finding[] = []
  const newDoubled = [...b.doubled].filter((f) => !a.doubled.has(f))
  if (newDoubled.length) {
    const sq = piecesOf(after, mover).filter((p) => p.type === 'p' && fileOf(p.square) === newDoubled[0]).map((p) => p.square)
    out.push({ kind: 'doubled_pawns', subject, polarity: -1, weight: 0.9, squares: sq, square: sq[0] })
  }
  const newIsolated = [...b.isolated].filter((s) => !a.isolated.has(s) && !(move.piece === 'p' && s === move.to && a.isolated.has(move.from)))
  if (newIsolated.length) out.push({ kind: 'isolated_pawn', subject, polarity: -1, weight: 0.8, squares: newIsolated, square: newIsolated[0] })
  // Freibauer neu entstanden (nicht nur der bestehende weitergezogen)
  const newPassed = [...b.passed].filter((s) => !a.passed.has(s) && !(move.piece === 'p' && s === move.to && a.passed.has(move.from)))
  if (newPassed.length && ctx.fullmove > 10) out.push({ kind: 'passed_pawn', subject, polarity: 1, weight: 1.3, squares: newPassed, square: newPassed[0] })
  return out
}
