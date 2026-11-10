import { Chess, DEFAULT_POSITION, type Square } from 'chess.js'

export type Color = 'w' | 'b'
export type Result = '1-0' | '0-1' | '1/2-1/2' | '*'

export interface PlayedMove {
  san: string
  uci: string
  color: Color
  from: Square
  to: Square
  fenAfter: string
}

export interface GameStatus {
  over: boolean
  result: Result
  /** deutscher Grund, z. B. "Schachmatt" */
  reason: string | null
  inCheck: boolean
  turn: Color
}

export const START_FEN = DEFAULT_POSITION

/** Zerlegt "e7e8q" in Bestandteile. */
export function parseUci(uci: string): { from: Square; to: Square; promotion?: string } {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.length > 4 ? uci[4] : undefined,
  }
}

/**
 * Führt einen Zug auf einer Position aus. Gibt `null` zurück, wenn er illegal ist.
 * Wirft nie (chess.js wirft bei illegalen Zügen – das fangen wir hier ab).
 */
export function applyMove(fen: string, from: string, to: string, promotion?: string): PlayedMove | null {
  const chess = new Chess(fen)
  try {
    const m = chess.move({ from, to, promotion })
    return {
      san: m.san,
      uci: m.from + m.to + (m.promotion ?? ''),
      color: m.color,
      from: m.from,
      to: m.to,
      fenAfter: chess.fen(),
    }
  } catch {
    return null
  }
}

export function applyUci(fen: string, uci: string): PlayedMove | null {
  const { from, to, promotion } = parseUci(uci)
  return applyMove(fen, from, to, promotion)
}

/** Braucht der Zug von `from` nach `to` eine Umwandlungsfigur? */
export function isPromotionMove(fen: string, from: string, to: string): boolean {
  const chess = new Chess(fen)
  return chess
    .moves({ square: from as Square, verbose: true })
    .some((m) => m.to === to && m.promotion !== undefined)
}

export function legalTargets(fen: string, from: string): Square[] {
  const chess = new Chess(fen)
  return [...new Set(chess.moves({ square: from as Square, verbose: true }).map((m) => m.to))]
}

/** Liest Zugreihenfolge und Endergebnis aus einer Position (inkl. Remis durch Wiederholung). */
export function getStatus(startFen: string, moves: readonly PlayedMove[]): GameStatus {
  const chess = new Chess(startFen)
  for (const m of moves) chess.move(m.san)
  const turn = chess.turn()
  const inCheck = chess.inCheck()
  if (chess.isCheckmate()) {
    return { over: true, result: turn === 'w' ? '0-1' : '1-0', reason: 'Schachmatt', inCheck, turn }
  }
  const draw = (reason: string): GameStatus => ({ over: true, result: '1/2-1/2', reason, inCheck, turn })
  if (chess.isStalemate()) return draw('Patt')
  if (chess.isInsufficientMaterial()) return draw('Ungenügendes Material')
  if (chess.isThreefoldRepetition()) return draw('Dreifache Stellungswiederholung')
  if (chess.isDrawByFiftyMoves()) return draw('50-Züge-Regel')
  return { over: false, result: '*', reason: null, inCheck, turn }
}

/** Feld des Königs der Seite am Zug, z. B. für die Schach-Markierung. */
export function kingSquare(fen: string, color: Color): Square | null {
  return new Chess(fen).findPiece({ type: 'k', color })[0] ?? null
}

export interface PgnHeaders {
  white?: string
  black?: string
  result?: Result
  date?: Date
  event?: string
}

export function toPgn(startFen: string, moves: readonly PlayedMove[], headers: PgnHeaders = {}): string {
  const chess = new Chess(startFen)
  const d = headers.date ?? new Date()
  chess.setHeader('Event', headers.event ?? 'Schachtrainer')
  chess.setHeader('Date', `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`)
  chess.setHeader('White', headers.white ?? '?')
  chess.setHeader('Black', headers.black ?? '?')
  if (startFen !== START_FEN) {
    chess.setHeader('SetUp', '1')
    chess.setHeader('FEN', startFen)
  }
  for (const m of moves) chess.move(m.san)
  chess.setHeader('Result', headers.result ?? '*')
  return chess.pgn()
}
