import { Chess } from 'chess.js'

export type MoveEvent = 'move' | 'capture' | 'check' | 'castle' | 'promote' | 'mate'

const board = (fen: string) => fen.split(' ')[0]

/**
 * Welche Art Zug führt von `prev` nach `next`? Für Zuggeräusche.
 * Gibt null zurück, wenn die Stellungen nicht genau einen legalen Zug auseinanderliegen
 * (z. B. neue Partie, Zurücknehmen mehrerer Züge, Sprung in der Analyse).
 */
export function detectMoveEvent(prev: string, next: string): MoveEvent | null {
  if (prev === next) return null
  let chess: Chess
  try {
    chess = new Chess(prev)
  } catch {
    return null
  }
  const target = board(next)
  for (const m of chess.moves({ verbose: true })) {
    if (board(m.after) !== target) continue
    const after = new Chess(m.after)
    if (after.isCheckmate()) return 'mate'
    if (after.inCheck()) return 'check'
    if (m.isKingsideCastle() || m.isQueensideCastle()) return 'castle'
    if (m.isPromotion()) return 'promote'
    if (m.isCapture()) return 'capture'
    return 'move'
  }
  return null
}
