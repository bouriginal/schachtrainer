import type { Square } from 'chess.js'
import { attackedSquares, exposedPieces, exposure, PIECE_VALUE, rankOf } from '../../chess/board'
import type { Finding, FindingSubject, Target } from '../findings'
import type { MoveContext } from '../context'

/**
 * Ziele, die die gezogene Figur nach dem Zug bedroht: ungedeckte Figuren, wertvollere
 * Figuren, der König (Schach) und die schwachen Felder f2/f7 vor dem unrochierten König.
 */
export function threatenedTargets(ctx: MoveContext): Target[] {
  const { after, move, mover } = ctx
  const enemy = mover === 'w' ? 'b' : 'w'
  const attackerValue = PIECE_VALUE[move.promotion ?? move.piece] || 100
  const before = new Set(ctx.before.get(move.from) ? attackedSquares(ctx.before, move.from) : [])
  const out: Target[] = []
  for (const sq of attackedSquares(after, move.to)) {
    const p = after.get(sq)
    if (!p || p.color !== enemy) continue
    // Ziele, die dieselbe Figur schon vor dem Zug angegriffen hat, sind keine neue Drohung
    if (before.has(sq)) continue
    if (p.type === 'k') {
      out.push({ square: sq, type: 'k' })
      continue
    }
    const defended = after.attackers(sq, enemy).length > 0
    const weakKingPawn =
      p.type === 'p' && (sq === (enemy === 'w' ? 'f2' : 'f7')) && after.get((enemy === 'w' ? 'e1' : 'e8') as Square)?.type === 'k'
    if (!defended || PIECE_VALUE[p.type] > attackerValue || weakKingPawn) out.push({ square: sq, type: p.type })
  }
  return out
}

/** Eigenschaften eines Zugs aus taktischer Sicht: Material gewonnen, Gabel, Matt. */
export function tacticsOfMove(ctx: MoveContext, subject: FindingSubject): Finding[] {
  const { move, before, after } = ctx
  const out: Finding[] = []
  if (after.isCheckmate()) {
    return [{ kind: 'gives_mate', subject, polarity: 1, weight: 10, squares: [move.to], count: 1 }]
  }
  if (move.captured) {
    const ex = exposure(before, move.to)
    if (ex && ex.expectedLoss >= 1) {
      out.push({ kind: 'wins_material', subject, polarity: 1, weight: 2 + ex.expectedLoss, squares: [move.to], piece: move.captured, square: move.to, value: ex.expectedLoss })
    }
  }
  out.push(...defenceOfMove(ctx, subject))
  const targets = threatenedTargets(ctx)
  const valuable = targets.filter((t) => t.type === 'k' || PIECE_VALUE[t.type] >= 3)
  // Gabel: zwei wertvolle Ziele, und die angreifende Figur hängt nicht selbst billig
  if (valuable.length >= 2 && !exposure(after, move.to)) {
    out.push({ kind: 'fork', subject, polarity: 1, weight: 3.5, squares: [move.to, ...valuable.map((t) => t.square)], piece: move.piece, square: move.to, targets: valuable })
  }
  return out
}

/**
 * Verteidigung: Hing vor dem Zug eine eigene Figur, wird erkannt, ob der Zug den
 * Angreifer schlägt oder die Figur in Sicherheit bringt (wegziehen oder decken).
 */
function defenceOfMove(ctx: MoveContext, subject: FindingSubject): Finding[] {
  const { before, after, move, mover } = ctx
  const threatened = exposedPieces(before, mover).filter((e) => e.expectedLoss >= 1)
  if (threatened.length === 0) return []
  const main = threatened[0]
  if (move.captured && main.attackers.includes(move.to)) {
    return [
      {
        kind: 'removes_attacker',
        subject,
        polarity: 1,
        weight: 2.5 + main.expectedLoss,
        squares: [move.to, main.square],
        piece: move.captured,
        square: move.to,
        targets: [{ square: main.square, type: main.type }],
      },
    ]
  }
  const nowAt = main.square === move.from ? move.to : main.square
  const stillExposed = exposure(after, nowAt)
  if (!stillExposed && !after.isCheck()) {
    return [
      {
        kind: 'saves_piece',
        subject,
        polarity: 1,
        weight: 2 + main.expectedLoss,
        squares: [nowAt],
        piece: main.type,
        square: main.square,
      },
    ]
  }
  return []
}

/** Nach dem eigenen Zug hängende eigene Figuren. `reply` (Engine-Antwort) bestätigt die Gefahr. */
export function hangingAfter(ctx: MoveContext, reply: MoveContext | null): Finding[] {
  const { before, after, mover } = ctx
  const wasExposed = new Set(exposedPieces(before, mover).map((e) => e.square))
  const out: Finding[] = []
  for (const ex of exposedPieces(after, mover)) {
    const confirmed = reply ? reply.move.to === ex.square && !!reply.move.captured : ex.expectedLoss >= 3
    if (!confirmed) continue
    // Figur, die gerade gezogen hat, hing "vorher" auf einem anderen Feld – zählt nicht als vorher
    const wasBefore = ex.square !== ctx.move.to && wasExposed.has(ex.square)
    out.push({
      kind: 'hanging_after',
      subject: 'move',
      polarity: -1,
      weight: 3 + ex.expectedLoss,
      squares: [ex.square, ...ex.attackers],
      piece: ex.type,
      square: ex.square,
      value: ex.expectedLoss,
      wasBefore,
      san: reply?.move.san,
    })
  }
  return out
}

/** Die beste Gegnerantwort greift mehrere Ziele an (Doppelangriff) oder gibt Schach mit Angriff. */
export function replyAttack(reply: MoveContext): Finding[] {
  if (reply.move.captured) return [] // Schlagzüge behandelt hangingAfter
  const targets = threatenedTargets(reply)
  if (targets.length < 2) return []
  const weight = 2.5 + targets.reduce((s, t) => s + (t.type === 'k' ? 2 : PIECE_VALUE[t.type] / 3), 0)
  return [
    {
      kind: 'reply_attack',
      subject: 'move',
      polarity: -1,
      weight,
      squares: targets.map((t) => t.square),
      piece: reply.move.piece,
      square: reply.move.to,
      san: reply.move.san,
      targets: targets.sort((a, b) => fileOrder(a.square) - fileOrder(b.square)),
    },
  ]
}

const fileOrder = (sq: string) => sq.charCodeAt(0) * 10 + rankOf(sq)
