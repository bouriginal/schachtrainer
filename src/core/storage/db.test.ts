import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { START_FEN } from '../chess/game'
import { introduceCard } from '../openings/srs'
import {
  createCardRepository,
  createGameRepository,
  createTrainingRepository,
  memoryCardRepository,
  memoryGameRepository,
  memoryTrainingRepository,
  TrainerDB,
  type StoredGame,
} from './db'

const game = (id: string, updatedAt: number, result: StoredGame['result'] = '*'): StoredGame => ({
  id,
  mode: 'free',
  createdAt: 0,
  updatedAt,
  startFen: START_FEN,
  moves: [],
  playerColor: 'w',
  level: 2,
  result,
  reason: null,
})

for (const [name, make] of [
  ['IndexedDB', () => createGameRepository(new TrainerDB(`test-${Math.random()}`))],
  ['Speicher', memoryGameRepository],
] as const) {
  describe(`GameRepository (${name})`, () => {
    it('speichert und lädt Partien', async () => {
      const repo = make()
      await repo.save(game('a', 1))
      expect((await repo.get('a'))?.level).toBe(2)
    })
    it('findet die zuletzt bearbeitete unbeendete Partie', async () => {
      const repo = make()
      await repo.save(game('alt', 1))
      await repo.save(game('neu', 3))
      await repo.save(game('fertig', 5, '1-0'))
      expect((await repo.latestUnfinished('free'))?.id).toBe('neu')
    })
    it('listet neueste zuerst', async () => {
      const repo = make()
      await repo.save(game('a', 1))
      await repo.save(game('b', 2))
      expect((await repo.list()).map((g) => g.id)).toEqual(['b', 'a'])
    })
  })
}

for (const [name, make] of [
  ['IndexedDB', () => createCardRepository(new TrainerDB(`cards-${Math.random()}`))],
  ['Speicher', memoryCardRepository],
] as const) {
  describe(`CardRepository (${name})`, () => {
    it('speichert Karten samt Datum und filtert nach Repertoire', async () => {
      const repo = make()
      const now = new Date('2026-11-10T10:00:00Z')
      await repo.putMany([introduceCard('a|k1', 'a', 'k1', 'd4', now), introduceCard('b|k1', 'b', 'k1', 'e4', now)])
      const a = await repo.all('a')
      expect(a.map((c) => c.id)).toEqual(['a|k1'])
      expect(a[0].fsrs.due).toBeInstanceOf(Date)
      expect((await repo.all()).length).toBe(2)
    })
    it('protokolliert Abfragen, neueste zuerst', async () => {
      const repo = make()
      await repo.log({ repId: 'a', key: 'k', san: 'd4', outcome: 'correct', at: 1 })
      await repo.log({ repId: 'a', key: 'k', san: 'd4', outcome: 'wrong', played: 'e4', at: 2 })
      await repo.log({ repId: 'b', key: 'k', san: 'e4', outcome: 'correct', at: 3 })
      expect((await repo.logs('a')).map((l) => l.outcome)).toEqual(['wrong', 'correct'])
    })
  })
}

it('übernimmt Partien aus Schema-Version 1 beim Upgrade auf Version 2', async () => {
  const name = `upgrade-${Math.random()}`
  const v1 = new (await import('dexie')).default(name)
  v1.version(1).stores({ games: 'id, mode, updatedAt, result' })
  await v1.table('games').put(game('alt', 1))
  v1.close()
  const repo = createGameRepository(new TrainerDB(name))
  expect((await repo.get('alt'))?.id).toBe('alt')
})

for (const [name, make] of [
  ['IndexedDB', () => createTrainingRepository(new TrainerDB(`training-${Math.random()}`))],
  ['Speicher', memoryTrainingRepository],
] as const) {
  describe(`TrainingRepository (${name})`, () => {
    it('speichert Taktikversuche, Endspielergebnisse und Einzelwerte', async () => {
      const repo = make()
      await repo.addPuzzleAttempt({ puzzleId: 'p2', theme: 'fork', themes: ['fork'], puzzleRating: 800, solved: true, hints: 0, at: 2 })
      await repo.addPuzzleAttempt({ puzzleId: 'p1', theme: 'pin', themes: ['pin'], puzzleRating: 700, solved: false, hints: 1, at: 1 })
      expect((await repo.puzzleAttempts()).map((a) => a.puzzleId)).toEqual(['p1', 'p2'])
      await repo.addEndgameResult({ endgameId: 'kq-k', success: true, moves: 9, at: 3 })
      expect(await repo.endgameResults()).toHaveLength(1)
      expect(await repo.getMeta<number>('tacticsRating')).toBeUndefined()
      await repo.setMeta('tacticsRating', 640)
      expect(await repo.getMeta<number>('tacticsRating')).toBe(640)
    })
  })
}
