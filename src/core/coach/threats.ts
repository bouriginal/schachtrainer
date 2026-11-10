import { Chess, type Square } from 'chess.js'
import { exposedPieces, opposite, withTurn, type Exposure } from '../chess/board'
import type { Color } from '../chess/game'

export interface Threats {
  /** Zug (SAN), mit dem der Gegner sofort mattsetzen könnte, wenn du jetzt "passt" */
  mateIn1: { san: string; from: Square; to: Square } | null
  /** deine Figuren, die angegriffen und nicht ausreichend gedeckt sind (wertvollste zuerst) */
  hanging: Exposure[]
}

/**
 * Was droht dir? Nullzug-Analyse: Wir tun so, als wäre der Gegner noch einmal am Zug.
 * Bewusst einfach – für Hinweise und Pläne auf Einsteigerniveau.
 */
export function threatsAgainst(fen: string, me: Color): Threats {
  const chess = new Chess(fen)
  const hanging = exposedPieces(chess, me).filter((e) => e.expectedLoss >= 1)
  let mateIn1: Threats['mateIn1'] = null
  const passed = withTurn(fen, opposite(me))
  if (passed && !chess.inCheck()) {
    for (const m of passed.moves({ verbose: true })) {
      if (!m.san.endsWith('#')) continue
      mateIn1 = { san: m.san, from: m.from, to: m.to }
      break
    }
  }
  return { mateIn1, hanging }
}
