import { describe, expect, it } from 'vitest'
import { analysis } from '../../test/analysis'
import { START_FEN } from '../chess/game'
import { classifyMove } from './classify'
import { reviewMove } from './explain'

const LONDON = 'rnbqkbnr/pp3ppp/4p3/3p4/5B2/8/PPP1PPPP/RN1QKBNR w KQkq - 0 5'
const LONDON_NC3 = 'rnbqkbnr/pp3ppp/4p3/3p4/5B2/2N5/PPP1PPPP/R2QKBNR b KQkq - 1 5'
const ITALIAN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
const ITALIAN_NXE5 = 'r1bqkbnr/pppp1ppp/2n5/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3'

describe('classifyMove', () => {
  const cp = (value: number) => ({ type: 'cp' as const, value })
  it('stuft nach Verlust an Gewinnchance ein', () => {
    expect(classifyMove(cp(30), cp(25), 'w', false).moveClass).toBe('good')
    expect(classifyMove(cp(30), cp(-20), 'w', false).moveClass).toBe('good')
    expect(classifyMove(cp(30), cp(-60), 'w', false).moveClass).toBe('inaccuracy')
    expect(classifyMove(cp(30), cp(-100), 'w', false).moveClass).toBe('mistake')
    expect(classifyMove(cp(30), cp(-400), 'w', false).moveClass).toBe('blunder')
  })
  it('rechnet für Schwarz aus der richtigen Perspektive', () => {
    // Schwarz verschlechtert sich von −0.3 auf +4.0 (Sicht Weiß)
    expect(classifyMove(cp(-30), cp(400), 'b', false).moveClass).toBe('blunder')
    expect(classifyMove(cp(-30), cp(-40), 'b', false).moveClass).toBe('good')
  })
  it('markiert den Engine-Zug als besten Zug', () => {
    expect(classifyMove(cp(30), cp(30), 'w', true).moveClass).toBe('best')
  })
  it('bewertet in klar gewonnener Stellung kleine Ungenauigkeiten milde', () => {
    expect(classifyMove(cp(900), cp(700), 'w', false).moveClass).toBe('good')
  })
  it('wertet ein verpasstes Matt mindestens als Fehler', () => {
    expect(classifyMove({ type: 'mate', value: 2 }, cp(900), 'w', false).moveClass).toBe('mistake')
  })
})

