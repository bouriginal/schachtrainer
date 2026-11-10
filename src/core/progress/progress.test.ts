import { describe, expect, it } from 'vitest'
import { getRepertoire } from '../../data/openings'
import endgameData from '../../data/endgames.json'
import { START_FEN } from '../chess/game'
import type { Endgame } from '../endgames/endgame'
import { cardId, playerNodes } from '../openings/repertoire'
import { introduceCard, type StudyCard } from '../openings/srs'
import type { OpeningLogEntry, PuzzleAttempt, ReviewSummary, StoredGame } from '../storage/db'
import { buildSuggestions, gameStats, openingStats, recurringMistakes, tacticsStats } from './progress'

const NOW = new Date('2026-11-10T10:00:00Z')
const endgames = endgameData.endgames as Endgame[]

let n = 0
const game = (over: Partial<StoredGame> = {}, reviews: Partial<ReviewSummary>[] = []): StoredGame => ({
  id: `g${++n}`,
  mode: 'free',
  createdAt: n,
  updatedAt: n,
  startFen: START_FEN,
  moves: [],
  playerColor: 'w',
  level: 2,
  result: '1-0',
  reason: null,
  reviews: reviews.map((r, i) => ({ ply: i * 2, san: 'Nf3', moveClass: 'good', winLoss: 0, kinds: [], ...r })),
  ...over,
})
const blunder = (kind: ReviewSummary['kinds'][number], san = 'Nf3'): Partial<ReviewSummary> => ({ moveClass: 'blunder', winLoss: 30, kinds: [kind], san })
const ok = (): Partial<ReviewSummary> => ({ moveClass: 'good' })

describe('gameStats', () => {
  it('zählt Ergebnisse aus deiner Sicht und Fehler pro Partie', () => {
    const games = [
      game({ result: '1-0' }, [ok(), ok(), ok(), ok(), blunder('hanging_after')]),
      game({ result: '1-0', playerColor: 'b' }, [ok(), ok(), ok(), ok(), ok()]),
      game({ result: '1/2-1/2' }),
      game({ result: '*' }),
    ]
    expect(gameStats(games)).toMatchObject({ played: 3, wins: 1, losses: 1, draws: 1, mistakesPerGame: 0.5, recentMistakes: [1, 0], accuracy: null })
  })
})

describe('recurringMistakes', () => {
  it('erkennt ein Muster erst ab 2 Vorkommen in 2 Partien', () => {
    const once = [game({}, [blunder('hanging_after'), blunder('hanging_after')])]
    expect(recurringMistakes(once)).toEqual([])
    const twice = [...once, game({}, [blunder('hanging_after', 'Bxa6')])]
    const [p] = recurringMistakes(twice)
    expect(p).toMatchObject({ id: 'hanging', count: 3, games: 2 })
    expect(p.examples.map((e) => e.san)).toContain('Lxa6')
  })
  it('fasst verwandte Befunde zusammen und ignoriert gute Züge', () => {
    const games = [game({}, [blunder('king_in_center'), { moveClass: 'good', kinds: ['lost_castling'] }]), game({}, [blunder('lost_castling')])]
    expect(recurringMistakes(games).map((p) => [p.id, p.count])).toEqual([['king-safety', 2]])
  })
})

describe('tacticsStats', () => {
  const att = (puzzleId: string, theme: string, solved: boolean, at: number): PuzzleAttempt => ({ puzzleId, theme, themes: [theme], puzzleRating: 600, solved, hints: 0, at })
  it('zählt je Aufgabe den ersten Versuch und rekonstruiert den Wertungsverlauf', () => {
    const s = tacticsStats([att('a', 'fork', false, 1), att('a', 'fork', true, 2), att('b', 'fork', true, 3), att('c', 'pin', true, 4)])
    const fork = s.themes.find((t) => t.theme === 'fork')!
    expect(fork).toMatchObject({ tried: 2, solved: 1, rate: 0.5 })
    expect(s.attempts).toBe(4)
    expect(s.ratingHistory).toEqual([600, 584, 601, 617, 632])
    expect(s.solvedRate).toBeCloseTo(2 / 3)
  })
})

describe('openingStats', () => {
  const caro = getRepertoire('caro-kann')!
  const cards = new Map<string, StudyCard>()
  for (const nd of playerNodes(caro, 'advance')) cards.set(cardId(caro.id, nd.key), introduceCard(cardId(caro.id, nd.key), caro.id, nd.key, nd.edges[0].san, NOW))
  it('zeigt Fortschritt, Trefferquote und Schwachstellen', () => {
    const log = (key: string, outcome: OpeningLogEntry['outcome'], at: number, played?: string): OpeningLogEntry => ({ repId: 'caro-kann', key, san: 'Bf5', outcome, played, at })
    const s = openingStats(caro, cards, [log('k1', 'wrong', 1, 'e6'), log('k1', 'wrong', 2, 'e6'), log('k1', 'correct', 3), log('k2', 'correct', 4)], NOW)
    expect(s).toMatchObject({ learned: 8, accuracy: 0.5, weakSpots: [{ key: 'k1', expected: 'Lf5', wrong: 2, played: 'e6' }] })
  })
})

describe('buildSuggestions', () => {
  const caro = getRepertoire('caro-kann')!
  const empty = { games: [], openings: [], tactics: tacticsStats([]), endgames, endgameResults: [], patterns: [] }

  it('Neuling: Partie spielen, Taktik-Einstieg und erstes Endspiel', () => {
    expect(buildSuggestions(empty).map((s) => s.id)).toEqual(['tactics-start', 'play', 'endgame-kq-k'])
  })

  it('schlägt ein noch unbegonnenes Repertoire und weitere Taktik vor', () => {
    const openings = [openingStats(caro, new Map(), [], NOW)]
    const one: PuzzleAttempt = { puzzleId: 'x', theme: 'fork', themes: ['fork'], puzzleRating: 600, solved: true, hints: 0, at: 1 }
    const ids = buildSuggestions({ ...empty, openings, tactics: tacticsStats([one]) }).map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining(['tactics-more', 'learn-caro-kann']))
  })

  it('stellt fällige Wiederholungen und wiederkehrende Fehler nach vorn', () => {
    const games = [game({ moves: Array(12).fill(null) as never }, [blunder('hanging_after')]), game({}, [blunder('hanging_after')])]
    const patterns = recurringMistakes(games)
    const openings = [{ ...openingStats(caro, new Map(), [], NOW), due: 4 }]
    const ids = buildSuggestions({ ...empty, games, openings, patterns }).map((s) => s.id)
    expect(ids[0]).toBe('due-caro-kann')
    expect(ids).toContain('pattern-hanging')
    expect(ids).toContain(`analyze-${games[0].id}`)
    expect(ids).toHaveLength(5)
  })

  it('schlägt das schwächste Taktikmotiv vor', () => {
    const atts: PuzzleAttempt[] = Array.from({ length: 6 }, (_, i) => ({ puzzleId: `p${i}`, theme: 'pin', themes: ['pin'], puzzleRating: 600, solved: i === 0, hints: 0, at: i }))
    const s = buildSuggestions({ ...empty, tactics: tacticsStats(atts) }).find((x) => x.id === 'theme-pin')!
    expect(s.to).toBe('/taktik?motiv=pin')
    expect(s.why).toMatch(/17 %/)
  })
})
