import type { Square } from 'chess.js'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { germanSan, sideName } from '../../core/chess/board'
import { applyMove, START_FEN } from '../../core/chess/game'
import { reviewMove } from '../../core/coach/explain'
import { showMove } from '../../core/coach/text/de'
import { AbortedError, type EngineClient } from '../../core/engine/types'
import { cardId, playerNodes, type Edge, type Repertoire } from '../../core/openings/repertoire'
import { gradeCard, introduceCard, type Outcome, type StudyCard } from '../../core/openings/srs'
import {
  applyEdge,
  checkMove,
  chooseOpponentEdge,
  currentNode,
  expectedEdge,
  isPlayerTurn,
  startSession,
  type Session,
  type TrainerMode,
} from '../../core/openings/trainer'
import type { CardRepository } from '../../core/storage/db'

export interface TrainerArrow {
  from: Square
  to: Square
  kind: 'expected' | 'played'
}

export interface Feedback {
  tone: 'info' | 'correct' | 'wrong' | 'done'
  title: string
  lines: string[]
  arrows: TrainerArrow[]
  /** Feld, das als Hinweis markiert wird */
  hintSquare?: Square
}

export interface TrainerState {
  rep: Repertoire | null
  session: Session | null
  cards: Map<string, StudyCard>
  cardsLoaded: boolean
  feedback: Feedback | null
  /** Coach analysiert gerade einen falschen Zug */
  explaining: boolean
  /** Versuche in der aktuellen Stellung */
  attempt: { wrong: boolean; hints: number }
  score: { correct: number; hinted: number; wrong: number }

  loadCards(): Promise<void>
  start(rep: Repertoire, mode: TrainerMode, lineId?: string | null): void
  playerMove(from: string, to: string, promotion?: string): boolean
  hint(): void
  fen(): string
  dispose(): void
}

export interface TrainerDeps {
  engine: EngineClient
  cards: CardRepository
  now?: () => Date
  rng?: () => number
  /** Pause vor dem Gegnerzug, damit man die Erklärung lesen kann */
  opponentDelayMs?: number
  analysisDepth?: number
}

const ARROW = (e: Edge, kind: TrainerArrow['kind']): TrainerArrow => ({ from: e.uci.slice(0, 2) as Square, to: e.uci.slice(2, 4) as Square, kind })

