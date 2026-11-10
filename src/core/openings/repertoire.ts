import { Chess } from 'chess.js'
import type { Color } from '../chess/game'

/** Rohdaten einer Eröffnung, wie sie in src/data/openings/*.json stehen. */
export interface RepertoireData {
  id: string
  name: string
  /** Farbe, die DU in diesem Repertoire spielst */
  color: Color
  tagline: string
  summary: string
  ideas: { title: string; text: string }[]
  lines: LineData[]
}

export interface LineData {
  id: string
  name: string
  summary: string
  /** Züge in englischer SAN; `why` darf fehlen, wenn der Zug in einer früheren Linie schon erklärt ist */
  moves: { san: string; why?: string }[]
}

/** Stellungsschlüssel: FEN ohne Zugzähler – so laufen Zugumstellungen zusammen. */
export const positionKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

export interface Edge {
  san: string
  uci: string
  why: string
  /** Schlüssel der Stellung nach dem Zug */
  to: string
  /** Linien, die diesen Zug enthalten */
  lines: string[]
}

export interface RepNode {
  key: string
  fen: string
  turn: Color
  edges: Edge[]
}

export interface Repertoire extends Omit<RepertoireData, 'lines'> {
  lines: (LineData & { keys: string[] })[]
  nodes: Map<string, RepNode>
  rootKey: string
}

export class RepertoireError extends Error {}

/**
 * Baut aus den Linien einen Stellungsgraphen. Wirft bei illegalen Zügen, fehlenden
 * Erklärungen oder wenn du in derselben Stellung zwei verschiedene Züge spielen sollst.
 */
export function buildRepertoire(data: RepertoireData): Repertoire {
  const nodes = new Map<string, RepNode>()
  const startFen = new Chess().fen()
  const getNode = (fen: string): RepNode => {
    const key = positionKey(fen)
    let n = nodes.get(key)
    if (!n) {
      n = { key, fen, turn: fen.split(' ')[1] as Color, edges: [] }
      nodes.set(key, n)
    }
    return n
  }
  const root = getNode(startFen)
  const lines: Repertoire['lines'] = []

  for (const line of data.lines) {
    const chess = new Chess()
    const keys = [root.key]
    line.moves.forEach((m, i) => {
      const node = getNode(chess.fen())
      let move
      try {
        move = chess.move(m.san)
      } catch {
        throw new RepertoireError(`${data.id}/${line.id}: Zug ${i + 1} „${m.san}“ ist illegal`)
      }
      if (move.san !== m.san) throw new RepertoireError(`${data.id}/${line.id}: „${m.san}“ sollte „${move.san}“ geschrieben werden`)
      const to = getNode(chess.fen()).key
      let edge = node.edges.find((e) => e.san === move.san)
      if (!edge) {
        if (!m.why) throw new RepertoireError(`${data.id}/${line.id}: Zug ${i + 1} „${m.san}“ braucht eine Erklärung`)
        if (node.turn === data.color && node.edges.length > 0) {
          throw new RepertoireError(
            `${data.id}/${line.id}: In derselben Stellung stehen zwei eigene Züge (${node.edges[0].san} und ${move.san})`,
          )
        }
        edge = { san: move.san, uci: move.from + move.to + (move.promotion ?? ''), why: m.why, to, lines: [] }
        node.edges.push(edge)
      }
      if (!edge.lines.includes(line.id)) edge.lines.push(line.id)
      keys.push(to)
    })
    lines.push({ ...line, keys })
  }
  return { ...data, lines, nodes, rootKey: root.key }
}

/** Stellungen, in denen DU am Zug bist und einen Repertoirezug kennen musst (= Lernkarten). */
export function playerNodes(rep: Repertoire, lineId?: string): RepNode[] {
  const keys = lineId ? new Set(rep.lines.find((l) => l.id === lineId)?.keys ?? []) : null
  return [...rep.nodes.values()].filter((n) => n.turn === rep.color && n.edges.length > 0 && (!keys || keys.has(n.key)))
}

/** Eindeutige ID einer Lernkarte */
export const cardId = (repId: string, key: string) => `${repId}|${key}`
