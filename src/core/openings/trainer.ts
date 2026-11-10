import type { Color } from '../chess/game'
import { cardId, playerNodes, type Edge, type Repertoire, type RepNode } from './repertoire'
import { isDue, type StudyCard } from './srs'

/**
 * Ablauf einer Trainingseinheit – rein und deterministisch (Zufall wird injiziert).
 *  - learn:  eine gewählte Linie; dein Zug wird gezeigt und erklärt, du spielst ihn nach.
 *  - review: Abfrage nach Spaced Repetition; der Gegner wählt bevorzugt Abzweigungen,
 *            hinter denen fällige Karten liegen.
 */
export type TrainerMode = 'learn' | 'review'

export interface PlayedStep {
  san: string
  uci: string
  color: Color
  why: string
  /** Stellung vor dem Zug */
  fromKey: string
}

export interface Session {
  repId: string
  mode: TrainerMode
  lineId: string | null
  key: string
  steps: PlayedStep[]
  done: boolean
}

export function startSession(rep: Repertoire, mode: TrainerMode, lineId: string | null = null): Session {
  return { repId: rep.id, mode, lineId, key: rep.rootKey, steps: [], done: isLeaf(rep, rep.rootKey, mode, lineId) }
}

export const currentNode = (rep: Repertoire, s: Session): RepNode => rep.nodes.get(s.key)!

/** Züge, die in dieser Einheit von hier aus erlaubt sind */
export function edgesFor(rep: Repertoire, key: string, mode: TrainerMode, lineId: string | null): Edge[] {
  const node = rep.nodes.get(key)
  if (!node) return []
  return mode === 'learn' && lineId ? node.edges.filter((e) => e.lines.includes(lineId)) : node.edges
}

const isLeaf = (rep: Repertoire, key: string, mode: TrainerMode, lineId: string | null) => edgesFor(rep, key, mode, lineId).length === 0

export const isPlayerTurn = (rep: Repertoire, s: Session) => !s.done && currentNode(rep, s).turn === rep.color

/** Der erwartete eigene Zug in der aktuellen Stellung */
export function expectedEdge(rep: Repertoire, s: Session): Edge | null {
  if (!isPlayerTurn(rep, s)) return null
  return edgesFor(rep, s.key, s.mode, s.lineId)[0] ?? null
}

export function applyEdge(rep: Repertoire, s: Session, edge: Edge): Session {
  const node = currentNode(rep, s)
  const steps = [...s.steps, { san: edge.san, uci: edge.uci, color: node.turn, why: edge.why, fromKey: node.key }]
  return { ...s, key: edge.to, steps, done: isLeaf(rep, edge.to, s.mode, s.lineId) }
}

export type MoveCheck = { result: 'correct'; edge: Edge } | { result: 'wrong'; expected: Edge }

export function checkMove(rep: Repertoire, s: Session, uci: string): MoveCheck | null {
  const expected = expectedEdge(rep, s)
  if (!expected) return null
  // Umwandlung ohne Angabe als Dame werten
  const norm = (u: string) => (u.length === 4 ? u : u.slice(0, 5))
  return norm(uci) === norm(expected.uci) ? { result: 'correct', edge: expected } : { result: 'wrong', expected }
}

/**
 * Zählt fällige (bzw. noch unbekannte) Karten hinter einer Stellung – damit der Gegner
 * Abzweigungen wählt, in denen es etwas zu üben gibt.
 */
export function dueBehind(rep: Repertoire, key: string, cards: ReadonlyMap<string, StudyCard>, now: Date, seen = new Set<string>()): number {
  if (seen.has(key)) return 0
  seen.add(key)
  const node = rep.nodes.get(key)
  if (!node) return 0
  let count = 0
  if (node.turn === rep.color && node.edges.length) {
    const card = cards.get(cardId(rep.id, key))
    if (card && isDue(card, now)) count++
  }
  for (const e of node.edges) count += dueBehind(rep, e.to, cards, now, seen)
  return count
}

/** Gegnerzug wählen. Lernmodus: entlang der Linie. Übungsmodus: gewichtet nach fälligen Karten. */
export function chooseOpponentEdge(
  rep: Repertoire,
  s: Session,
  cards: ReadonlyMap<string, StudyCard>,
  now: Date,
  rng: () => number = Math.random,
): Edge | null {
  if (s.done || isPlayerTurn(rep, s)) return null
  const edges = edgesFor(rep, s.key, s.mode, s.lineId)
  if (edges.length <= 1) return edges[0] ?? null
  if (s.mode === 'learn') return edges[0]
  const weights = edges.map((e) => dueBehind(rep, e.to, cards, now))
  const total = weights.reduce((a, b) => a + b, 0)
  if (total === 0) return edges[Math.floor(rng() * edges.length)]
  let r = rng() * total
  for (let i = 0; i < edges.length; i++) {
    r -= weights[i]
    if (r < 0) return edges[i]
  }
  return edges[edges.length - 1]
}

export interface RepertoireProgress {
  total: number
  learned: number
  due: number
  /** Linien mit allen Karten gelernt */
  linesLearned: number
}

export function progress(rep: Repertoire, cards: ReadonlyMap<string, StudyCard>, now: Date): RepertoireProgress {
  const nodes = playerNodes(rep)
  const learnedKeys = new Set(nodes.filter((n) => cards.has(cardId(rep.id, n.key))).map((n) => n.key))
  const due = nodes.filter((n) => {
    const c = cards.get(cardId(rep.id, n.key))
    return c && isDue(c, now)
  }).length
  const linesLearned = rep.lines.filter((l) => l.keys.every((k) => !rep.nodes.get(k)?.edges.length || rep.nodes.get(k)!.turn !== rep.color || learnedKeys.has(k))).length
  return { total: nodes.length, learned: learnedKeys.size, due, linesLearned }
}

/** Ist jede eigene Stellung dieser Linie schon als Karte bekannt? */
export function lineLearned(rep: Repertoire, lineId: string, cards: ReadonlyMap<string, StudyCard>): boolean {
  return playerNodes(rep, lineId).every((n) => cards.has(cardId(rep.id, n.key)))
}
