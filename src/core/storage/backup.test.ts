import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { START_FEN } from '../chess/game'
import { detectMoveEvent } from '../chess/moveEvent'
import { introduceCard } from '../openings/srs'
import { createBackup, parseBackup, restoreBackup, summarize } from './backup'
import { createCardRepository, createGameRepository, createTrainingRepository, TrainerDB } from './db'

const newDb = () => new TrainerDB(`backup-${Math.random()}`)

describe('Backup', () => {
  it('überträgt alle Daten samt Datumswerten auf ein anderes Gerät', async () => {
    const phone = newDb()
    const due = new Date('2026-11-12T08:00:00Z')
    await createGameRepository(phone).save({ id: 'g1', mode: 'free', createdAt: 1, updatedAt: 2, startFen: START_FEN, moves: [], playerColor: 'w', level: 2, result: '1-0', reason: 'Schachmatt' })
    const card = introduceCard('london|k', 'london', 'k', 'd4', new Date('2026-11-10T10:00:00Z'))
    card.fsrs.due = due
    await createCardRepository(phone).putMany([card])
    await createTrainingRepository(phone).setMeta('tacticsRating', 712)
    await createTrainingRepository(phone).addPuzzleAttempt({ puzzleId: 'p', theme: 'fork', themes: ['fork'], puzzleRating: 700, solved: true, hints: 0, at: 5 })

    const json = await createBackup(phone, { 'schachtrainer.coach': '{"enabled":true}' })
    const backup = parseBackup(json)
    expect(summarize(backup)).toEqual({ games: 1, cards: 1, puzzleAttempts: 1, endgameResults: 0 })

    const laptop = newDb()
    await createGameRepository(laptop).save({ id: 'alt', mode: 'free', createdAt: 0, updatedAt: 0, startFen: START_FEN, moves: [], playerColor: 'w', level: 1, result: '*', reason: null })
    await restoreBackup(laptop, backup)

    expect((await createGameRepository(laptop).list()).map((g) => g.id)).toEqual(['g1']) // ersetzt, nicht gemischt
    const [restored] = await createCardRepository(laptop).all()
    expect(restored.fsrs.due).toBeInstanceOf(Date)
    expect(restored.fsrs.due.toISOString()).toBe(due.toISOString())
    expect(await createTrainingRepository(laptop).getMeta('tacticsRating')).toBe(712)
    expect(backup.settings['schachtrainer.coach']).toBe('{"enabled":true}')
  })

  it('lehnt fremde, kaputte oder zu neue Dateien mit klarer Meldung ab', () => {
    expect(() => parseBackup('kein json')).toThrow('kein gültiges Backup')
    expect(() => parseBackup('{"app":"anders"}')).toThrow('kein Schachtrainer-Backup')
    expect(() => parseBackup('{"app":"schachtrainer","version":99,"tables":{}}')).toThrow('neueren App-Version')
    expect(() => parseBackup('{"app":"schachtrainer","version":1,"tables":{"games":[]}}')).toThrow('unvollständig')
  })
})

describe('detectMoveEvent', () => {
  const after = (fen: string, uci: string) => {
    // kleine Hilfsfunktion über chess.js
    return import('chess.js').then(({ Chess }) => {
      const c = new Chess(fen)
      c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
      return c.fen()
    })
  }
  it('erkennt Zug, Schlagen, Schach, Rochade, Umwandlung und Matt', async () => {
    expect(detectMoveEvent(START_FEN, await after(START_FEN, 'e2e4'))).toBe('move')
    const scandi = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
    expect(detectMoveEvent(scandi, await after(scandi, 'e4d5'))).toBe('capture')
    const italian = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'
    expect(detectMoveEvent(italian, await after(italian, 'e1g1'))).toBe('castle')
    expect(detectMoveEvent(italian, await after(italian, 'c4f7'))).toBe('check')
    const promo = '8/4P3/8/8/8/8/k7/4K3 w - - 0 1'
    expect(detectMoveEvent(promo, await after(promo, 'e7e8q'))).toBe('promote')
    const mate = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'
    expect(detectMoveEvent(mate, await after(mate, 'a1a8'))).toBe('mate')
  })
  it('bleibt still bei Sprüngen über mehrere Züge oder gleicher Stellung', async () => {
    const two = await after(await after(START_FEN, 'e2e4'), 'e7e5')
    expect(detectMoveEvent(START_FEN, two)).toBeNull()
    expect(detectMoveEvent(START_FEN, START_FEN)).toBeNull()
  })
})
