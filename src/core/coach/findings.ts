import type { PieceSymbol, Square } from 'chess.js'

/**
 * Ergebnis einer Heuristik – rein strukturiert, ohne Text. Die Formulierung
 * übernimmt text/de.ts, die Auswahl explain.ts.
 */
export type FindingKind =
  // Material & Taktik
  | 'hanging_after' // eigene Figur hängt nach dem Zug
  | 'reply_attack' // die beste Gegnerantwort greift mehrere Ziele an
  | 'reply_mate' // der Gegner kann danach mattsetzen
  | 'wins_material' // Zug gewinnt Material (Schlagen einer hängenden Figur)
  | 'fork' // Zug greift zwei wertvolle Ziele gleichzeitig an
  | 'gives_mate' // Zug setzt matt / führt forciert zum Matt
  | 'removes_attacker' // schlägt die Figur, die eine eigene bedrohte
  | 'saves_piece' // bringt eine bedrohte eigene Figur in Sicherheit
  // Königssicherheit
  | 'castled'
  | 'lost_castling'
  | 'king_in_center'
  | 'pawn_shield'
  // Entwicklung & Zentrum
  | 'develops'
  | 'early_queen'
  | 'moved_twice'
  | 'center_pawn'
  | 'flank_pawn'
  // Bauernstruktur
  | 'doubled_pawns'
  | 'isolated_pawn'
  | 'passed_pawn'

/** Worauf bezieht sich das Finding? Den gespielten Zug, den besten Zug oder die Gegnerantwort. */
export type FindingSubject = 'move' | 'best'

export interface Target {
  square: Square
  type: PieceSymbol
}

export interface Finding {
  kind: FindingKind
  subject: FindingSubject
  /** +1 gut für den Ziehenden, −1 schlecht */
  polarity: 1 | -1
  /** Wichtigkeit für die Auswahl (höher = wichtiger) */
  weight: number
  /** zu markierende Felder */
  squares: Square[]
  /** Daten für die Formulierung */
  piece?: PieceSymbol
  square?: Square
  /** SAN (englisch) des relevanten Zugs, z. B. Gegnerantwort oder bester Zug */
  san?: string
  targets?: Target[]
  /** Materialwert in Bauerneinheiten */
  value?: number
  /** z. B. Matt in n */
  count?: number
  /** Figur hing schon vor dem Zug */
  wasBefore?: boolean
  /** Rochade kurz/lang */
  side?: 'king' | 'queen'
}

export const sortByWeight = (fs: Finding[]) => [...fs].sort((a, b) => b.weight - a.weight)
