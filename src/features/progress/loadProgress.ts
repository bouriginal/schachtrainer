import type { Endgame } from '../../core/endgames/endgame'
import {
  buildSuggestions,
  gameStats,
  openingStats,
  recurringMistakes,
  tacticsStats,
  type GameStats,
  type MistakePattern,
  type OpeningStats,
  type Suggestion,
  type TacticsStats,
} from '../../core/progress/progress'
import type { EndgameResult } from '../../core/storage/db'
import endgameData from '../../data/endgames.json'
import { getRepertoires } from '../../data/openings'
import { getCardRepository, getGameRepository, getTrainingRepository } from '../../services'

export const ENDGAMES = endgameData.endgames as Endgame[]

export interface ProgressData {
  games: GameStats
  patterns: MistakePattern[]
  openings: OpeningStats[]
  tactics: TacticsStats
  endgameResults: EndgameResult[]
  suggestions: Suggestion[]
}

/** Lädt alle gespeicherten Daten und berechnet Statistik, Muster und Vorschläge */
export async function loadProgress(): Promise<ProgressData> {
  const [games, cards, logs, attempts, endgameResults] = await Promise.all([
    getGameRepository().list(300),
    getCardRepository().all(),
    getCardRepository().logs(undefined, 2000),
    getTrainingRepository().puzzleAttempts(),
    getTrainingRepository().endgameResults(),
  ])
  const now = new Date()
  const cardMap = new Map(cards.map((c) => [c.id, c]))
  const openings = getRepertoires().map((r) => openingStats(r, cardMap, logs, now))
  const tactics = tacticsStats(attempts)
  const patterns = recurringMistakes(games)
  return {
    games: gameStats(games),
    patterns,
    openings,
    tactics,
    endgameResults,
    suggestions: buildSuggestions({ games, openings, tactics, endgames: ENDGAMES, endgameResults, patterns }),
  }
}

