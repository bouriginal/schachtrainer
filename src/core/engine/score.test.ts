import { describe, expect, it } from 'vitest'
import { formatScore, scoreToCp, winPercent } from './score'

describe('winPercent', () => {
  it('ist 50 % bei ausgeglichener Stellung', () => {
    expect(winPercent({ type: 'cp', value: 0 })).toBeCloseTo(50)
  })
  it('ist symmetrisch und monoton', () => {
    const a = winPercent({ type: 'cp', value: 150 })
    const b = winPercent({ type: 'cp', value: -150 })
    expect(a + b).toBeCloseTo(100)
    expect(winPercent({ type: 'cp', value: 300 })).toBeGreaterThan(a)
    expect(a).toBeGreaterThan(60)
  })
  it('ist 100/0 bei Matt', () => {
    expect(winPercent({ type: 'mate', value: 3 })).toBe(100)
    expect(winPercent({ type: 'mate', value: -1 })).toBe(0)
  })
})

describe('scoreToCp', () => {
  it('ordnet kürzere Matts höher ein als längere und alle Matts über cp', () => {
    expect(scoreToCp({ type: 'mate', value: 1 })).toBeGreaterThan(scoreToCp({ type: 'mate', value: 5 }))
    expect(scoreToCp({ type: 'mate', value: 5 })).toBeGreaterThan(scoreToCp({ type: 'cp', value: 5000 }))
    expect(scoreToCp({ type: 'mate', value: -2 })).toBeLessThan(scoreToCp({ type: 'cp', value: -5000 }))
  })
})

describe('formatScore', () => {
  it('formatiert Bauerneinheiten und Matt', () => {
    expect(formatScore({ type: 'cp', value: 134 })).toBe('+1.3')
    expect(formatScore({ type: 'cp', value: -40 })).toBe('−0.4')
    expect(formatScore({ type: 'cp', value: 2 })).toBe('0.0')
    expect(formatScore({ type: 'mate', value: 3 })).toBe('M3')
    expect(formatScore({ type: 'mate', value: -2 })).toBe('−M2')
  })
})
