import { describe, expect, it } from 'vitest'
import { analysis } from '../../test/analysis'
import { START_FEN } from '../chess/game'
import { buildHints } from './hints'
import { suggestPlans } from './plans'
import { threatsAgainst } from './threats'

describe('threatsAgainst', () => {
  it('erkennt eine Mattdrohung (Grundreihe)', () => {
    // Schwarz droht Te1#, Weiß am Zug
    const t = threatsAgainst('4r1k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 30', 'w')
    expect(t.mateIn1?.san).toBe('Re1#')
  })
  it('meldet hängende eigene Figuren', () => {
    const t = threatsAgainst('rnbqkbnr/pppp1ppp/8/8/4p3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4', 'w')
    expect(t.hanging.map((h) => h.square)).toEqual(['f3'])
    expect(t.mateIn1).toBeNull()
  })
})

describe('buildHints', () => {
  it('Stufe 1 Richtung, Stufe 2 Figur, Stufe 3 Zug mit Begründung', () => {
    const fen = '4k3/8/8/3n4/8/8/5PPP/3RK3 w - - 0 30'
    const [h1, h2, h3] = buildHints(fen, analysis(fen, [350, 'd1d5']))
    expect(h1).toMatchObject({ level: 1, title: 'Material gewinnen' })
    expect(h2).toMatchObject({ level: 2, square: 'd1', title: 'Mit deinem Turm geht es los' })
    expect(h3).toMatchObject({ level: 3, arrow: { from: 'd1', to: 'd5' } })
    expect(h3.text).toBe('Txd5 gewinnt den Springer auf d5 – er ist nicht ausreichend gedeckt.')
  })
  it('warnt vor einer Mattdrohung', () => {
    const fen = '4r1k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 30'
    const [h1] = buildHints(fen, analysis(fen, [0, 'h2h3']))
    expect(h1.title).toBe('Achtung, Mattdrohung!')
  })
  it('kündigt ein eigenes Matt an', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 30'
    const hints = buildHints(fen, analysis(fen, ['M1', 'a1a8']))
    expect(hints[0].title).toBe('Es gibt ein Matt!')
    expect(hints[2].text).toBe('Ta8# setzt matt.')
  })
  it('gibt in der Eröffnung Entwicklungs- oder Zentrumshinweise', () => {
    const [h1, , h3] = buildHints(START_FEN, analysis(START_FEN, [30, 'e2e4']))
    expect(h1.title).toBe('Zentrum')
    expect(h3.text).toBe('e4 besetzt das Zentrum.')
  })
  it('unterscheidet Decken und Wegziehen einer bedrohten Figur', () => {
    const scandi = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
    expect(buildHints(scandi, analysis(scandi, [20, 'd2d3']))[2].text).toBe('d3 deckt deinen Bauern auf e4.')
    const knight = 'rnbqkbnr/pppp1ppp/8/8/4p3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4'
    expect(buildHints(knight, analysis(knight, [0, 'f3d4']))[2].text).toBe('Sd4 bringt deinen Springer in Sicherheit.')
  })
  it('liefert nichts ohne Engine-Zug', () => {
    expect(buildHints(START_FEN, { fen: START_FEN, bestMove: null, lines: [] })).toEqual([])
  })
})

describe('Plan-Ideen (erweitert)', () => {
  it('stellt eine konkrete Idee aus der Engine-Variante voran (mit Zweck)', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
    const plans = suggestPlans(fen, 'w', 3, analysis(fen, [40, 'f1c4', 'g8f6', 'e1g1']))
    const idea = plans.find((p) => p.id === 'engine-idea')!
    expect(idea.title).toBe('Idee: Lc4, danach 0-0')
    expect(idea.why).toContain('Läufer entwickeln und König in Sicherheit')
  })
  it('ignoriert eine Engine-Analyse für eine andere Stellung', () => {
    const plans = suggestPlans(START_FEN, 'w', 3, analysis('8/8/8/8/8/8/8/K6k w - - 0 1', [0, 'a1a2']))
    expect(plans.some((p) => p.id === 'engine-idea')).toBe(false)
  })
  it('stellt das Verhindern eines Matts ganz nach vorn', () => {
    expect(suggestPlans('4r1k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 30', 'w')[0]).toMatchObject({ id: 'stop-mate', kind: 'danger' })
  })
  it('schlägt einen Springer-Vorposten vor', () => {
    // weißer Bauer e4 deckt d5, kein schwarzer c- oder e-Bauer kann d5 noch angreifen
    const fen = 'r1bq1rk1/pp3ppp/3p1n2/8/4P3/2N5/PPP2PPP/R1BQ1RK1 w - - 0 12'
    const posts = suggestPlans(fen, 'w', 6).find((p) => p.id === 'outpost')
    expect(posts?.title).toBe('Bring einen Springer auf den Vorposten d5')
  })
  it('schlägt einen Königsangriff vor, wenn der Bauernschutz Lücken hat', () => {
    // g-Bauer fehlt vor dem schwarzen König
    const fen = 'r1bq1rk1/ppp2p1p/2np1n2/8/4P3/2NB1N2/PPP2PPP/R2Q1RK1 w - - 0 10'
    const p = suggestPlans(fen, 'w', 6).find((x) => x.id === 'king-attack')
    expect(p?.why).toContain('g7')
  })
  it('nennt beim Verbessern einer Figur ein konkretes Zielfeld', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/B5K1 w - - 0 40'
    const p = suggestPlans(fen, 'w').find((x) => x.id === 'improve-worst')
    expect(p?.title).toMatch(/^Verbessere deinen Läufer: z\. B\. nach [a-h][1-8]$/)
  })
})
