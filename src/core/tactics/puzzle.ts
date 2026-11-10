import { Chess } from 'chess.js'
import { applyUci, type Color, type PlayedMove } from '../chess/game'

/** Eine Aufgabe aus dem Lichess-Auszug. moves[0] ist der Gegnerzug, danach abwechselnd die Lösung. */
export interface Puzzle {
  id: string
  fen: string
  moves: string
  rating: number
  /** Hauptmotiv, nach dem die Aufgabe ausgewählt wurde */
  theme: string
  themes: string[]
}

export interface PuzzleState {
  puzzle: Puzzle
  solution: string[]
  /** Index des nächsten erwarteten Zugs in `solution` */
  index: number
  played: PlayedMove[]
  /** Farbe, die du spielst */
  color: Color
  fen: string
  status: 'playing' | 'solved'
  /** Fehler in dieser Aufgabe (bereits einer = nicht gelöst) */
  mistakes: number
}

/** Startet eine Aufgabe: der erste Zug (des Gegners) wird ausgeführt. */
export function startPuzzle(puzzle: Puzzle): PuzzleState {
  const [first, ...rest] = puzzle.moves.split(' ')
  const m = applyUci(puzzle.fen, first)
  if (!m) throw new Error(`Puzzle ${puzzle.id}: erster Zug illegal`)
  return {
    puzzle,
    solution: rest,
    index: 0,
    played: [m],
    color: m.color === 'w' ? 'b' : 'w',
    fen: m.fenAfter,
    status: 'playing',
    mistakes: 0,
  }
}

export const expectedMove = (s: PuzzleState) => (s.status === 'playing' ? s.solution[s.index] : null)

export type PuzzleCheck =
  | { result: 'correct'; state: PuzzleState; reply: PlayedMove | null }
  | { result: 'wrong'; state: PuzzleState; expected: string }
  | { result: 'illegal' }

/**
 * Prüft deinen Zug. Richtig ist der Lösungszug – oder irgendein Zug, der sofort mattsetzt
 * (wie bei Lichess). Bei Erfolg wird die Gegnerantwort gleich mit ausgeführt.
 */
export function playPuzzleMove(s: PuzzleState, uci: string): PuzzleCheck {
  const expected = expectedMove(s)
  if (!expected) return { result: 'illegal' }
  const mine = applyUci(s.fen, uci.length === 4 && expected.length === 5 && expected.startsWith(uci) ? expected : uci)
  if (!mine) return { result: 'illegal' }
  const mates = new Chess(mine.fenAfter).isCheckmate()
  if (mine.uci !== expected && !mates) {
    return { result: 'wrong', state: { ...s, mistakes: s.mistakes + 1 }, expected }
  }
  let next: PuzzleState = { ...s, played: [...s.played, mine], fen: mine.fenAfter, index: s.index + 1 }
  if (mates || next.index >= s.solution.length) return { result: 'correct', state: { ...next, status: 'solved' }, reply: null }
  const reply = applyUci(next.fen, s.solution[next.index])!
  next = { ...next, played: [...next.played, reply], fen: reply.fenAfter, index: next.index + 1 }
  if (next.index >= s.solution.length) next = { ...next, status: 'solved' }
  return { result: 'correct', state: next, reply }
}

/** Eigene Taktik-Wertung (Elo-artig): steigt bei gelösten, fällt bei verpatzten Aufgaben. */
export const START_RATING = 600

export function updateRating(rating: number, puzzleRating: number, solved: boolean, k = 32): number {
  const expected = 1 / (1 + 10 ** ((puzzleRating - rating) / 400))
  return Math.round(Math.max(200, rating + k * ((solved ? 1 : 0) - expected)))
}

export type Difficulty = 'auto' | 'leicht' | 'mittel' | 'schwer'
export const DIFFICULTY_RANGE: Record<Exclude<Difficulty, 'auto'>, [number, number]> = {
  leicht: [400, 899],
  mittel: [900, 1199],
  schwer: [1200, 1600],
}

/**
 * Wählt die nächste Aufgabe: passendes Motiv, passende Schwierigkeit (bei "auto" um deine
 * Wertung herum), bevorzugt noch nicht gesehene, danach früher verpatzte Aufgaben.
 */
export function pickPuzzle(
  all: readonly Puzzle[],
  opts: { theme: string | null; difficulty: Difficulty; rating: number; seen: ReadonlyMap<string, boolean>; exclude?: string },
  rng: () => number = Math.random,
): Puzzle | null {
  const byTheme = all.filter((p) => p.id !== opts.exclude && (!opts.theme || p.themes.includes(opts.theme)))
  if (byTheme.length === 0) return null
  const inRange = (p: Puzzle, [lo, hi]: [number, number]) => p.rating >= lo && p.rating <= hi
  let pool: Puzzle[]
  if (opts.difficulty === 'auto') {
    pool = []
    for (const width of [150, 300, 600, 2000]) {
      pool = byTheme.filter((p) => inRange(p, [opts.rating - width, opts.rating + width]))
      if (pool.filter((p) => !opts.seen.has(p.id)).length >= 3) break
    }
  } else {
    const range = DIFFICULTY_RANGE[opts.difficulty]
    pool = byTheme.filter((p) => inRange(p, range))
  }
  if (pool.length === 0) pool = byTheme
  const fresh = pool.filter((p) => !opts.seen.has(p.id))
  const failed = pool.filter((p) => opts.seen.get(p.id) === false)
  const choice = fresh.length ? fresh : failed.length ? failed : pool
  return choice[Math.floor(rng() * choice.length)]
}
