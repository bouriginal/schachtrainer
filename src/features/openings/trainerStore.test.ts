import { describe, expect, it } from 'vitest'
import { getRepertoire } from '../../data/openings'
import { memoryCardRepository } from '../../core/storage/db'
import { FakeEngine, flush } from '../../test/fakeEngine'
import { analysis } from '../../test/analysis'
import { createTrainerStore } from './trainerStore'

const london = getRepertoire('london')!
const caro = getRepertoire('caro-kann')!
let clock = new Date('2026-11-10T10:00:00Z')
const wait = async () => {
  await new Promise((r) => setTimeout(r, 5))
  for (let i = 0; i < 5; i++) await flush()
}

const setup = () => {
  const engine = new FakeEngine()
  const cards = memoryCardRepository()
  clock = new Date('2026-11-10T10:00:00Z')
  const store = createTrainerStore({ engine, cards, now: () => clock, rng: () => 0, opponentDelayMs: 0 })
  return { store, engine, cards }
}

/** spielt den jeweils erwarteten Zug (mit Pfeil im Lernmodus) */
const playExpected = (store: ReturnType<typeof setup>['store']) => {
  const a = store.getState().feedback!.arrows.find((x) => x.kind === 'expected')
  if (!a) throw new Error('kein Pfeil')
  return store.getState().playerMove(a.from, a.to)
}

describe('Eröffnungstrainer', () => {
  it('Lernmodus: zeigt den Zug mit Erklärung, Gegner antwortet, am Ende entstehen Karten', async () => {
    const { store, cards } = setup()
    await store.getState().loadCards()
    store.getState().start(london, 'learn', 'qb6-trap')
    expect(store.getState().feedback).toMatchObject({ tone: 'info', title: 'Jetzt du: d4' })
    expect(playExpected(store)).toBe(true)
    expect(store.getState().feedback?.tone).toBe('correct')
    await wait()
    expect(store.getState().feedback?.lines[0]).toMatch(/^Schwarz spielt …d5/)
    let guard = 0
    while (!store.getState().session!.done && guard++ < 20) {
      playExpected(store)
      await wait()
    }
    expect(store.getState().feedback?.tone).toBe('done')
    expect(store.getState().feedback?.lines[0]).toMatch(/^Dein letzter Zug Sb5: Drohung Sc7\+/)
    expect(store.getState().session!.steps.map((s) => s.san).join(' ')).toBe('d4 d5 Bf4 c5 e3 Qb6 Nc3 Qxb2 Nb5')
    await wait()
    expect((await cards.all('london')).length).toBe(5)
  })

  it('Lernmodus: falscher Zug wird nicht ausgeführt und erklärt', () => {
    const { store } = setup()
    store.getState().start(london, 'learn', 'main-e6')
    expect(store.getState().playerMove('e2', 'e4')).toBe(false)
    expect(store.getState().feedback).toMatchObject({ tone: 'wrong', title: 'Nicht ganz – spiel den grünen Pfeil' })
    expect(store.getState().session!.steps).toHaveLength(0)
  })

  it('Übungsmodus als Schwarz: Gegner zieht zuerst, richtige Antwort wird bewertet', async () => {
    const { store, cards } = setup()
    store.getState().start(caro, 'review')
    expect(store.getState().playerMove('c7', 'c6')).toBe(false) // Weiß ist noch nicht gezogen
    await wait()
    expect(store.getState().feedback?.title).toBe('Was spielst du hier?')
    expect(store.getState().feedback?.arrows).toEqual([]) // keine Lösung im Übungsmodus
    expect(store.getState().playerMove('c7', 'c6')).toBe(true)
    expect(store.getState().score.correct).toBe(1)
    const logs = await cards.logs('caro-kann')
    expect(logs[0]).toMatchObject({ san: 'c6', outcome: 'correct' })
  })

  it('Übungsmodus: falscher Zug wird bewertet, mit Engine erklärt, dann muss der richtige folgen', async () => {
    const { store, engine, cards } = setup()
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    const afterE4E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
    engine.responses.set(afterE4, analysis(afterE4, [-20, 'c7c6'], [-25, 'e7e5']))
    engine.responses.set(afterE4E5, analysis(afterE4E5, [25, 'g1f3']))
    store.getState().start(caro, 'review')
    await wait()
    expect(store.getState().playerMove('e7', 'e5')).toBe(false)
    const fb = store.getState().feedback!
    expect(fb.title).toBe('…e5 ist nicht dein Repertoirezug')
    expect(fb.lines[0]).toMatch(/^Hier spielst du …c6:/)
    expect(fb.arrows.map((a) => a.kind)).toEqual(['expected', 'played'])
    await wait()
    expect(store.getState().feedback!.lines[1]).toMatch(/^Coach: e5 ist laut Engine auch spielbar/)
    expect(store.getState().playerMove('c7', 'c6')).toBe(true)
    expect(store.getState().score).toEqual({ correct: 0, hinted: 0, wrong: 1 })
    const logs = await cards.logs('caro-kann')
    expect(logs).toHaveLength(1) // nur einmal bewertet
    expect(logs[0]).toMatchObject({ outcome: 'wrong', played: 'e5' })
  })

  it('Hinweise: erst Figur, dann Lösung – zählt als „mit Hinweis“', async () => {
    const { store } = setup()
    store.getState().start(london, 'review')
    store.getState().hint()
    expect(store.getState().feedback?.hintSquare).toBe('d2')
    store.getState().hint()
    expect(store.getState().feedback?.arrows[0]).toMatchObject({ from: 'd2', to: 'd4' })
    store.getState().playerMove('d2', 'd4')
    expect(store.getState().score.hinted).toBe(1)
  })

  it('Übungsmodus: Gegner wählt Linien mit fälligen Karten', async () => {
    const { store } = setup()
    store.getState().start(caro, 'learn', 'exchange')
    for (let i = 0; i < 20 && !store.getState().session!.done; i++) {
      await wait() // als Schwarz zieht zuerst der Gegner
      playExpected(store)
    }
    clock = new Date(clock.getTime() + 30 * 60_000)
    store.getState().start(caro, 'review')
    for (let i = 0; i < 6; i++) {
      await wait()
      const exp = caro.nodes.get(store.getState().session!.key)!.edges[0]
      store.getState().playerMove(exp.uci.slice(0, 2), exp.uci.slice(2, 4))
    }
    expect(store.getState().session!.steps.map((s) => s.san).slice(0, 5)).toEqual(['e4', 'c6', 'd4', 'd5', 'exd5'])
  })
})
