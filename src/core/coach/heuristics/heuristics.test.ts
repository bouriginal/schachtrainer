import { describe, expect, it } from 'vitest'
import { START_FEN } from '../../chess/game'
import { buildContext } from '../context'
import type { Finding } from '../findings'
import { center } from './center'
import { development } from './development'
import { kingInCenterAfter, kingSafetyOfMove } from './kingSafety'
import { pawnStructureChange } from './pawnStructure'
import { hangingAfter, replyAttack, tacticsOfMove } from './tactics'

const ctx = (fen: string, uci: string) => {
  const c = buildContext(fen, uci)
  if (!c) throw new Error(`illegal ${uci}`)
  return c
}
const kinds = (fs: Finding[]) => fs.map((f) => f.kind)

const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
const AFTER_E4_E5_NF3_NC6 = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
// Londoner System, Damen-/c-Bauern getauscht, Weiß hat e3 noch nicht gezogen
const LONDON = 'rnbqkbnr/pp3ppp/4p3/3p4/5B2/8/PPP1PPPP/RN1QKBNR w KQkq - 0 5'

describe('Entwicklung', () => {
  it('lobt das Entwickeln einer Leichtfigur', () => {
    expect(kinds(development(ctx(AFTER_E4_E5, 'g1f3'), 'move'))).toEqual(['develops'])
  })
  it('warnt vor zu früher Dame', () => {
    expect(kinds(development(ctx(AFTER_E4_E5, 'd1h5'), 'move'))).toEqual(['early_queen'])
  })
  it('warnt, wenn dieselbe Figur ohne Not erneut zieht', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
    expect(kinds(development(ctx(fen, 'f3g5'), 'move'))).toEqual(['moved_twice'])
  })
  it('meldet nichts, wenn die Figur angegriffen war und flieht', () => {
    // Springer f3 von Bauer e4 angegriffen
    const fen = 'rnbqkbnr/pppp1ppp/8/8/4p3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4'
    expect(kinds(development(ctx(fen, 'f3d4'), 'move'))).toEqual([])
  })
})

describe('Zentrum', () => {
  it('lobt Bauern ins Zentrum', () => {
    expect(kinds(center(ctx(START_FEN, 'e2e4'), 'move'))).toEqual(['center_pawn'])
  })
  it('kritisiert frühe Randbauernzüge', () => {
    expect(kinds(center(ctx(START_FEN, 'h2h4'), 'move'))).toEqual(['flank_pawn'])
  })
  it('ignoriert Bauernzüge im Mittelspiel', () => {
    expect(center(ctx('k7/8/8/8/8/8/7P/K7 w - - 0 30', 'h2h4'), 'move')).toEqual([])
  })
})

describe('Königssicherheit', () => {
  it('erkennt die Rochade', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'
    expect(kingSafetyOfMove(ctx(fen, 'e1g1'), 'move')).toMatchObject([{ kind: 'castled', side: 'king' }])
  })
  it('warnt vor Königszug mit Verlust des Rochaderechts', () => {
    expect(kinds(kingSafetyOfMove(ctx(AFTER_E4_E5, 'e1e2'), 'move'))).toEqual(['lost_castling'])
  })
  it('warnt vor Bauernzügen vor dem rochierten König', () => {
    const fen = 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 w - - 2 6'
    expect(kinds(kingSafetyOfMove(ctx(fen, 'g2g4'), 'move'))).toEqual(['pawn_shield'])
    expect(kingSafetyOfMove(ctx(fen, 'a2a3'), 'move')).toEqual([])
  })
  it('meldet den König in der Mitte, wenn die Gegnerantwort sein Umfeld angreift', () => {
    const mine = ctx(LONDON, 'b1c3')
    const reply = ctx(mine.fenAfter, 'd8b6')
    expect(kingInCenterAfter(mine, reply)).toMatchObject([{ kind: 'king_in_center', square: 'e1' }])
  })
  it('meldet den König in der Mitte in der frühen Eröffnung bei geschlossenem Zentrum nicht', () => {
    expect(kingInCenterAfter(ctx(AFTER_E4_E5, 'g1f3'), null)).toEqual([])
  })
})

