import { describe, expect, it } from 'vitest'
import { memoryGameRepository } from '../../core/storage/db'
import { analysis } from '../../test/analysis'
import { FakeEngine, flush } from '../../test/fakeEngine'
import { createPlayStore } from './playStore'

let id = 0
const setup = () => {
  const engine = new FakeEngine()
  const repo = memoryGameRepository()
  const store = createPlayStore({ engine, repo, rng: () => 0.99, now: () => 1000, newId: () => `g${++id}` })
  return { engine, repo, store }
}

describe('freies Spiel', () => {
  it('nimmt Spielerzüge an und lässt die Engine antworten', async () => {
    const { store } = setup()
    store.getState().newGame({ playerColor: 'w', level: 2 })
    expect(store.getState().playerMove('e2', 'e4')).toBe(true)
    await flush()
    const s = store.getState()
    expect(s.moves.map((m) => m.color)).toEqual(['w', 'b'])
    expect(s.engineThinking).toBe(false)
    expect(s.status.turn).toBe('w')
  })

  it('lehnt illegale Züge und Züge außer der Reihe ab', async () => {
    const { store } = setup()
    store.getState().newGame({ playerColor: 'w', level: 2 })
    expect(store.getState().playerMove('e2', 'e5')).toBe(false)
    expect(store.getState().playerMove('e7', 'e5')).toBe(false)
    expect(store.getState().moves).toHaveLength(0)
  })

  it('lässt die Engine beginnen, wenn der Spieler Schwarz hat', async () => {
    const { store } = setup()
    store.getState().newGame({ playerColor: 'b', level: 2 })
    await flush()
    expect(store.getState().moves).toHaveLength(1)
    expect(store.getState().moves[0].color).toBe('w')
  })

  it('nimmt eigenen Zug samt Engine-Antwort zurück', async () => {
    const { store } = setup()
    store.getState().newGame({ playerColor: 'w', level: 2 })
    store.getState().playerMove('e2', 'e4')
    await flush()
    store.getState().playerMove('d2', 'd4')
    await flush()
    expect(store.getState().moves).toHaveLength(4)
    store.getState().undo()
    await flush()
    expect(store.getState().moves.map((m) => m.san)).toHaveLength(2)
    expect(store.getState().status.turn).toBe('w')
  })

  it('speichert die Partie und setzt sie fort', async () => {
    const { store, repo } = setup()
    store.getState().newGame({ playerColor: 'w', level: 3 })
    store.getState().playerMove('e2', 'e4')
    await flush()
    const saved = await repo.latestUnfinished('free')
    expect(saved?.moves).toHaveLength(2)
    expect(saved?.level).toBe(3)

    const other = setup()
    other.store.getState().resume(saved!)
    expect(other.store.getState().moves).toHaveLength(2)
    expect(other.store.getState().playerMove('d2', 'd4')).toBe(true)
  })

  it('beendet die Partie bei Aufgabe', async () => {
    const { store, repo } = setup()
    store.getState().newGame({ playerColor: 'w', level: 2 })
    store.getState().resign()
    expect(store.getState().playerMove('e2', 'e4')).toBe(false)
    await flush()
    const g = await repo.get(store.getState().gameId)
    expect(g).toMatchObject({ result: '0-1', reason: 'Aufgegeben' })
  })

  it('zeigt die Bewertung der aktuellen Stellung', async () => {
    const { store } = setup()
    store.getState().newGame({ playerColor: 'w', level: 2 })
    store.getState().playerMove('e2', 'e4')
    await flush()
    await flush()
    const s = store.getState()
    expect(s.evaluation?.fen).toBe(s.currentFen())
  })

  it('verwirft veraltete Engine-Antworten nach Zurücknahme', async () => {
    const { store } = setup()
    store.getState().newGame({ playerColor: 'w', level: 2 })
    store.getState().playerMove('e2', 'e4')
    store.getState().undo() // bevor die Engine antwortet
    await flush()
    expect(store.getState().moves).toHaveLength(0)
  })
})

