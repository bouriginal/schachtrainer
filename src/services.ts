import { createWorkerTransport, StockfishEngine } from './core/engine/StockfishEngine'
import type { EngineClient } from './core/engine/types'
import {
  createCardRepository,
  createGameRepository,
  createTrainingRepository,
  memoryCardRepository,
  memoryGameRepository,
  memoryTrainingRepository,
  TrainerDB,
  type CardRepository,
  type GameRepository,
  type TrainingRepository,
} from './core/storage/db'

/** App-weite Einzelinstanzen. Nur hier wird Browser-Infrastruktur (Worker, IndexedDB) erzeugt. */
let engine: EngineClient | null = null
let repo: GameRepository | null = null
let cardRepo: CardRepository | null = null
let trainingRepo: TrainingRepository | null = null
let db: TrainerDB | null = null

const hasIdb = () => typeof indexedDB !== 'undefined'
const getDb = () => (db ??= new TrainerDB())

/** Direkter DB-Zugriff (nur für Backup/Import) */
export const getDatabase = getDb

export function getEngine(): EngineClient {
  engine ??= new StockfishEngine(createWorkerTransport())
  return engine
}

export function getGameRepository(): GameRepository {
  if (!repo) {
    repo = hasIdb() ? createGameRepository(getDb()) : memoryGameRepository()
  }
  return repo
}

export function getCardRepository(): CardRepository {
  cardRepo ??= hasIdb() ? createCardRepository(getDb()) : memoryCardRepository()
  return cardRepo
}

export function getTrainingRepository(): TrainingRepository {
  trainingRepo ??= hasIdb() ? createTrainingRepository(getDb()) : memoryTrainingRepository()
  return trainingRepo
}
