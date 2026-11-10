import { describe, expect, it } from 'vitest'
import { getStrength, pickMove, STRENGTH_LEVELS } from './strength'
import type { AnalysisLine } from './types'

const line = (multipv: number, cp: number, move: string): AnalysisLine => ({
  multipv,
  depth: 5,
  score: { type: 'cp', value: cp },
  pv: [move],
})

describe('getStrength', () => {
  it('begrenzt die Stufe auf den gültigen Bereich', () => {
    expect(getStrength(0).level).toBe(1)
    expect(getStrength(99).level).toBe(STRENGTH_LEVELS.length)
    expect(getStrength(4.4).level).toBe(4)
  })
  it('wird mit der Stufe stärker', () => {
    for (let i = 1; i < STRENGTH_LEVELS.length; i++) {
      expect(STRENGTH_LEVELS[i].approxElo).toBeGreaterThan(STRENGTH_LEVELS[i - 1].approxElo)
      expect(STRENGTH_LEVELS[i].mistakeChance).toBeLessThanOrEqual(STRENGTH_LEVELS[i - 1].mistakeChance)
    }
  })
})

describe('pickMove', () => {
  // Weiß am Zug: höhere Bewertung = besser
  const lines = [line(1, 80, 'e2e4'), line(2, 40, 'd2d4'), line(3, -500, 'g2g4')]

  it('spielt den besten Zug, wenn kein Fehler ausgewürfelt wird', () => {
    expect(pickMove(lines, getStrength(1), 'w', () => 0.99)).toBe('e2e4')
  })

  it('wählt bei einem Fehler nur Züge innerhalb des erlaubten Verlusts', () => {
    const cfg = { ...getStrength(3), mistakeChance: 1, maxLossCp: 100 }
    expect(pickMove(lines, cfg, 'w', () => 0)).toBe('d2d4')
  })

  it('bewertet aus Sicht von Schwarz richtig herum', () => {
    // Schwarz am Zug: niedrigere (weiße) Bewertung = besser für Schwarz
    const black = [line(1, -90, 'e7e5'), line(2, 300, 'f7f6')]
    expect(pickMove(black, getStrength(9), 'b', () => 0.5)).toBe('e7e5')
  })

  it('spielt auf hohen Stufen nie absichtlich schlechter', () => {
    expect(pickMove(lines, getStrength(9), 'w', () => 0)).toBe('e2e4')
  })

  it('gibt null zurück, wenn es keine Kandidaten gibt', () => {
    expect(pickMove([], getStrength(1), 'w')).toBeNull()
  })
})
