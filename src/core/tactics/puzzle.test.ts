import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import data from '../../data/puzzles/puzzles.json'
import { pickPuzzle, playPuzzleMove, startPuzzle, updateRating, type Puzzle } from './puzzle'
import { THEME_BY_ID, THEMES } from './themes'

const puzzles = data.puzzles as Puzzle[]

// Grundreihenmatt aus dem Auszug: 1…Sxe8 2.Txe8#
const BACK_RANK: Puzzle = {
  id: '07Wub',
  fen: '4Q2k/p1p3pp/2p2n2/2B5/8/5P1b/PqP4P/RN2R1K1 b - - 0 17',
  moves: 'f6e8 e1e8',
  rating: 400,
  theme: 'backRankMate',
  themes: ['backRankMate', 'mateIn1'],
}
// Mehrzügige Aufgabe konstruiert: Gabel nach Schach
const FORK: Puzzle = {
  id: 'fork1',
  fen: 'r3k3/8/8/1N6/8/8/8/4K3 b - - 0 1',
  moves: 'e8d8 b5c7 d8c7',
  rating: 800,
  theme: 'fork',
  themes: ['fork'],
}

describe('Puzzle-Daten', () => {
  it('enthält genug Aufgaben je Motiv und Stufe', () => {
    expect(puzzles.length).toBeGreaterThan(2000)
    for (const t of THEMES) expect(puzzles.filter((p) => p.theme === t.id).length, t.id).toBeGreaterThanOrEqual(100)
  })
  it('jede Aufgabe ist spielbar: alle Lösungszüge sind legal', () => {
    for (const p of puzzles) {
      const chess = new Chess(p.fen)
      for (const u of p.moves.split(' ')) chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
    }
  }, 30_000) // 2.160 Aufgaben komplett durchspielen dauert ein paar Sekunden
  it('jedes Motiv hat einen deutschen Namen und eine Erklärung', () => {
    for (const p of puzzles) expect(THEME_BY_ID.has(p.theme), p.theme).toBe(true)
  })
})

describe('Puzzle-Ablauf', () => {
  it('führt den Gegnerzug aus und lässt dich die Gegenfarbe spielen', () => {
    const s = startPuzzle(BACK_RANK)
    expect(s.color).toBe('w')
    expect(s.played[0].san).toBe('Nxe8')
  })
  it('löst mit dem richtigen Zug', () => {
    const r = playPuzzleMove(startPuzzle(BACK_RANK), 'e1e8')
    expect(r).toMatchObject({ result: 'correct', state: { status: 'solved' } })
  })
  it('zählt einen falschen Zug als Fehler, ohne ihn auszuführen', () => {
    const s = startPuzzle(BACK_RANK)
    const r = playPuzzleMove(s, 'g1f2') // legal, aber nicht die Lösung
    expect(r).toMatchObject({ result: 'wrong', expected: 'e1e8', state: { mistakes: 1, fen: s.fen } })
  })
  it('akzeptiert ein anderes sofortiges Matt', () => {
    // Lösung Te8#, aber Ta8# setzt genauso matt
    const p: Puzzle = { id: 'm', fen: '6k1/1p3ppp/8/8/8/8/5PPP/R3R1K1 b - - 0 1', moves: 'b7b6 e1e8', rating: 500, theme: 'mateIn1', themes: ['mateIn1'] }
    expect(playPuzzleMove(startPuzzle(p), 'a1a8')).toMatchObject({ result: 'correct', state: { status: 'solved' } })
  })
  it('spielt bei mehrzügigen Aufgaben die Gegnerantwort automatisch', () => {
    const s = startPuzzle({ ...FORK, moves: 'e8d8 b5c7 d8c7' })
    const r = playPuzzleMove(s, 'b5c7')
    expect(r.result).toBe('correct')
    if (r.result === 'correct') {
      expect(r.reply?.san).toBe('Kxc7')
      expect(r.state.status).toBe('solved')
    }
  })
  it('meldet illegale Züge', () => {
    expect(playPuzzleMove(startPuzzle(BACK_RANK), 'a1a5').result).toBe('illegal') // a2-Bauer blockiert
  })
})

describe('Wertung und Auswahl', () => {
  it('steigt bei Erfolg, fällt bei Misserfolg, stärker bei Überraschungen', () => {
    expect(updateRating(600, 600, true)).toBe(616)
    expect(updateRating(600, 600, false)).toBe(584)
    expect(updateRating(600, 1000, true) - 600).toBeGreaterThan(updateRating(600, 400, true) - 600)
  })
  it('wählt passend zu Motiv und Wertung, ungesehene zuerst', () => {
    const p = pickPuzzle(puzzles, { theme: 'fork', difficulty: 'auto', rating: 700, seen: new Map() }, () => 0.5)!
    expect(p.themes).toContain('fork')
    expect(Math.abs(p.rating - 700)).toBeLessThanOrEqual(150)
  })
  it('respektiert die gewählte Schwierigkeit', () => {
    for (let i = 0; i < 10; i++) {
      const p = pickPuzzle(puzzles, { theme: null, difficulty: 'schwer', rating: 600, seen: new Map() }, () => i / 10)!
      expect(p.rating).toBeGreaterThanOrEqual(1200)
    }
  })
  it('wiederholt zuerst verpatzte, wenn alle gesehen sind', () => {
    const pool = puzzles.filter((p) => p.theme === 'pin' && p.rating < 900)
    const seen = new Map(pool.map((p, i) => [p.id, i !== 3]))
    const p = pickPuzzle(pool, { theme: 'pin', difficulty: 'leicht', rating: 600, seen }, () => 0)!
    expect(p.id).toBe(pool[3].id)
  })
})
