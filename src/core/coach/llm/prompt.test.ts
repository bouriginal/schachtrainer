import { describe, expect, it } from 'vitest'
import { analysis } from '../../../test/analysis'
import { reviewMove } from '../explain'
import { buildExplainPrompt, SYSTEM_PROMPT, toExplainRequest, validateExplainRequest } from './prompt'

const ITALIAN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
const review = reviewMove({
  fenBefore: ITALIAN,
  uci: 'f3e5',
  before: analysis(ITALIAN, [40, 'f1b5', 'a7a6']),
  after: analysis('r1bqkbnr/pppp1ppp/2n5/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3', [-250, 'c6e5', 'd2d4']),
})!

describe('Claude-Prompt', () => {
  it('enthält Stellung, Zug, Engine-Linien und Heuristiken in deutscher Notation', () => {
    const p = buildExplainPrompt(toExplainRequest(review))
    expect(p).toContain(`FEN): ${ITALIAN}`)
    expect(p).toContain('Ich spiele Weiß und habe Sxe5 gezogen.')
    expect(p).toContain('Patzer')
    expect(p).toContain('Bester Zug laut Engine: Lb5')
    expect(p).toContain('Sxe5 d4')
    expect(p).toContain('"kind":"hanging_after"')
  })
  it('gibt im Systemprompt Zielgruppe, Sprache und Regeln vor', () => {
    expect(SYSTEM_PROMPT).toMatch(/500–600 Elo/)
    expect(SYSTEM_PROMPT).toMatch(/Deutsch/)
    expect(SYSTEM_PROMPT).toMatch(/erfinde keine Varianten/)
  })
  it('akzeptiert gültige und lehnt kaputte oder zu große Anfragen ab', () => {
    const req = toExplainRequest(review)
    expect(validateExplainRequest(JSON.parse(JSON.stringify(req)))).not.toBeNull()
    expect(validateExplainRequest(null)).toBeNull()
    expect(validateExplainRequest({ ...req, mover: 'x' })).toBeNull()
    expect(validateExplainRequest({ ...req, coachText: ['x'.repeat(9000)] })).toBeNull()
  })
})
