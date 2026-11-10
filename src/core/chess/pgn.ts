import { Chess } from 'chess.js'
import { START_FEN, type PlayedMove, type Result } from './game'

export interface ParsedGame {
  headers: Record<string, string>
  startFen: string
  moves: PlayedMove[]
  result: Result
}

const RESULTS: Result[] = ['1-0', '0-1', '1/2-1/2', '*']

/**
 * Liest eine oder mehrere Partien aus PGN-Text (z. B. Export von Lichess oder Chess.com).
 * Kommentare, Varianten und Uhrzeiten werden ignoriert. Wirft mit deutscher Meldung bei Fehlern.
 */
export function parsePgn(text: string): ParsedGame[] {
  const cleaned = text.replace(/\r\n?/g, '\n').trim()
  if (!cleaned) throw new Error('Der PGN-Text ist leer.')
  // Partien trennen: jede beginnt mit einem Kopfzeilenblock "[Event ...]"
  const chunks = cleaned.split(/\n\s*\n(?=\[)/).filter((c) => c.trim())
  const games: ParsedGame[] = []
  chunks.forEach((chunk, i) => {
    const chess = new Chess()
    try {
      chess.loadPgn(chunk, { strict: false })
    } catch (e) {
      throw new Error(`Partie ${i + 1} konnte nicht gelesen werden: ${e instanceof Error ? e.message : 'unbekannter Fehler'}`)
    }
    const headers = Object.fromEntries(Object.entries(chess.getHeaders()).filter(([, v]) => v != null)) as Record<string, string>
    const startFen = headers.FEN ?? START_FEN
    const replay = new Chess(startFen)
    const moves: PlayedMove[] = chess.history({ verbose: true }).map((m) => {
      replay.move(m.san)
      return { san: m.san, uci: m.from + m.to + (m.promotion ?? ''), color: m.color, from: m.from, to: m.to, fenAfter: replay.fen() }
    })
    if (moves.length === 0) throw new Error(`Partie ${i + 1} enthält keine Züge.`)
    const result = (RESULTS.includes(headers.Result as Result) ? headers.Result : '*') as Result
    games.push({ headers, startFen, moves, result })
  })
  return games
}

/** Kurzer Titel, z. B. "Max – Stockfish, 2026.11.10" */
export function gameTitle(headers: Record<string, string>): string {
  const w = headers.White && headers.White !== '?' ? headers.White : 'Weiß'
  const b = headers.Black && headers.Black !== '?' ? headers.Black : 'Schwarz'
  const d = headers.Date && !headers.Date.startsWith('?') ? `, ${headers.Date}` : ''
  return `${w} – ${b}${d}`
}