describe('Taktik', () => {
  it('erkennt eine Springergabel gegen König und Turm', () => {
    const fen = 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 30'
    const [fork] = tacticsOfMove(ctx(fen, 'b5c7'), 'move')
    expect(fork.kind).toBe('fork')
    expect(fork.targets?.map((t) => t.square).sort()).toEqual(['a8', 'e8'])
  })
  it('erkennt Materialgewinn durch Schlagen einer ungedeckten Figur', () => {
    const fen = '4k3/8/8/3n4/8/8/8/3RK3 w - - 0 30'
    expect(tacticsOfMove(ctx(fen, 'd1d5'), 'move')).toMatchObject([{ kind: 'wins_material', piece: 'n', square: 'd5', value: 3 }])
  })
  it('erkennt Matt', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 30'
    expect(kinds(tacticsOfMove(ctx(fen, 'a1a8'), 'move'))).toEqual(['gives_mate'])
  })
  it('meldet eine hängende Figur, wenn die Engine sie schlägt', () => {
    const mine = ctx(AFTER_E4_E5_NF3_NC6, 'f3e5')
    const reply = ctx(mine.fenAfter, 'c6e5')
    expect(hangingAfter(mine, reply)).toMatchObject([{ kind: 'hanging_after', piece: 'n', square: 'e5', wasBefore: false, san: 'Nxe5' }])
  })
  it('meldet keine hängende Figur, wenn die Engine sie nicht schlägt (taktisch gedeckt)', () => {
    const mine = ctx(AFTER_E4_E5_NF3_NC6, 'f3e5')
    const reply = ctx(mine.fenAfter, 'd8g5')
    expect(hangingAfter(mine, reply)).toEqual([])
  })
  it('erkennt den Doppelangriff …Db6 auf b2 und f2', () => {
    const mine = ctx(LONDON, 'b1c3')
    const [f] = replyAttack(ctx(mine.fenAfter, 'd8b6'))
    expect(f.kind).toBe('reply_attack')
    expect(f.san).toBe('Qb6')
    expect(f.targets?.map((t) => t.square)).toEqual(['b2', 'f2'])
  })
})

describe('Verteidigung', () => {
  // 1.e4 d5: e4 wird vom Bauern d5 angegriffen
  const SCANDI = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
  it('erkennt das Schlagen des Angreifers', () => {
    expect(tacticsOfMove(ctx(SCANDI, 'e4d5'), 'move')).toMatchObject([{ kind: 'removes_attacker', piece: 'p', square: 'd5', targets: [{ square: 'e4', type: 'p' }] }])
  })
  it('erkennt das Decken der bedrohten Figur', () => {
    expect(kinds(tacticsOfMove(ctx(SCANDI, 'b1c3'), 'move'))).toEqual(['saves_piece'])
  })
  it('meldet nichts, wenn die Figur weiter hängt', () => {
    expect(tacticsOfMove(ctx(SCANDI, 'h2h3'), 'move')).toEqual([])
  })
  it('wertet Schlagen im Zentrum nicht als Zentrumsbesetzung', () => {
    expect(center(ctx(SCANDI, 'e4d5'), 'move')).toEqual([])
  })
})

describe('Bauernstruktur', () => {
  it('erkennt neue Doppelbauern', () => {
    const fen = 'k7/8/8/8/3p4/2P5/3P4/K7 w - - 0 30'
    expect(kinds(pawnStructureChange(ctx(fen, 'c3d4'), 'move'))).toContain('doubled_pawns')
  })
  it('erkennt einen neu entstandenen Freibauern', () => {
    const fen = 'k7/8/3p4/4P3/8/8/8/K7 w - - 0 30'
    expect(kinds(pawnStructureChange(ctx(fen, 'e5d6'), 'move'))).toContain('passed_pawn')
  })
})