describe('reviewMove', () => {
  it('erklärt das Beispiel: König in der Mitte und …Db6 greift b2 und f2 an', () => {
    const r = reviewMove({
      fenBefore: LONDON,
      uci: 'b1c3',
      before: analysis(LONDON, [20, 'e2e3', 'b8c6', 'g1f3'], [5, 'c2c3']),
      after: analysis(LONDON_NC3, [-90, 'd8b6', 'a1b1', 'f8b4']),
    })!
    expect(r.moveClass).toBe('mistake')
    expect(r.sentences[0]).toBe('Mit diesem Zug bleibt dein König in der Mitte, und Schwarz kann mit …Db6 b2 und f2 angreifen.')
    expect(r.sentences.at(-1)).toMatch(/^Besser war e3/)
    expect(r.arrows).toEqual(
      expect.arrayContaining([
        { from: 'e2', to: 'e3', kind: 'best' },
        { from: 'd8', to: 'b6', kind: 'threat' },
      ]),
    )
    expect(r.highlights).toMatchObject({ b2: 'danger', f2: 'danger' })
  })

  it('erklärt eine hängende Figur samt Schlagzug und besserer Alternative', () => {
    const r = reviewMove({
      fenBefore: ITALIAN,
      uci: 'f3e5',
      before: analysis(ITALIAN, [40, 'f1b5', 'a7a6']),
      after: analysis(ITALIAN_NXE5, [-250, 'c6e5', 'd2d4']),
    })!
    expect(r.moveClass).toBe('blunder')
    expect(r.sentences[0]).toBe('Danach ist dein Springer auf e5 nicht ausreichend gedeckt – Schwarz schlägt mit …Sxe5.')
    expect(r.sentences[1]).toMatch(/^Besser war Lb5/)
    expect(r.highlights.e5).toBe('danger')
  })

  it('nennt den Grund, wenn der beste Zug Material gewonnen hätte', () => {
    const fen = '4k3/8/8/3n4/8/8/5PPP/3RK3 w - - 0 30'
    const r = reviewMove({
      fenBefore: fen,
      uci: 'h2h3',
      before: analysis(fen, [350, 'd1d5']),
      after: analysis('4k3/8/8/3n4/8/7P/5PP1/3RK3 b - - 0 30', [0, 'd5f4']),
    })!
    expect(r.moveClass).toBe('blunder')
    expect(r.sentences.at(-1)).toBe('Besser war Txd5: damit hättest du den Springer auf d5 gewonnen – er war nicht ausreichend gedeckt.')
  })

  it('begründet den besseren Zug mit dem Schlagen des Angreifers (1.e4 d5 2.La6??)', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
    const r = reviewMove({
      fenBefore: fen,
      uci: 'f1a6',
      before: analysis(fen, [50, 'e4d5', 'd8d5', 'b1c3']),
      after: analysis('rnbqkbnr/ppp1pppp/B7/3p4/4P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 2', [-700, 'b8a6', 'b1c3']),
    })!
    expect(r.sentences).toEqual([
      'Danach ist dein Läufer auf a6 nicht ausreichend gedeckt – Schwarz schlägt mit …Sxa6.',
      'Besser war exd5: damit hättest du den Bauern auf d5 geschlagen, der deinen Bauern auf e4 angreift.',
    ])
  })

  it('weist auf verpasstes Matt hin', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 30'
    const r = reviewMove({
      fenBefore: fen,
      uci: 'g1f1',
      before: analysis(fen, ['M1', 'a1a8']),
      after: analysis('6k1/5ppp/8/8/8/8/5PPP/R4K2 b - - 1 30', [500, 'h7h6']),
    })!
    expect(r.sentences.at(-1)).toBe('Besser war Ta8#: damit hättest du sofort mattgesetzt.')
  })

  it('lobt gute Züge mit Begründung', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'
    const r = reviewMove({
      fenBefore: fen,
      uci: 'e1g1',
      before: analysis(fen, [35, 'e1g1']),
      after: analysis('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4', [35, 'g8f6']),
    })!
    expect(r.moveClass).toBe('best')
    expect(r.sentences[0]).toMatch(/kurzen Rochade/)
    expect(r.arrows).toEqual([])
  })

  it('lobt einen Eröffnungszug ins Zentrum', () => {
    const r = reviewMove({
      fenBefore: START_FEN,
      uci: 'e2e4',
      before: analysis(START_FEN, [30, 'e2e4'], [28, 'd2d4']),
      after: analysis('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', [30, 'e7e5']),
    })!
    expect(r.label).toBe('Bester Zug')
    expect(r.sentences).toEqual(['Der Bauer besetzt das Zentrum und nimmt dem Gegner wichtige Felder weg.'])
  })

  it('fällt bei Fehlern ohne erkanntes Motiv auf die Engine-Linie zurück', () => {
    const fen = 'k7/8/8/8/8/8/8/K6R w - - 0 40'
    const r = reviewMove({
      fenBefore: fen,
      uci: 'a1b1',
      before: analysis(fen, [600, 'h1h8']),
      after: analysis('k7/8/8/8/8/8/8/1K5R b - - 1 40', [300, 'a8b7', 'h1h7']),
    })!
    expect(r.sentences[0]).toBe('Du stehst zwar noch besser, verschenkst aber einen Teil deines Vorteils – die Engine zeigt …Kb7 Th7+.')
  })

  it('sagt "steht besser" nur, wenn der Gegner wirklich besser steht', () => {
    const fen = 'k7/8/8/8/8/8/8/K6R w - - 0 40'
    const r = reviewMove({
      fenBefore: fen,
      uci: 'a1b1',
      before: analysis(fen, [50, 'h1h8']),
      after: analysis('k7/8/8/8/8/8/8/1K5R b - - 1 40', [-200, 'a8b7']),
    })!
    expect(r.sentences[0]).toBe('Danach steht Schwarz besser – die Engine zeigt …Kb7.')
  })

  it('erklärt schwarze Züge aus Sicht von Schwarz', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2'
    const r = reviewMove({
      fenBefore: fen,
      uci: 'd8h4',
      before: analysis(fen, [-30, 'b8c6']),
      after: analysis('rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', [200, 'f3h4']),
    })!
    expect(r.moveClass).toBe('blunder')
    expect(r.sentences[0]).toBe('Danach ist deine Dame auf h4 nicht ausreichend gedeckt – Weiß schlägt mit Sxh4.')
    expect(r.sentences.at(-1)).toMatch(/^Besser war …Sc6: damit hättest du deinen Bauern auf e5 in Sicherheit gebracht/)
  })

  it('liefert null bei illegalem Zug', () => {
    expect(reviewMove({ fenBefore: START_FEN, uci: 'e2e5', before: analysis(START_FEN), after: analysis(START_FEN) })).toBeNull()
  })
})