export function createTrainerStore(deps: TrainerDeps): StoreApi<TrainerState> {
  const { engine, cards: cardRepo, now = () => new Date(), rng = Math.random, opponentDelayMs = 900, analysisDepth = 12 } = deps
  let timer: ReturnType<typeof setTimeout> | null = null
  let controller = new AbortController()

  return createStore<TrainerState>((set, get) => {
    const clearPending = () => {
      if (timer) clearTimeout(timer)
      timer = null
      controller.abort()
      controller = new AbortController()
    }

    const rep = () => get().rep!
    const session = () => get().session!

    const saveCards = (list: StudyCard[]) => {
      const cards = new Map(get().cards)
      for (const c of list) cards.set(c.id, c)
      set({ cards })
      void cardRepo.putMany(list).catch((e) => console.warn('Karten nicht gespeichert', e))
    }

    /** Eine Karte bewerten (pro Stellung nur einmal pro Durchgang) */
    const grade = (key: string, san: string, outcome: Outcome, played?: string) => {
      const r = rep()
      const id = cardId(r.id, key)
      const t = now()
      const existing = get().cards.get(id)
      const card = existing ? gradeCard(existing, outcome, t) : outcome === 'correct' ? introduceCard(id, r.id, key, san, t) : gradeCard(introduceCard(id, r.id, key, san, t), outcome, t)
      saveCards([card])
      void cardRepo.log({ repId: r.id, key, san, outcome, played, at: t.getTime() }).catch(() => {})
    }

    /** Hinweistext für deinen nächsten Zug */
    const promptForPlayer = (prefix: string[] = []): Feedback => {
      const r = rep()
      const s = session()
      const exp = expectedEdge(r, s)!
      if (s.mode === 'learn') {
        return {
          tone: 'info',
          title: `Jetzt du: ${showMove(exp.san, r.color)}`,
          lines: [...prefix, exp.why],
          arrows: [ARROW(exp, 'expected')],
        }
      }
      return { tone: 'info', title: 'Was spielst du hier?', lines: prefix, arrows: [] }
    }

    const opponentText = (e: Edge, color: 'w' | 'b') => `${sideName(color)} spielt ${showMove(e.san, color)}: ${e.why}`

    const finish = () => {
      const r = rep()
      const s = session()
      if (s.mode === 'learn' && s.lineId) {
        const t = now()
        const fresh = playerNodes(r, s.lineId)
          .filter((n) => !get().cards.has(cardId(r.id, n.key)))
          .map((n) => introduceCard(cardId(r.id, n.key), r.id, n.key, n.edges[0].san, t))
        if (fresh.length) saveCards(fresh)
      }
      const sc = get().score
      const total = sc.correct + sc.hinted + sc.wrong
      const line = r.lines.find((l) => l.id === s.lineId)
      // Der letzte Zug ist oft die Pointe der Linie – seine Erklärung bleibt sichtbar
      const lastStep = s.steps.at(-1)
      const lastWhy = lastStep ? `${lastStep.color === r.color ? 'Dein letzter Zug' : `${sideName(lastStep.color)} zuletzt`} ${showMove(lastStep.san, lastStep.color)}: ${lastStep.why}` : null
      set({
        feedback: {
          tone: 'done',
          title: s.mode === 'learn' ? 'Linie gelernt!' : 'Durchgang geschafft!',
          lines: [
            ...(lastWhy ? [lastWhy] : []),
            s.mode === 'learn'
              ? `Die Züge kommen jetzt in deine Wiederholung – die erste Abfrage ist in etwa 10 Minuten fällig.`
              : `${sc.correct} von ${total} Zügen auf Anhieb richtig${sc.hinted ? `, ${sc.hinted} mit Hinweis` : ''}${sc.wrong ? `, ${sc.wrong} falsch` : ''}.`,
            ...(line ? [`Worum es geht: ${line.summary}`] : []),
          ],
          arrows: [],
        },
      })
    }

    const opponentStep = () => {
      const r = rep()
      let s = session()
      const edge = chooseOpponentEdge(r, s, get().cards, now(), rng)
      if (!edge) return finish()
      const color = currentNode(r, s).turn
      s = applyEdge(r, s, edge)
      set({ session: s, attempt: { wrong: false, hints: 0 } })
      if (s.done) {
        set({ feedback: { tone: 'info', title: '', lines: [opponentText(edge, color)], arrows: [] } })
        return finish()
      }
      set({ feedback: promptForPlayer([opponentText(edge, color)]) })
    }

    const scheduleOpponent = () => {
      timer = setTimeout(() => {
        timer = null
        opponentStep()
      }, opponentDelayMs)
    }

    /** Coach: Warum ist der gespielte Zug schlechter als der Repertoirezug? (läuft asynchron) */
    const explainDeviation = async (fenBefore: string, playedUci: string, playedSan: string, expected: Edge) => {
      const signal = controller.signal
      set({ explaining: true })
      try {
        const before = await engine.analyze(fenBefore, { depth: analysisDepth, multiPv: 3, signal })
        const after = await engine.analyze(applyMove(fenBefore, playedUci.slice(0, 2), playedUci.slice(2, 4), playedUci[4])!.fenAfter, { depth: analysisDepth, multiPv: 1, signal })
        if (signal.aborted) return
        const review = reviewMove({ fenBefore, uci: playedUci, before, after })
        const fb = get().feedback
        if (!review || !fb || fb.tone !== 'wrong') return
        const r = rep()
        const extra =
          review.moveClass === 'best' || review.moveClass === 'good'
            ? [`Coach: ${germanSan(playedSan)} ist laut Engine auch spielbar – aber mit ${showMove(expected.san, r.color)} bleibst du in deinem Repertoire, dessen Pläne du kennst.`]
            : [`Coach (${review.label}): ${review.sentences.filter((x) => !x.startsWith('Besser war')).join(' ')}`]
        set({ feedback: { ...fb, lines: [...fb.lines, ...extra] } })
      } catch (e) {
        if (!(e instanceof AbortedError)) console.warn('Coach-Analyse fehlgeschlagen', e)
      } finally {
        if (!signal.aborted) set({ explaining: false })
      }
    }

    return {
      rep: null,
      session: null,
      cards: new Map(),
      cardsLoaded: false,
      feedback: null,
      explaining: false,
      attempt: { wrong: false, hints: 0 },
      score: { correct: 0, hinted: 0, wrong: 0 },

      async loadCards() {
        const list = await cardRepo.all()
        set({ cards: new Map(list.map((c) => [c.id, c])), cardsLoaded: true })
      },

      fen() {
        const s = get().session
        return s ? get().rep!.nodes.get(s.key)!.fen : START_FEN
      },

      start(r, mode, lineId = null) {
        clearPending()
        const s = startSession(r, mode, lineId)
        set({ rep: r, session: s, attempt: { wrong: false, hints: 0 }, score: { correct: 0, hinted: 0, wrong: 0 }, explaining: false })
        if (isPlayerTurn(r, s)) set({ feedback: promptForPlayer(mode === 'learn' ? [] : ['Spiel die Züge deines Repertoires. Der Gegner antwortet automatisch.']) })
        else {
          set({ feedback: { tone: 'info', title: 'Los geht’s', lines: [`Du spielst ${r.color === 'w' ? 'Weiß' : 'Schwarz'}. Der Gegner zieht zuerst.`], arrows: [] } })
          scheduleOpponent()
        }
      },

      playerMove(from, to, promotion) {
        const r = get().rep
        const s = get().session
        if (!r || !s || s.done || !isPlayerTurn(r, s) || timer) return false
        const node = currentNode(r, s)
        const move = applyMove(node.fen, from, to, promotion)
        if (!move) return false
        const check = checkMove(r, s, move.uci)!
        const { attempt } = get()

        if (check.result === 'wrong') {
          const exp = check.expected
          if (s.mode === 'review' && !attempt.wrong) {
            grade(node.key, exp.san, 'wrong', move.san)
            set((st) => ({ score: { ...st.score, wrong: st.score.wrong + 1 } }))
          }
          set({
            attempt: { ...attempt, wrong: true },
            feedback: {
              tone: 'wrong',
              title: s.mode === 'learn' ? 'Nicht ganz – spiel den grünen Pfeil' : `${showMove(move.san, r.color)} ist nicht dein Repertoirezug`,
              lines: [`Hier spielst du ${showMove(exp.san, r.color)}: ${exp.why}`],
              arrows: [ARROW(exp, 'expected'), { from: move.from, to: move.to, kind: 'played' }],
            },
          })
          if (s.mode === 'review') void explainDeviation(node.fen, move.uci, move.san, exp)
          return false
        }

        // richtig
        controller.abort()
        controller = new AbortController()
        const outcome: Outcome = attempt.wrong ? 'wrong' : attempt.hints > 0 ? 'hint' : 'correct'
        if (s.mode === 'review' && !attempt.wrong) {
          grade(node.key, check.edge.san, outcome)
          set((st) => ({ score: { ...st.score, [outcome === 'hint' ? 'hinted' : 'correct']: st.score[outcome === 'hint' ? 'hinted' : 'correct'] + 1 } }))
        }
        const next = applyEdge(r, s, check.edge)
        set({
          session: next,
          explaining: false,
          attempt: { wrong: false, hints: 0 },
          feedback: {
            tone: 'correct',
            title: outcome === 'correct' ? `Richtig: ${showMove(check.edge.san, r.color)}` : `${showMove(check.edge.san, r.color)} – weiter so`,
            lines: [check.edge.why],
            arrows: [],
          },
        })
        if (next.done) finish()
        else scheduleOpponent()
        return true
      },

      hint() {
        const r = get().rep
        const s = get().session
        if (!r || !s || !isPlayerTurn(r, s)) return
        const exp = expectedEdge(r, s)!
        const hints = get().attempt.hints + 1
        const fb = get().feedback ?? { tone: 'info' as const, title: '', lines: [], arrows: [] }
        set({
          attempt: { ...get().attempt, hints },
          feedback:
            hints === 1
              ? { ...fb, title: 'Hinweis: Diese Figur zieht', hintSquare: exp.uci.slice(0, 2) as Square }
              : { ...fb, title: `Lösung: ${showMove(exp.san, r.color)}`, lines: [exp.why], arrows: [ARROW(exp, 'expected')], hintSquare: undefined },
        })
      },

      dispose: clearPending,
    }
  })
}
