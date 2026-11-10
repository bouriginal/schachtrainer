import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import data from '../../data/endgames.json'
import { applyUci, type PlayedMove } from '../chess/game'
import { judgeEndgame, playerColor, type Endgame } from './endgame'

const endgames = data.endgames as Endgame[]
const byId = (id: string) => endgames.find((e) => e.id === id)!

function play(fen: string, ...ucis: string[]): PlayedMove[] {
  const out: PlayedMove[] = []
  let f = fen
  for (const u of ucis) {
    const m = applyUci(f, u)
    if (!m) throw new Error(`illegal ${u}`)
    out.push(m)
    f = m.fenAfter
  }
  return out
}

describe('Endspiel-Daten', () => {
  it('alle Stellungen sind gültig und haben Lernziel und Tipps', () => {
    expect(new Set(endgames.map((e) => e.id)).size).toBe(endgames.length)
    for (const e of endgames) {
      const c = new Chess(e.fen)
      expect(c.isGameOver(), e.id).toBe(false)
      expect(e.lesson.length, e.id).toBeGreaterThan(40)
      expect(e.hints.length, e.id).toBeGreaterThanOrEqual(3)
      if (e.goal === 'draw') expect(e.surviveMoves, e.id).toBeGreaterThan(0)
    }
  })
  it('deckt Grundmatts, Bauern- und Turmendspiele ab', () => {
    expect(new Set(endgames.map((e) => e.category))).toEqual(new Set(['Grundmatts', 'Bauernendspiele', 'Turmendspiele']))
  })
})

describe('judgeEndgame', () => {
  it('erkennt Matt als Erfolg', () => {
    const e: Endgame = { ...byId('kr-k'), fen: '4k3/8/4K3/8/8/8/8/R7 w - - 0 1' }
    expect(judgeEndgame(e, play(e.fen, 'a1a8'))).toMatchObject({ state: 'success' })
  })
  it('erkennt Patt als Misserfolg beim Mattsetzen', () => {
    const e: Endgame = { ...byId('kq-k'), fen: 'k7/8/2K5/8/8/8/8/1Q6 w - - 0 1' }
    expect(judgeEndgame(e, play(e.fen, 'b1b6'))).toMatchObject({ state: 'failure', text: expect.stringMatching(/^Patt/) })
  })
  it('erklärt den Figurenverlust konkret', () => {
    const e = byId('kq-k')
    expect(judgeEndgame(e, play(e.fen, 'd1d4', 'e5d4'))).toMatchObject({ state: 'failure', text: expect.stringMatching(/^Deine Figur ist verloren/) })
  })
  it('läuft weiter, solange nichts entschieden ist', () => {
    const e = byId('kq-k')
    expect(judgeEndgame(e, play(e.fen, 'd1d4'))).toEqual({ state: 'running' })
  })
  it('Umwandlung zählt erst, wenn die neue Figur die Gegnerantwort überlebt', () => {
    const e: Endgame = { ...byId('square-rule'), fen: '8/P7/5k2/8/8/8/8/7K w - - 0 1' }
    const promoted = play(e.fen, 'a7a8q')
    expect(judgeEndgame(e, promoted)).toEqual({ state: 'running' })
    expect(judgeEndgame(e, play(e.fen, 'a7a8q', 'f6e5'))).toMatchObject({ state: 'success' })
  })
  it('meldet den verlorenen Bauern', () => {
    const e: Endgame = { ...byId('king-in-front'), fen: '8/8/3k4/4P3/8/8/8/7K w - - 0 1' }
    expect(judgeEndgame(e, play(e.fen, 'h1g2', 'd6e5'))).toMatchObject({ state: 'failure' })
  })
  it('Remis halten: Erfolg nach genug überstandenen Zügen', () => {
    const e: Endgame = { ...byId('philidor'), surviveMoves: 2 }
    expect(playerColor(e)).toBe('b')
    const moves = play(e.fen, 'b6a6', 'h7h8', 'e8d7', 'h8h7')
    expect(judgeEndgame(e, moves.slice(0, 3))).toEqual({ state: 'running' })
    expect(judgeEndgame(e, moves)).toMatchObject({ state: 'success' })
  })
  it('Remis halten: gegnerische Umwandlung ist ein Misserfolg', () => {
    const e: Endgame = { ...byId('kp-defence'), fen: '8/4P3/8/8/8/8/k7/4K3 b - - 0 1' }
    expect(judgeEndgame(e, play(e.fen, 'a2b2', 'e7e8q'))).toMatchObject({ state: 'failure' })
  })
})
