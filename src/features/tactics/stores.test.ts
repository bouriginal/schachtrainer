import { describe, expect, it } from 'vitest'
import data from '../../data/endgames.json'
import { memoryTrainingRepository } from '../../core/storage/db'
import type { Endgame } from '../../core/endgames/endgame'
import type { Puzzle } from '../../core/tactics/puzzle'
import { analysis } from '../../test/analysis'
import { FakeEngine, flush } from '../../test/fakeEngine'
import { createEndgameStore } from '../endgames/endgameStore'
import { createTacticsStore } from './tacticsStore'

const wait = async (ms = 5) => {
  await new Promise((r) => setTimeout(r, ms))
  for (let i = 0; i < 4; i++) await flush()
}

// Grundreihenmatt (aus dem Lichess-Auszug) und eine konstruierte Zwei-Zug-Gabel
const PUZZLES: Puzzle[] = [
  { id: 'a', fen: '4Q2k/p1p3pp/2p2n2/2B5/8/5P1b/PqP4P/RN2R1K1 b - - 0 17', moves: 'f6e8 e1e8', rating: 600, theme: 'backRankMate', themes: ['backRankMate', 'mateIn1'] },
  { id: 'b', fen: 'r3k3/8/8/1N6/8/8/8/4K3 b - - 0 1', moves: 'e8d8 b5c7 d8c7', rating: 650, theme: 'fork', themes: ['fork'] },
]

const tactics = (rng = () => 0) => {
  const repo = memoryTrainingRepository()
  const store = createTacticsStore({ repo, loadPuzzles: async () => PUZZLES, rng, now: () => 1, introMs: 0 })
  return { repo, store }
}

describe('Taktik-Store', () => {
  it('zeigt erst den Gegnerzug, dann darfst du ziehen; Lösung erhöht die Wertung', async () => {
    const { store, repo } = tactics()
    await store.getState().init()
    expect(store.getState().intro).toBe(true)
    expect(store.getState().move('e1', 'e8')).toBe(false) // noch Intro
    await wait()
    expect(store.getState().feedback?.title).toBe('Weiß am Zug – finde den besten Zug')
    expect(store.getState().move('e1', 'e8')).toBe(true)
    const s = store.getState()
    expect(s.feedback).toMatchObject({ tone: 'solved', title: 'Gelöst! 🎉' })
    expect(s.feedback?.lines[0]).toMatch(/^Motiv: Grundreihenmatt/)
    expect(s.rating).toBeGreaterThan(600)
    expect(await repo.puzzleAttempts()).toMatchObject([{ puzzleId: 'a', solved: true, hints: 0 }])
    expect(await repo.getMeta('tacticsRating')).toBe(s.rating)
  })

  it('falscher Zug: als nicht gelöst gezählt, nach zwei Fehlern Lösungspfeil', async () => {
    const { store, repo } = tactics()
    await store.getState().init()
    await wait()
    expect(store.getState().move('g1', 'f2')).toBe(false)
    expect(store.getState().feedback?.arrow).toBeUndefined()
    store.getState().move('g1', 'h1')
    expect(store.getState().feedback?.arrow).toEqual({ from: 'e1', to: 'e8' })
    store.getState().move('e1', 'e8')
    expect(store.getState().feedback).toMatchObject({ tone: 'failed', title: 'Geschafft – mit Hilfe' })
    const attempts = await repo.puzzleAttempts()
    expect(attempts).toHaveLength(1) // nur einmal gezählt
    expect(attempts[0].solved).toBe(false)
    expect(store.getState().rating).toBeLessThan(600)
  })

  it('Hinweise: erst Motiv, dann Figur', async () => {
    const { store } = tactics()
    await store.getState().init()
    await wait()
    store.getState().hint()
    expect(store.getState().feedback?.title).toBe('Hinweis: Motiv „Grundreihenmatt“')
    store.getState().hint()
    expect(store.getState().feedback?.hintSquare).toBe('e1')
    store.getState().move('e1', 'e8')
    expect(store.getState().feedback?.title).toBe('Gelöst – mit Hinweis')
  })

  it('mehrzügige Aufgabe: Gegner antwortet automatisch', async () => {
    const { store } = tactics()
    await store.getState().init()
    store.getState().setTheme('fork')
    await wait()
    expect(store.getState().current?.puzzle.id).toBe('b')
    store.getState().move('b5', 'c7')
    expect(store.getState().current?.status).toBe('solved')
  })

  it('nächste Aufgabe bevorzugt Ungesehenes', async () => {
    const { store } = tactics()
    await store.getState().init()
    await wait()
    store.getState().move('e1', 'e8')
    store.getState().next()
    expect(store.getState().current?.puzzle.id).toBe('b')
  })
})

const endgames = data.endgames as Endgame[]
const KRK_NEAR_MATE: Endgame = { ...endgames.find((e) => e.id === 'kr-k')!, fen: '4k3/8/4K3/8/8/8/8/R7 w - - 0 1' }

describe('Endspiel-Store', () => {
  it('Matt im ersten Zug: Erfolg wird gespeichert', async () => {
    const repo = memoryTrainingRepository()
    const store = createEndgameStore({ engine: new FakeEngine(), repo, now: () => 1 })
    store.getState().start(KRK_NEAR_MATE)
    expect(store.getState().playerMove('a1', 'a8')).toBe(true)
    expect(store.getState().verdict).toMatchObject({ state: 'success' })
    expect(await repo.endgameResults()).toMatchObject([{ endgameId: 'kr-k', success: true, moves: 1 }])
  })

  it('Engine antwortet; bei gefährdetem Gewinn kommt eine Warnung, Zurücknehmen hilft', async () => {
    const engine = new FakeEngine()
    const store = createEndgameStore({ engine, repo: memoryTrainingRepository() })
    const kq = endgames.find((e) => e.id === 'kq-k')!
    // Nach Dd2 tut die Engine so, als sei die Stellung nur ausgeglichen
    const afterQd2 = '8/8/8/4k3/8/8/3Q4/4K3 b - - 1 1'
    engine.responses.set(afterQd2, analysis(afterQd2, [0, 'e5e4']))
    store.getState().start(kq)
    store.getState().playerMove('d1', 'd2')
    expect(store.getState().engineThinking).toBe(true)
    await wait()
    expect(store.getState().moves).toHaveLength(2)
    expect(store.getState().warning).toMatch(/^Vorsicht/)
    store.getState().undo()
    expect(store.getState().moves).toHaveLength(0)
    expect(store.getState().warning).toBeNull()
  })

  it('Tipps werden nacheinander aufgedeckt', () => {
    const store = createEndgameStore({ engine: new FakeEngine(), repo: memoryTrainingRepository() })
    store.getState().start(endgames[0])
    store.getState().hint()
    store.getState().hint()
    expect(store.getState().hintsShown).toBe(2)
  })
})
