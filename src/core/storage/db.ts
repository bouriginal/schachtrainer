import Dexie, { type Table } from 'dexie'
import type { Color, PlayedMove, Result } from '../chess/game'
import type { MoveClass } from '../coach/classify'
import type { FindingKind } from '../coach/findings'
import type { Outcome, StudyCard } from '../openings/srs'
import type { GameAnalysis } from '../analysis/gameAnalysis'

/** Kurzfassung einer Coach-Bewertung – Grundlage für die Fehlerstatistik (Phase 5) */
export interface ReviewSummary {
  /** Index des Zugs in moves */
  ply: number
  san: string
  moveClass: MoveClass
  winLoss: number
  /** negative Heuristik-Befunde zum Zug */
  kinds: FindingKind[]
}

export interface StoredGame {
  id: string
  /** free = gegen Stockfish gespielt, import = per PGN importiert */
  mode: 'free' | 'import'
  createdAt: number
  updatedAt: number
  startFen: string
  moves: PlayedMove[]
  playerColor: Color
  level: number
  result: Result
  /** z. B. "Schachmatt", "Aufgegeben" */
  reason: string | null
  /** Coach-Bewertungen der eigenen Züge (optional, ab Phase 2) */
  reviews?: ReviewSummary[]
  /** PGN-Kopfzeilen (bei importierten Partien) */
  headers?: Record<string, string>
  /** vollständige Partieanalyse (Phase 5) */
  analysis?: GameAnalysis
}

/** Protokoll jeder Abfrage im Eröffnungstrainer – Grundlage für Statistik und Fehlermuster */
export interface OpeningLogEntry {
  id?: number
  repId: string
  key: string
  san: string
  outcome: Outcome
  /** im Fehlerfall: was du stattdessen gespielt hast (SAN) */
  played?: string
  at: number
}

/** Ein Versuch an einer Taktikaufgabe */
export interface PuzzleAttempt {
  id?: number
  puzzleId: string
  theme: string
  themes: string[]
  puzzleRating: number
  solved: boolean
  /** benutzte Hinweise (0 = ohne Hilfe) */
  hints: number
  at: number
}

/** Ergebnis eines Endspiel-Versuchs */
export interface EndgameResult {
  id?: number
  endgameId: string
  success: boolean
  /** eigene Züge bis zum Ende */
  moves: number
  at: number
}

export class TrainerDB extends Dexie {
  games!: Table<StoredGame, string>
  cards!: Table<StudyCard, string>
  openingLog!: Table<OpeningLogEntry, number>
  puzzleAttempts!: Table<PuzzleAttempt, number>
  endgameResults!: Table<EndgameResult, number>
  meta!: Table<{ key: string; value: unknown }, string>

  constructor(name = 'schachtrainer') {
    super(name)
    // Schema-Version 1. Bei Änderungen neue version() anhängen, nie bestehende ändern.
    this.version(1).stores({
      games: 'id, mode, updatedAt, result',
    })
    // Version 2 (Phase 3): Lernkarten und Übungsprotokoll des Eröffnungstrainers
    this.version(2).stores({
      cards: 'id, repId',
      openingLog: '++id, repId, at',
    })
    // Version 3 (Phase 4): Taktik, Endspiele, Einzelwerte (z. B. Taktik-Wertung)
    this.version(3).stores({
      puzzleAttempts: '++id, puzzleId, theme, at',
      endgameResults: '++id, endgameId, at',
      meta: 'key',
    })
  }
}

export interface GameRepository {
  save(game: StoredGame): Promise<void>
  get(id: string): Promise<StoredGame | undefined>
  /** zuletzt bearbeitete, noch nicht beendete Partie */
  latestUnfinished(mode: StoredGame['mode']): Promise<StoredGame | undefined>
  list(limit?: number): Promise<StoredGame[]>
  delete(id: string): Promise<void>
}

