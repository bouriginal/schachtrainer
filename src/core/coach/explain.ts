import type { Square } from 'chess.js'
import { uciLineToSan } from '../chess/board'
import type { Color } from '../chess/game'
import type { AnalysisResult, Score } from '../engine/types'
import { classifyMove, CLASS_LABEL, isBad, type MoveClass } from './classify'
import { buildContext, type MoveContext } from './context'
import { sortByWeight, type Finding } from './findings'
import { center } from './heuristics/center'
import { development } from './heuristics/development'
import { kingInCenterAfter, kingSafetyOfMove } from './heuristics/kingSafety'
import { pawnStructureChange } from './heuristics/pawnStructure'
import { hangingAfter, replyAttack, tacticsOfMove } from './heuristics/tactics'
import { describeBestFinding, describeMoveFinding, genericWorse, kingInCenterWithAttack, showMove } from './text/de'

export interface CoachArrow {
  from: Square
  to: Square
  kind: 'best' | 'threat' | 'played'
}

export interface MoveReview {
  fenBefore: string
  fenAfter: string
  mover: Color
  uci: string
  san: string
  moveClass: MoveClass
  label: string
  winLoss: number
  scoreAfter: Score
  bestUci: string | null
  bestSan: string | null
  /** beste Variante ab der Stellung vor dem Zug (SAN) */
  bestLineSan: string[]
  /** Engine-Fortsetzung nach dem gespielten Zug (SAN, beginnt mit der Gegnerantwort) */
  replyLineSan: string[]
  /** Erklärungssätze in Reihenfolge */
  sentences: string[]
  findings: Finding[]
  arrows: CoachArrow[]
  /** Felder → Bedeutung (für die Einfärbung) */
  highlights: Partial<Record<Square, 'danger' | 'good'>>
}

/** Alle Zug-Heuristiken, die für jeden Zug (gespielt oder bester) gelten */
export function moveFeatures(ctx: MoveContext, subject: 'move' | 'best'): Finding[] {
  return [
    ...tacticsOfMove(ctx, subject),
    ...kingSafetyOfMove(ctx, subject),
    ...development(ctx, subject),
    ...center(ctx, subject),
    ...pawnStructureChange(ctx, subject),
  ]
}

export interface ReviewInput {
  fenBefore: string
  uci: string
  /** Analyse der Stellung VOR dem Zug (MultiPV erlaubt) */
  before: AnalysisResult
  /** Analyse der Stellung NACH dem Zug */
  after: AnalysisResult
}

/**
 * Herzstück des Coaches: verbindet Engine-Bewertung und Heuristiken zu einer
 * Erklärung in Klartext. Rein und deterministisch → mit FEN-Fixtures testbar.
 */
export function reviewMove({ fenBefore, uci, before, after }: ReviewInput): MoveReview | null {
  const ctx = buildContext(fenBefore, uci)
  if (!ctx) return null
  const best = before.lines[0]
  const bestUci = best?.pv[0] ?? before.bestMove
  const afterLine = after.lines[0]
  const mover = ctx.mover

  // Bewertung nach dem Zug: Matt auf dem Brett hat keine Engine-Zeile
  const scoreAfter: Score = ctx.after.isCheckmate()
    ? { type: 'mate', value: mover === 'w' ? 1 : -1 }
    : ctx.after.isDraw() || ctx.after.isStalemate()
      ? { type: 'cp', value: 0 }
      : (afterLine?.score ?? { type: 'cp', value: 0 })
  const scoreBest: Score = best?.score ?? scoreAfter
  const isBest = bestUci === uci
  const cls = classifyMove(scoreBest, scoreAfter, mover, isBest)

  const replyUci = afterLine?.pv[0]
  const reply = replyUci ? buildContext(ctx.fenAfter, replyUci) : null
  const bestCtx = bestUci && !isBest ? buildContext(fenBefore, bestUci) : null

  const findings: Finding[] = [
    ...moveFeatures(ctx, 'move'),
    ...hangingAfter(ctx, reply),
    ...(reply ? replyAttack(reply) : []),
    ...kingInCenterAfter(ctx, reply),
    ...(bestCtx ? moveFeatures(bestCtx, 'best') : []),
  ]
  if (scoreAfter.type === 'mate' && Math.sign(scoreAfter.value) === (mover === 'w' ? -1 : 1) && reply) {
    findings.push({ kind: 'reply_mate', subject: 'move', polarity: -1, weight: 12, squares: [reply.move.to], san: reply.move.san, count: Math.abs(scoreAfter.value) })
  }
  if (bestCtx && best?.score.type === 'mate' && Math.sign(best.score.value) === (mover === 'w' ? 1 : -1)) {
    findings.push({ kind: 'gives_mate', subject: 'best', polarity: 1, weight: 10, squares: [bestCtx.move.to], count: Math.abs(best.score.value) })
  }

  const sentences = composeText(cls.moveClass, findings, mover, {
    winAfter: cls.winAfter,
    bestSan: bestCtx?.move.san ?? null,
    bestLine: best ? uciLineToSan(fenBefore, best.pv, 4) : [],
    replyLine: afterLine ? uciLineToSan(ctx.fenAfter, afterLine.pv, 3) : [],
    mateIn: best?.score.type === 'mate' ? Math.abs(best.score.value) : null,
  })

  const used = new Set(findings) // alle Findings dürfen markiert werden; Pfeile nur für das Wesentliche
  const arrows: CoachArrow[] = []
  const highlights: MoveReview['highlights'] = {}
  if (bestCtx && cls.moveClass !== 'best' && cls.moveClass !== 'good') {
    arrows.push({ from: bestCtx.move.from, to: bestCtx.move.to, kind: 'best' })
  }
  const bad = isBad(cls.moveClass) || cls.moveClass === 'inaccuracy'
  if (reply && bad) arrows.push({ from: reply.move.from, to: reply.move.to, kind: 'threat' })
  for (const f of used) {
    if (f.subject !== 'move') continue
    if (f.kind === 'hanging_after' && f.square) highlights[f.square] = 'danger'
    if (f.kind === 'reply_attack') for (const t of f.targets ?? []) highlights[t.square] = 'danger'
    if (f.kind === 'king_in_center' && f.square && bad) highlights[f.square] = 'danger'
    if (f.kind === 'fork') for (const t of f.targets ?? []) highlights[t.square] = 'good'
  }

  return {
    fenBefore,
    fenAfter: ctx.fenAfter,
    mover,
    uci,
    san: ctx.move.san,
    moveClass: cls.moveClass,
    label: CLASS_LABEL[cls.moveClass],
    winLoss: cls.winLoss,
    scoreAfter,
    bestUci: bestUci ?? null,
    bestSan: bestCtx?.move.san ?? (isBest ? ctx.move.san : null),
    bestLineSan: best ? uciLineToSan(fenBefore, best.pv, 6) : [],
    replyLineSan: afterLine ? uciLineToSan(ctx.fenAfter, afterLine.pv, 6) : [],
    sentences,
    findings: sortByWeight(findings),
    arrows,
    highlights,
  }
}

