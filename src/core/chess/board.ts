import { Chess, SQUARES, type PieceSymbol, type Square } from 'chess.js'
import type { Color } from './game'

/** Figurenwerte in Bauerneinheiten (König bewusst 0 – er wird gesondert behandelt). */
export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'Bauer',
  n: 'Springer',
  b: 'Läufer',
  r: 'Turm',
  q: 'Dame',
  k: 'König',
}

/** Akkusativ mit Artikel: "den Springer", "die Dame" */
export const PIECE_ACC: Record<PieceSymbol, string> = {
  p: 'den Bauern',
  n: 'den Springer',
  b: 'den Läufer',
  r: 'den Turm',
  q: 'die Dame',
  k: 'den König',
}

export const opposite = (c: Color): Color => (c === 'w' ? 'b' : 'w')
export const sideName = (c: Color) => (c === 'w' ? 'Weiß' : 'Schwarz')

export interface PlacedPiece {
  square: Square
  type: PieceSymbol
  color: Color
}

export function piecesOf(chess: Chess, color?: Color): PlacedPiece[] {
  const out: PlacedPiece[] = []
  for (const row of chess.board()) {
    for (const p of row) if (p && (!color || p.color === color)) out.push({ square: p.square, type: p.type, color: p.color })
  }
  return out
}

export function material(chess: Chess, color: Color): number {
  return piecesOf(chess, color).reduce((s, p) => s + PIECE_VALUE[p.type], 0)
}

/** Materialbilanz aus Sicht von `color` (eigenes minus gegnerisches Material) */
export function materialBalance(chess: Chess, color: Color): number {
  return material(chess, color) - material(chess, opposite(color))
}

/** Felder, die die Figur auf `from` angreift (inkl. Felder mit eigenen Figuren = Deckung). */
export function attackedSquares(chess: Chess, from: Square): Square[] {
  const piece = chess.get(from)
  if (!piece) return []
  return SQUARES.filter((sq) => sq !== from && chess.attackers(sq, piece.color).includes(from))
}

export interface Exposure {
  square: Square
  type: PieceSymbol
  color: Color
  attackers: Square[]
  defenders: Square[]
  /** grob geschätzter Materialverlust in Bauerneinheiten, wenn der Gegner schlägt */
  expectedLoss: number
}

/**
 * Prüft, ob eine Figur "hängt": angegriffen und entweder ungedeckt oder von einer
 * billigeren Figur angegriffen. Bewusst einfache Abschätzung (kein vollständiger
 * Abtauschtest) – für Erklärungen auf Einsteigerniveau reicht das, und die Engine
 * bestätigt das Ergebnis in explain.ts.
 */
export function exposure(chess: Chess, square: Square): Exposure | null {
  const piece = chess.get(square)
  if (!piece || piece.type === 'k') return null
  const enemy = opposite(piece.color)
  const attackers = chess.attackers(square, enemy)
  if (attackers.length === 0) return null
  const defenders = chess.attackers(square, piece.color)
  const value = PIECE_VALUE[piece.type]
  const cheapest = Math.min(...attackers.map((a) => PIECE_VALUE[chess.get(a)!.type] || 100))
  let expectedLoss = 0
  if (defenders.length === 0) expectedLoss = value
  else if (cheapest < value) expectedLoss = value - cheapest
  if (expectedLoss <= 0) return null
  return { square, type: piece.type, color: piece.color, attackers, defenders, expectedLoss }
}

/** Alle hängenden Figuren einer Farbe, wertvollste zuerst */
export function exposedPieces(chess: Chess, color: Color): Exposure[] {
  return piecesOf(chess, color)
    .map((p) => exposure(chess, p.square))
    .filter((e): e is Exposure => e !== null)
    .sort((a, b) => b.expectedLoss - a.expectedLoss)
}

/** Chess-Objekt mit gewechseltem Zugrecht ("Nullzug"), um Drohungen zu finden. */
export function withTurn(fen: string, color: Color): Chess | null {
  const parts = fen.split(' ')
  if (parts[1] === color) return new Chess(fen)
  parts[1] = color
  parts[3] = '-' // en passant ist nach einem Nullzug nicht möglich
  try {
    const c = new Chess(parts.join(' '))
    return c
  } catch {
    return null // z. B. wenn der Gegner dann im Schach stünde
  }
}

export const fileOf = (sq: string) => sq.charCodeAt(0) - 97
export const rankOf = (sq: string) => Number(sq[1])
export const fullmoveOf = (fen: string) => Number(fen.split(' ')[5] ?? 1)

/** Ist die Linie (a–h) frei von Bauern? halb offen = keine eigenen Bauern. */
export function fileState(chess: Chess, file: number, color: Color): 'open' | 'half-open' | 'closed' {
  let own = false
  let enemy = false
  for (let r = 1; r <= 8; r++) {
    const p = chess.get(`${String.fromCharCode(97 + file)}${r}` as Square)
    if (p?.type === 'p') {
      if (p.color === color) own = true
      else enemy = true
    }
  }
  if (!own && !enemy) return 'open'
  if (!own) return 'half-open'
  return 'closed'
}

export { germanSan } from './notation'

/** Wandelt eine UCI-Zugfolge ab `fen` in SAN um (bricht bei illegalem Zug ab). */
export function uciLineToSan(fen: string, ucis: readonly string[], max = ucis.length): string[] {
  const chess = new Chess(fen)
  const out: string[] = []
  for (const u of ucis.slice(0, max)) {
    try {
      out.push(chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san)
    } catch {
      break
    }
  }
  return out
}