export function createGameRepository(db: TrainerDB): GameRepository {
  return {
    async save(game) {
      await db.games.put(game)
    },
    get: (id) => db.games.get(id),
    async latestUnfinished(mode) {
      const games = await db.games.orderBy('updatedAt').reverse().toArray()
      return games.find((g) => g.mode === mode && g.result === '*')
    },
    list: (limit = 50) => db.games.orderBy('updatedAt').reverse().limit(limit).toArray(),
    async delete(id) {
      await db.games.delete(id)
    },
  }
}

/** Repository, das nichts speichert – Fallback, wenn IndexedDB fehlt (z. B. privater Modus). */
export const memoryGameRepository = (): GameRepository => {
  const map = new Map<string, StoredGame>()
  return {
    async save(g) {
      map.set(g.id, structuredClone(g))
    },
    get: async (id) => map.get(id),
    latestUnfinished: async (mode) =>
      [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt).find((g) => g.mode === mode && g.result === '*'),
    list: async (limit = 50) => [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit),
    async delete(id) {
      map.delete(id)
    },
  }
}

export interface CardRepository {
  all(repId?: string): Promise<StudyCard[]>
  putMany(cards: StudyCard[]): Promise<void>
  log(entry: OpeningLogEntry): Promise<void>
  logs(repId?: string, limit?: number): Promise<OpeningLogEntry[]>
}

export function createCardRepository(db: TrainerDB): CardRepository {
  return {
    all: (repId) => (repId ? db.cards.where('repId').equals(repId).toArray() : db.cards.toArray()),
    async putMany(cards) {
      await db.cards.bulkPut(cards)
    },
    async log(entry) {
      await db.openingLog.add(entry)
    },
    async logs(repId, limit = 500) {
      const all = await db.openingLog.orderBy('at').reverse().limit(5000).toArray()
      return (repId ? all.filter((l) => l.repId === repId) : all).slice(0, limit)
    },
  }
}

export const memoryCardRepository = (): CardRepository => {
  const cards = new Map<string, StudyCard>()
  const logs: OpeningLogEntry[] = []
  return {
    all: async (repId) => [...cards.values()].filter((c) => !repId || c.repId === repId).map((c) => structuredClone(c)),
    async putMany(cs) {
      for (const c of cs) cards.set(c.id, structuredClone(c))
    },
    async log(e) {
      logs.push({ ...e, id: logs.length + 1 })
    },
    logs: async (repId, limit = 500) =>
      logs
        .filter((l) => !repId || l.repId === repId)
        .sort((a, b) => b.at - a.at)
        .slice(0, limit),
  }
}

export interface TrainingRepository {
  puzzleAttempts(): Promise<PuzzleAttempt[]>
  addPuzzleAttempt(a: PuzzleAttempt): Promise<void>
  endgameResults(): Promise<EndgameResult[]>
  addEndgameResult(r: EndgameResult): Promise<void>
  getMeta<T>(key: string): Promise<T | undefined>
  setMeta(key: string, value: unknown): Promise<void>
}

export function createTrainingRepository(db: TrainerDB): TrainingRepository {
  return {
    puzzleAttempts: () => db.puzzleAttempts.orderBy('at').toArray(),
    async addPuzzleAttempt(a) {
      await db.puzzleAttempts.add(a)
    },
    endgameResults: () => db.endgameResults.orderBy('at').toArray(),
    async addEndgameResult(r) {
      await db.endgameResults.add(r)
    },
    getMeta: async <T,>(key: string) => (await db.meta.get(key))?.value as T | undefined,
    async setMeta(key, value) {
      await db.meta.put({ key, value })
    },
  }
}

export const memoryTrainingRepository = (): TrainingRepository => {
  const attempts: PuzzleAttempt[] = []
  const results: EndgameResult[] = []
  const meta = new Map<string, unknown>()
  return {
    puzzleAttempts: async () => [...attempts].sort((a, b) => a.at - b.at),
    async addPuzzleAttempt(a) {
      attempts.push({ ...a, id: attempts.length + 1 })
    },
    endgameResults: async () => [...results].sort((a, b) => a.at - b.at),
    async addEndgameResult(r) {
      results.push({ ...r, id: results.length + 1 })
    },
    getMeta: async <T,>(key: string) => meta.get(key) as T | undefined,
    async setMeta(key, value) {
      meta.set(key, value)
    },
  }
}