describe('Coach im Spiel', () => {
  const ITALIAN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
  const ITALIAN_NXE5 = 'r1bqkbnr/pppp1ppp/2n5/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3'

  /** Partie bis zur Italienisch-Stellung, Engine-Antworten vorgegeben */
  const toItalian = async (pauseOnMistake = true) => {
    const engine = new FakeEngine()
    const repo = memoryGameRepository()
    const store = createPlayStore({ engine, repo, rng: () => 0.99, newId: () => `c${++id}`, coach: { pauseOnMistake } })
    const after1 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    const after2 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2'
    engine.responses.set(after1, analysis(after1, [30, 'e7e5']))
    engine.responses.set(after2, analysis(after2, [30, 'b8c6']))
    engine.responses.set(ITALIAN, analysis(ITALIAN, [40, 'f1b5', 'a7a6']))
    engine.responses.set(ITALIAN_NXE5, analysis(ITALIAN_NXE5, [-250, 'c6e5', 'd2d4']))
    store.getState().newGame({ playerColor: 'w', level: 9 })
    store.getState().playerMove('e2', 'e4')
    await settle()
    store.getState().playerMove('g1', 'f3')
    await settle()
    expect(store.getState().currentFen()).toBe(ITALIAN)
    return { store, engine, repo }
  }
  const settle = async () => {
    for (let i = 0; i < 6; i++) await flush()
  }

  it('bewertet jeden eigenen Zug', async () => {
    const { store } = await toItalian()
    expect(store.getState().review?.san).toBe('Nf3')
    expect(Object.keys(store.getState().reviews)).toEqual(['0', '2'])
  })

  it('hält bei einem Patzer an, bevor die Engine antwortet', async () => {
    const { store } = await toItalian()
    store.getState().playerMove('f3', 'e5')
    await settle()
    const s = store.getState()
    expect(s.review?.moveClass).toBe('blunder')
    expect(s.review?.sentences[0]).toContain('Springer auf e5')
    expect(s.paused).toBe(true)
    expect(s.moves.at(-1)?.san).toBe('Nxe5') // Engine hat noch nicht geantwortet
    expect(s.playerMove('d2', 'd4')).toBe(false)
  })

  it('nimmt nach der Pause nur den eigenen Zug zurück', async () => {
    const { store } = await toItalian()
    store.getState().playerMove('f3', 'e5')
    await settle()
    store.getState().undo()
    await settle()
    const s = store.getState()
    expect(s.currentFen()).toBe(ITALIAN)
    expect(s.paused).toBe(false)
    expect(s.review).toBeNull()
    expect(Object.keys(s.reviews)).toEqual(['0', '2'])
  })

  it('spielt nach der Pause auf Wunsch weiter', async () => {
    const { store } = await toItalian()
    store.getState().playerMove('f3', 'e5')
    await settle()
    store.getState().continueGame()
    await settle()
    expect(store.getState().moves.at(-1)?.color).toBe('b')
    expect(store.getState().paused).toBe(false)
  })

  it('hält ohne Pausen-Einstellung nicht an', async () => {
    const { store } = await toItalian(false)
    store.getState().playerMove('f3', 'e5')
    await settle()
    expect(store.getState().review?.moveClass).toBe('blunder')
    expect(store.getState().moves.at(-1)?.color).toBe('b')
  })

  it('speichert die Coach-Bewertungen mit der Partie', async () => {
    const { store, repo } = await toItalian(false)
    store.getState().playerMove('f3', 'e5')
    await settle()
    const saved = await repo.get(store.getState().gameId)
    expect(saved?.reviews?.find((r) => r.ply === 4)).toMatchObject({ moveClass: 'blunder', kinds: ['hanging_after'] })
  })

  it('analysiert ohne Coach nur mit einer Variante', async () => {
    const engine = new FakeEngine()
    const store = createPlayStore({ engine, repo: memoryGameRepository(), rng: () => 0.99, coach: { enabled: false } })
    store.getState().newGame({ playerColor: 'w', level: 9 })
    store.getState().playerMove('e2', 'e4')
    await settle()
    expect(store.getState().review).toBeNull()
    expect(engine.calls.every((c) => (c.options.multiPv ?? 1) === 1)).toBe(true)
  })
})
