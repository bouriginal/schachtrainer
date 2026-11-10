import { Chess } from 'chess.js'
import { material, opposite } from '../chess/board'
import type { Color, PlayedMove } from '../chess/game'

export type EndgameGoal = 'mate' | 'promote' | 'draw'

export interface Endgame {
  id: string
  category: string
  title: string
  /** Startstellung; am Zug ist immer DU */
  fen: string
  goal: EndgameGoal
  lesson: string
  hints: string[]
  /** nur bei goal "draw": so viele eigene Züge überstehen */
  surviveMoves?: number
}

export const GOAL_TEXT: Record<EndgameGoal, string> = {
  mate: 'Setze matt',
  promote: 'Wandle einen Bauern um und behalte die neue Figur',
  draw: 'Halte Remis',
}

export const playerColor = (e: Endgame): Color => e.fen.split(' ')[1] as Color

export type Verdict =
  | { state: 'running' }
  | { state: 'success'; text: string }
  | { state: 'failure'; text: string }

/**
 * Bewertet den Stand eines Endspiels nach jedem Halbzug.
 * `moves` = alle Züge seit der Startstellung (deine und die der Engine).
 */
export function judgeEndgame(e: Endgame, moves: readonly PlayedMove[]): Verdict {
  const me = playerColor(e)
  const them = opposite(me)
  const chess = new Chess(e.fen)
  for (const m of moves) chess.move(m.san)
  const myMoves = moves.filter((m) => m.color === me).length
  const last = moves.at(-1)

  if (chess.isCheckmate()) {
    return chess.turn() === them
      ? { state: 'success', text: 'Schachmatt – geschafft!' }
      : { state: 'failure', text: 'Du bist matt gesetzt worden.' }
  }
  const enemyPromoted = moves.some((m) => m.color === them && m.san.includes('='))

  if (e.goal === 'draw') {
    if (enemyPromoted) return { state: 'failure', text: 'Der Gegner hat einen Bauern umgewandelt – das ist verloren.' }
    if (chess.isDraw() || chess.isStalemate()) return { state: 'success', text: 'Remis – sauber verteidigt!' }
    if (myMoves >= (e.surviveMoves ?? 20) && last?.color === them) {
      return { state: 'success', text: `${e.surviveMoves ?? 20} Züge gehalten – die Stellung ist Remis. Gut verteidigt!` }
    }
    return { state: 'running' }
  }

  if (chess.isStalemate()) return { state: 'failure', text: 'Patt! Der Gegner hat keinen Zug mehr, steht aber nicht im Schach – das ist nur Remis.' }
  if (chess.isInsufficientMaterial()) {
    return { state: 'failure', text: 'Deine Figur ist verloren gegangen – mit so wenig Material kann niemand mehr mattsetzen. Remis.' }
  }
  if (chess.isDraw()) return { state: 'failure', text: 'Remis durch Zugwiederholung oder 50-Züge-Regel – der Gewinn ist weg.' }

  if (e.goal === 'promote') {
    const iPromoted = moves.findIndex((m) => m.color === me && m.san.includes('='))
    // erfolgreich, wenn die neue Figur nach der Gegnerantwort noch steht und du klar vorn bist
    if (iPromoted >= 0 && moves.length > iPromoted + 1 && material(chess, me) - material(chess, them) >= 5) {
      return { state: 'success', text: 'Umgewandelt und die neue Figur behalten – gewonnen!' }
    }
    const myPawns = chess.findPiece({ type: 'p', color: me }).length
    if (iPromoted < 0 && myPawns === 0) return { state: 'failure', text: 'Dein Bauer ist verloren gegangen.' }
  }
  return { state: 'running' }
}