interface TextExtras {
  winAfter: number
  bestSan: string | null
  bestLine: string[]
  replyLine: string[]
  mateIn: number | null
}

/** Wählt die wichtigsten Findings aus und formt daraus 1–3 Sätze. */
export function composeText(moveClass: MoveClass, findings: Finding[], mover: Color, x: TextExtras): string[] {
  const sorted = sortByWeight(findings)
  const own = sorted.filter((f) => f.subject === 'move')
  const negative = own.filter((f) => f.polarity < 0)
  const positive = own.filter((f) => f.polarity > 0)
  const bestReasons = sorted.filter((f) => f.subject === 'best' && f.polarity > 0)
  const out: string[] = []
  const weak = moveClass === 'inaccuracy' || isBad(moveClass)

  if (weak) {
    const attack = negative.find((f) => f.kind === 'reply_attack')
    const king = negative.find((f) => f.kind === 'king_in_center')
    const top = negative.slice(0, 2)
    if (attack && king && top.some((f) => f === attack || f === king)) {
      out.push(kingInCenterWithAttack(attack, mover))
      const other = negative.find((f) => f !== attack && f !== king && f.weight >= 3)
      if (other) out.push(describeMoveFinding(other, { mover }))
    } else if (top.length) {
      for (const f of top) {
        if (f !== top[0] && f.weight < 2) continue // Nebensächliches nicht aufzählen
        out.push(describeMoveFinding(f, { mover }))
      }
    } else {
      out.push(genericWorse(mover, x.replyLine, x.winAfter))
    }

    if (x.bestSan) {
      const reason = bestReasons.map(describeBestFinding).find((r): r is string => !!r)
      const best = showMove(x.bestSan, mover)
      if (reason) out.push(`Besser war ${best}: ${reason}.`)
      else if (x.mateIn) out.push(`Besser war ${best} – damit hättest du Matt in ${x.mateIn} gehabt.`)
      else {
        const idea = x.bestLine.slice(1, 3)
        out.push(`Besser war ${best}${idea.length ? ` (danach etwa ${idea.map((s, i) => showMove(s, i % 2 === 0 ? (mover === 'w' ? 'b' : 'w') : mover)).join(' ')})` : ''}.`)
      }
    }
    return out
  }

  // gute Züge: Lob mit Begründung, aber ehrlich – ein klarer Nachteil wird trotzdem erwähnt
  for (const f of positive.slice(0, 2)) out.push(describeMoveFinding(f, { mover }))
  if (out.length === 0) out.push(moveClass === 'best' ? 'Genau der Zug, den auch die Engine wählt.' : 'Solider Zug – die Stellung bleibt im Gleichgewicht.')
  const caveat = negative.find((f) => f.weight >= 1.5 && f.kind !== 'king_in_center')
  if (caveat && positive.length > 0) out.push(`Aber: ${describeMoveFinding(caveat, { mover })}`)
  return out
}
