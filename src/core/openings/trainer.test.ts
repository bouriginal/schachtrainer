import { describe, expect, it } from 'vitest'
import { getRepertoire } from '../../data/openings'
import { cardId, playerNodes } from './repertoire'
import { formatDue, gradeCard, introduceCard, isDue, type StudyCard } from './srs'
import { applyEdge, checkMove, chooseOpponentEdge, dueBehind, expectedEdge, isPlayerTurn, lineLearned, progress, startSession } from './trainer'

const london = getRepertoire('london')!
const caro = getRepertoire('caro-kann')!
const NOW = new Date('2026-11-10T10:00:00Z')
const later = (min: number) => new Date(NOW.getTime() + min * 60_000)

/** Alle Karten einer Linie einführen */
function learnLine(rep: typeof london, lineId: string, at = NOW) {
  const cards = new Map<string, StudyCard>()
  for (const n of playerNodes(rep, lineId)) cards.set(cardId(rep.id, n.key), introduceCard(cardId(rep.id, n.key), rep.id, n.key, n.edges[0].san, at))
  return cards
}

describe('Spaced Repetition', () => {
  it('plant neue Karten kurzfristig und richtige Antworten immer später', () => {
    const c = introduceCard('x', 'r', 'k', 'e4', NOW)
    expect(isDue(c, NOW)).toBe(false)
    expect(isDue(c, later(11))).toBe(true)
    const g1 = gradeCard(c, 'correct', later(11))
    const g2 = gradeCard(g1, 'correct', g1.fsrs.due)
    expect(g2.fsrs.due.getTime() - g1.fsrs.due.getTime()).toBeGreaterThan(g1.fsrs.due.getTime() - later(11).getTime())
  })
  it('holt falsch beantwortete Karten schnell zurück', () => {
    const c = gradeCard(gradeCard(introduceCard('x', 'r', 'k', 'e4', NOW), 'correct', later(11)), 'correct', later(4000))
    const wrong = gradeCard(c, 'wrong', later(4000 + 60 * 24 * 3))
    expect(wrong.fsrs.due.getTime() - later(4000 + 60 * 24 * 3).getTime()).toBeLessThan(60 * 60_000)
    expect(wrong.fsrs.lapses).toBe(1)
  })
  it('bewertet Hinweis schlechter als richtig', () => {
    const c = gradeCard(introduceCard('x', 'r', 'k', 'e4', NOW), 'correct', later(11))
    expect(gradeCard(c, 'hint', later(3000)).fsrs.due.getTime()).toBeLessThan(gradeCard(c, 'correct', later(3000)).fsrs.due.getTime())
  })
  it('formatiert Fälligkeiten', () => {
    expect(formatDue(NOW, NOW)).toBe('jetzt')
    expect(formatDue(later(10), NOW)).toBe('in 10 Min.')
    expect(formatDue(later(60 * 24), NOW)).toBe('morgen')
    expect(formatDue(later(60 * 24 * 4), NOW)).toBe('in 4 Tagen')
  })
})

describe('Trainer-Ablauf', () => {
  it('Lernmodus als Weiß: erst eigener Zug, dann Gegner entlang der Linie', () => {
    let s = startSession(london, 'learn', 'qb6-trap')
    expect(isPlayerTurn(london, s)).toBe(true)
    expect(expectedEdge(london, s)?.san).toBe('d4')
    expect(checkMove(london, s, 'e2e4')).toMatchObject({ result: 'wrong', expected: { san: 'd4' } })
    const ok = checkMove(london, s, 'd2d4')
    expect(ok?.result).toBe('correct')
    s = applyEdge(london, s, ok!.result === 'correct' ? ok!.edge : null!)
    // Gegner folgt der Linie (…d5), obwohl auch …Sf6 im Repertoire steht
    const opp = chooseOpponentEdge(london, s, new Map(), NOW)
    expect(opp?.san).toBe('d5')
  })

  it('spielt eine Linie bis zum Ende und meldet fertig', () => {
    let s = startSession(caro, 'learn', 'advance')
    let guard = 0
    while (!s.done && guard++ < 50) {
      const edge = isPlayerTurn(caro, s) ? expectedEdge(caro, s)! : chooseOpponentEdge(caro, s, new Map(), NOW)!
      s = applyEdge(caro, s, edge)
    }
    expect(s.done).toBe(true)
    expect(s.steps.map((x) => x.san).join(' ')).toBe('e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 O-O Nc6 c3 cxd4 cxd4 Nge7')
    expect(s.steps[1]).toMatchObject({ color: 'b', san: 'c6' })
  })

  it('Übungsmodus: Gegner wählt die Abzweigung mit fälligen Karten', () => {
    // nur die Vorstoßvariante gelernt und fällig
    const cards = learnLine(caro, 'advance')
    let s = startSession(caro, 'review')
    s = applyEdge(caro, s, caro.nodes.get(s.key)!.edges[0]) // 1.e4
    s = applyEdge(caro, s, expectedEdge(caro, s)!) // …c6
    for (let i = 0; i < 20; i++) {
      // nach 1.e4 c6 zweigt Weiß zwischen 2.d4 und 2.Sc3 ab
      expect(chooseOpponentEdge(caro, s, cards, later(20), () => i / 20)?.san).toBe('d4')
    }
  })

  it('zählt fällige Karten hinter einer Stellung', () => {
    const cards = learnLine(caro, 'advance')
    expect(dueBehind(caro, caro.rootKey, cards, NOW)).toBe(0)
    expect(dueBehind(caro, caro.rootKey, cards, later(20))).toBe(8)
  })

  it('berechnet den Fortschritt', () => {
    const cards = learnLine(caro, 'advance')
    const p = progress(caro, cards, later(20))
    expect(p).toMatchObject({ learned: 8, due: 8, linesLearned: 1 })
    expect(p.total).toBeGreaterThan(20)
    expect(lineLearned(caro, 'advance', cards)).toBe(true)
    expect(lineLearned(caro, 'classical', cards)).toBe(false)
  })
})
