import { describe, expect, it } from 'vitest'
import { buildRepertoire, playerNodes, positionKey, RepertoireError, type RepertoireData } from '../../core/openings/repertoire'
import { getRepertoires, REPERTOIRE_DATA } from './index'

describe('Repertoire-Daten', () => {
  it.each(REPERTOIRE_DATA.map((d) => [d.id, d] as const))('%s: alle Linien legal, erklärt und eindeutig', (_, data) => {
    const rep = buildRepertoire(data) // wirft bei Fehlern
    expect(rep.lines.length).toBeGreaterThanOrEqual(4)
    expect(rep.ideas.length).toBeGreaterThanOrEqual(3)
    for (const l of rep.lines) expect(l.moves.length).toBeGreaterThanOrEqual(8)
    // Jede eigene Stellung hat genau einen Repertoirezug
    for (const n of playerNodes(rep)) expect(n.edges).toHaveLength(1)
  })

  it('hat eindeutige Linien-IDs', () => {
    for (const d of REPERTOIRE_DATA) expect(new Set(d.lines.map((l) => l.id)).size).toBe(d.lines.length)
  })

  it('Erklärungen sind kurz genug fürs Handy', () => {
    for (const rep of getRepertoires())
      for (const n of rep.nodes.values()) for (const e of n.edges) expect(e.why.length, `${rep.id} ${e.san}`).toBeLessThan(260)
  })

  it('führt Zugumstellungen zusammen (London: Hauptlinie und …Sf6/…e6 enden gleich)', () => {
    const london = getRepertoires().find((r) => r.id === 'london')!
    const a = london.lines.find((l) => l.id === 'main-e6')!.keys.at(-1)
    const b = london.lines.find((l) => l.id === 'nf6-e6')!.keys.at(-1)
    expect(a).toBe(b)
  })
})

describe('buildRepertoire', () => {
  const base = (moves: { san: string; why?: string }[][]): RepertoireData => ({
    id: 't',
    name: 'T',
    color: 'w',
    tagline: '',
    summary: '',
    ideas: [],
    lines: moves.map((m, i) => ({ id: `l${i}`, name: '', summary: '', moves: m })),
  })

  it('meldet illegale Züge', () => {
    expect(() => buildRepertoire(base([[{ san: 'e5', why: 'x' }]]))).toThrow(RepertoireError)
  })
  it('verlangt beim ersten Auftreten eine Erklärung', () => {
    expect(() => buildRepertoire(base([[{ san: 'e4' }]]))).toThrow(/Erklärung/)
  })
  it('verbietet zwei eigene Züge in derselben Stellung', () => {
    expect(() => buildRepertoire(base([[{ san: 'e4', why: 'x' }], [{ san: 'd4', why: 'y' }]]))).toThrow(/zwei eigene Züge/)
  })
  it('erlaubt Verzweigungen beim Gegner', () => {
    const rep = buildRepertoire(
      base([
        [{ san: 'e4', why: 'x' }, { san: 'e5', why: 'a' }],
        [{ san: 'e4' }, { san: 'c5', why: 'b' }],
      ]),
    )
    const after = rep.nodes.get(positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'))!
    expect(after.edges.map((e) => e.san)).toEqual(['e5', 'c5'])
    expect(after.edges[0].lines).toEqual(['l0'])
  })
  it('verlangt korrekte SAN-Schreibweise', () => {
    expect(() => buildRepertoire(base([[{ san: 'e2e4', why: 'x' }]]))).toThrow()
  })
})
