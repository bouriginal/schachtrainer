import type { Square } from 'chess.js'
import { PIECE_NAME, sideName } from '../chess/board'
import type { AnalysisResult } from '../engine/types'
import { buildContext } from './context'
import { moveFeatures } from './explain'
import { sortByWeight, type Finding } from './findings'
import { suggestPlans } from './plans'
import { describePurpose, showMove } from './text/de'
import { threatsAgainst } from './threats'

/**
 * Gestufte Hinweise für deinen nächsten Zug – erst die Richtung, dann die Figur, dann der Zug.
 * So denkst du selbst nach, statt sofort die Lösung zu sehen.
 */
export interface Hint {
  level: 1 | 2 | 3
  title: string
  text: string
  /** Feld, das markiert wird (Stufe 2) */
  square?: Square
  /** Pfeil für den empfohlenen Zug (Stufe 3) */
  arrow?: { from: Square; to: Square }
}

const ACC: Record<string, string> = { p: 'deinem Bauern', n: 'deinem Springer', b: 'deinem Läufer', r: 'deinem Turm', q: 'deiner Dame', k: 'deinem König' }
const NOM: Record<string, string> = { p: 'Dein Bauer', n: 'Dein Springer', b: 'Dein Läufer', r: 'Dein Turm', q: 'Deine Dame', k: 'Dein König' }

/** Stufe 1: worum geht es in dieser Stellung? */
function direction(fen: string, best: Finding[], mateIn: number | null, check: boolean): { title: string; text: string } {
  const me = fen.split(' ')[1] as 'w' | 'b'
  const threats = threatsAgainst(fen, me)
  const has = (k: Finding['kind']) => best.find((f) => f.kind === k)

  if (mateIn) return { title: 'Es gibt ein Matt!', text: `Du kannst forciert mattsetzen (Matt in ${mateIn}). Prüfe zuerst alle Schachgebote.` }
  if (threats.mateIn1) {
    return { title: 'Achtung, Mattdrohung!', text: `${sideName(me === 'w' ? 'b' : 'w')} droht Matt. Finde einen Zug, der das verhindert.` }
  }
  if (has('wins_material')) return { title: 'Material gewinnen', text: 'Eine gegnerische Figur ist nicht ausreichend gedeckt. Welche kannst du sicher schlagen?' }
  if (has('fork')) return { title: 'Doppelangriff', text: 'Suche ein Feld, von dem aus eine deiner Figuren zwei Ziele gleichzeitig angreift.' }
  const danger = threats.hanging[0]
  if (danger && (has('saves_piece') || has('removes_attacker'))) {
    return { title: 'Eine Figur ist in Gefahr', text: `${NOM[danger.type]} auf ${danger.square} wird angegriffen und ist nicht ausreichend gedeckt. Kümmere dich zuerst darum.` }
  }
  if (check) return { title: 'Ein Schach hilft', text: 'Ein Schachgebot bringt dich hier weiter. Welches Schach ist wirklich unangenehm für den Gegner?' }
  if (has('castled')) return { title: 'König in Sicherheit', text: 'Dein König steht noch in der Mitte. Wie bringst du ihn schnell in Sicherheit?' }
  if (has('develops')) return { title: 'Entwicklung', text: 'Eine deiner Leichtfiguren steht noch auf ihrem Startfeld. Bring sie ins Spiel – Richtung Zentrum.' }
  if (has('center_pawn')) return { title: 'Zentrum', text: 'Kämpfe um die Mitte: Ein Bauer im Zentrum gibt deinen Figuren Platz.' }
  const plan = suggestPlans(fen, me, 1)[0]
  return plan ? { title: plan.title, text: plan.why } : { title: 'Verbessere deine Stellung', text: 'Welche deiner Figuren steht am schlechtesten? Finde ihr ein besseres Feld.' }
}

export function buildHints(fen: string, analysis: AnalysisResult): Hint[] {
  const line = analysis.lines[0]
  const bestUci = line?.pv[0] ?? analysis.bestMove
  if (!bestUci) return []
  const ctx = buildContext(fen, bestUci)
  if (!ctx) return []
  const me = ctx.mover
  const features = sortByWeight(moveFeatures(ctx, 'best'))
  const mateIn = line?.score.type === 'mate' && Math.sign(line.score.value) === (me === 'w' ? 1 : -1) ? Math.abs(line.score.value) : null
  const d = direction(fen, features, mateIn, ctx.move.san.includes('+'))
  const reason = features.map(describePurpose).find((r): r is string => !!r)
  const san = showMove(ctx.move.san, me)
  return [
    { level: 1, title: d.title, text: d.text },
    {
      level: 2,
      title: `Mit ${ACC[ctx.move.piece]} geht es los`,
      text: `Die beste Idee beginnt mit ${ACC[ctx.move.piece]} auf ${ctx.move.from}. Wohin sollte ${PIECE_NAME[ctx.move.piece] === 'Dame' ? 'sie' : 'er'} ziehen?`,
      square: ctx.move.from,
    },
    {
      level: 3,
      title: `Lösung: ${san}`,
      text: reason ? `${san} ${reason}.` : `${san} ist laut Engine der stärkste Zug.`,
      arrow: { from: ctx.move.from, to: ctx.move.to },
    },
  ]
}
