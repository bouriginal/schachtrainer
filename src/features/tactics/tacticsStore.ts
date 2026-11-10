import type { Square } from 'chess.js'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { applyUci, type PlayedMove } from '../../core/chess/game'
import { showMove } from '../../core/coach/text/de'
import {
  expectedMove,
  pickPuzzle,
  playPuzzleMove,
  START_RATING,
  startPuzzle,
  updateRating,
  type Difficulty,
  type Puzzle,
  type PuzzleState,
} from '../../core/tactics/puzzle'
import { THEME_BY_ID, themeName } from '../../core/tactics/themes'
import type { PuzzleAttempt, TrainingRepository } from '../../core/storage/db'
import { reviewMove } from '../../core/coach/explain'
import type { EngineClient } from '../../core/engine/types'

export interface TacticsFeedback {
  tone: 'info' | 'correct' | 'wrong' | 'solved' | 'failed'
  title: string
  lines: string[]
  arrow?: { from: Square; to: Square }
  /** Pfeilfarbe: grün = Lösung, rot = Antwort des Gegners */
  arrowTone?: 'solution' | 'threat'
  hintSquare?: Square
}

export interface TacticsState {
  puzzles: Puzzle[]
  loading: boolean
  theme: string | null
  difficulty: Difficulty
  rating: number
  /** Puzzle-ID → gelöst? (letzter Versuch) */
  seen: Map<string, boolean>
  attempts: PuzzleAttempt[]
  current: PuzzleState | null
  /** Stellung vor dem ersten Gegnerzug wird kurz gezeigt */
  intro: boolean
  feedback: TacticsFeedback | null
  hints: number
  /** Ergebnis dieser Aufgabe schon gespeichert? */
  recorded: boolean
  ratingDelta: number | null
  /**
   * Falscher Zug wird gezeigt: dein Zug und die Widerlegung des Gegners stehen auf dem Brett,
   * bis du "Nochmal versuchen" tippst.
   */
  refutation: { moves: PlayedMove[]; explaining: boolean } | null

  init(theme?: string | null): Promise<void>
  setTheme(theme: string | null): void
  setDifficulty(d: Difficulty): void
  next(): void
  move(from: string, to: string, promotion?: string): boolean
  hint(): void
  showSolution(): void
  /** nach einem gezeigten Fehler zurück zur Aufgabenstellung */
  retry(): void
  boardFen(): string
  lastMove(): PlayedMove | null
  dispose(): void
}

export interface TacticsDeps {
  repo: TrainingRepository
  loadPuzzles: () => Promise<Puzzle[]>
  rng?: () => number
  now?: () => number
  /** Pause, bevor der erste Gegnerzug gezeigt wird */
  introMs?: number
  /** Engine für die Widerlegung falscher Züge (ohne Engine: Zug wird nur abgelehnt) */
  engine?: EngineClient
  /** Pause, bevor die Widerlegung gespielt wird */
  replyDelayMs?: number
}

const RATING_KEY = 'tacticsRating'

export function createTacticsStore(deps: TacticsDeps): StoreApi<TacticsState> {
  const { repo, loadPuzzles, rng = Math.random, now = Date.now, introMs = 600, engine, replyDelayMs = 700 } = deps
  let timer: ReturnType<typeof setTimeout> | null = null
  /** erhöht sich bei jeder neuen Aufgabe/jedem Neuversuch → veraltete Analysen werden verworfen */
  let token = 0

  return createStore<TacticsState>((set, get) => {
    const sideText = (s: PuzzleState) => (s.color === 'w' ? 'Weiß' : 'Schwarz')

    /** Ergebnis einmal pro Aufgabe speichern und Wertung anpassen */
    const record = (solved: boolean) => {
      const s = get()
      if (s.recorded || !s.current) return
      const p = s.current.puzzle
      const rating = updateRating(s.rating, p.rating, solved)
      const attempt: PuzzleAttempt = { puzzleId: p.id, theme: p.theme, themes: p.themes, puzzleRating: p.rating, solved, hints: s.hints, at: now() }
      const seen = new Map(s.seen)
      seen.set(p.id, solved)
      set({ recorded: true, rating, ratingDelta: rating - s.rating, seen, attempts: [...s.attempts, attempt] })
      void repo.addPuzzleAttempt(attempt).catch(() => {})
      void repo.setMeta(RATING_KEY, rating).catch(() => {})
    }

    /** Engine sucht die beste Antwort auf deinen falschen Zug; der Coach erklärt, warum er schlecht ist */
    const refute = async (fenBefore: string, mine: PlayedMove, myToken: number) => {
      try {
        const [before, after] = [
          await engine!.analyze(fenBefore, { depth: 12, multiPv: 1 }),
          await engine!.analyze(mine.fenAfter, { depth: 12, multiPv: 1 }),
        ]
        if (myToken !== token) return
        const review = reviewMove({ fenBefore, uci: mine.uci, before, after })
        const replyUci = after.lines[0]?.pv[0] ?? after.bestMove
        const reply = replyUci ? applyUci(mine.fenAfter, replyUci) : null
        const okish = review && (review.moveClass === 'best' || review.moveClass === 'good')
        // "Besser war …" würde die Lösung verraten – weglassen
        const why = okish
          ? ['Dein Zug ist nicht schlecht – aber es gibt einen deutlich stärkeren. Such weiter!']
          : (review?.sentences ?? []).filter((x) => !x.startsWith('Besser war'))
        await new Promise((res) => setTimeout(res, replyDelayMs))
        if (myToken !== token) return
        const ref = get().refutation
        if (!ref) return
        set({
          refutation: { moves: reply ? [...ref.moves, reply] : ref.moves, explaining: false },
          feedback: {
            tone: 'wrong',
            title: `${showMove(mine.san, mine.color)} ist nicht die Lösung`,
            lines: [
              ...(why.length ? why : ['Dieser Zug lässt eine starke Antwort zu.']),
              ...(reply ? [`Der Gegner antwortet ${showMove(reply.san, reply.color)} – siehst du, warum dein Zug nicht funktioniert?`] : []),
            ],
            arrow: reply ? { from: reply.from, to: reply.to } : undefined,
            arrowTone: 'threat',
          },
        })
      } catch {
        if (myToken !== token) return
        set({ refutation: { moves: get().refutation?.moves ?? [], explaining: false }, feedback: { tone: 'wrong', title: 'Das ist nicht die Lösung', lines: ['Versuch es noch einmal.'] } })
      }
    }

    const motifLines = (p: Puzzle) => {
      const t = THEME_BY_ID.get(p.theme)
      return t ? [`Motiv: ${t.name} – ${t.idea}`, `Darauf achten: ${t.lookFor}`] : []
    }

    return {
      puzzles: [],
      loading: true,
      theme: null,
      difficulty: 'auto',
      rating: START_RATING,
      seen: new Map(),
      attempts: [],
      current: null,
      intro: false,
      feedback: null,
      hints: 0,
      recorded: false,
      ratingDelta: null,
      refutation: null,

      async init(theme = null) {
        const [puzzles, attempts, rating] = await Promise.all([loadPuzzles(), repo.puzzleAttempts(), repo.getMeta<number>(RATING_KEY)])
        const seen = new Map<string, boolean>()
        for (const a of attempts) seen.set(a.puzzleId, a.solved)
        set({ puzzles, attempts, seen, rating: rating ?? START_RATING, loading: false, theme: theme && THEME_BY_ID.has(theme) ? theme : null })
        get().next()
      },

      setTheme(theme) {
        set({ theme })
        get().next()
      },

      setDifficulty(difficulty) {
        set({ difficulty })
        get().next()
      },

      next() {
        if (timer) clearTimeout(timer)
        const s = get()
        const p = pickPuzzle(s.puzzles, { theme: s.theme, difficulty: s.difficulty, rating: s.rating, seen: s.seen, exclude: s.current?.puzzle.id }, rng)
        if (!p) {
          set({ current: null, feedback: { tone: 'info', title: 'Keine Aufgabe gefunden', lines: ['Wähle ein anderes Motiv oder eine andere Stufe.'] } })
          return
        }
        const state = startPuzzle(p)
        token++
        set({ refutation: null, current: state, intro: true, hints: 0, recorded: false, ratingDelta: null, feedback: { tone: 'info', title: `${sideText(state)} am Zug`, lines: ['Schau dir den letzten Zug des Gegners an. Was hat sich verändert?'] } })
        timer = setTimeout(() => {
          timer = null
          set({ intro: false, feedback: { tone: 'info', title: `${sideText(state)} am Zug – finde den besten Zug`, lines: ['Prüfe zuerst: Schachs, Schlagzüge, Drohungen.'] } })
        }, introMs)
      },

      move(from, to, promotion) {
        const s = get()
        if (!s.current || s.intro || s.current.status !== 'playing' || s.refutation) return false
        const uci = from + to + (promotion ?? '')
        const r = playPuzzleMove(s.current, uci)
        if (r.result === 'illegal') return false
        if (r.result === 'wrong') {
          record(false)
          const second = r.state.mistakes >= 2
          const mine = applyUci(s.current.fen, uci)
          if (!engine || !mine || second) {
            // ohne Engine oder beim zweiten Fehler: Zug ablehnen, ggf. Lösungspfeil zeigen
            set({
              current: r.state,
              feedback: {
                tone: 'wrong',
                title: second ? 'Wieder nicht – hier ist die Lösung' : 'Das ist nicht die Lösung',
                lines: second ? [`Spiel ${showMove(applyUci(s.current.fen, r.expected)!.san, s.current.color)} nach.`] : ['Versuch es noch einmal. Tipp: Gibt es einen Zug, der mehr erzwingt?'],
                arrow: second ? { from: r.expected.slice(0, 2) as Square, to: r.expected.slice(2, 4) as Square } : undefined,
              },
            })
            return false
          }
          // Zug ausführen, erklären und die Widerlegung zeigen
          set({
            current: r.state,
            refutation: { moves: [mine], explaining: true },
            feedback: { tone: 'wrong', title: `${showMove(mine.san, mine.color)} ist nicht die Lösung`, lines: ['Schau, was jetzt passiert …'] },
          })
          void refute(s.current.fen, mine, ++token)
          return true
        }
        if (r.state.status === 'solved') {
          // Gespeichert wurde bisher nur ein Fehlversuch (falscher Zug oder Lösung gezeigt)
          const failedBefore = s.recorded
          if (!failedBefore) record(true)
          set({
            current: r.state,
            feedback: {
              tone: failedBefore ? 'failed' : 'solved',
              title: failedBefore ? 'Geschafft – mit Hilfe' : s.hints > 0 ? 'Gelöst – mit Hinweis' : 'Gelöst! 🎉',
              lines: motifLines(s.current.puzzle),
            },
          })
          return true
        }
        set({
          current: r.state,
          feedback: { tone: 'correct', title: 'Richtig – weiter!', lines: [r.reply ? `Der Gegner antwortet ${showMove(r.reply.san, r.reply.color)}. Wie geht es weiter?` : ''] },
        })
        return true
      },

      hint() {
        const s = get()
        if (!s.current || s.current.status !== 'playing' || s.refutation) return
        const exp = expectedMove(s.current)!
        const hints = s.hints + 1
        const p = s.current.puzzle
        const fb = s.feedback ?? { tone: 'info' as const, title: '', lines: [] }
        if (hints === 1) {
          const t = THEME_BY_ID.get(p.theme)
          set({ hints, feedback: { ...fb, tone: 'info', title: `Hinweis: Motiv „${themeName(p.theme)}“`, lines: t ? [t.lookFor] : [] } })
        } else {
          set({ hints, feedback: { ...fb, tone: 'info', title: 'Hinweis: Diese Figur ist der Schlüssel', hintSquare: exp.slice(0, 2) as Square } })
        }
      },

      showSolution() {
        const s = get()
        if (!s.current || s.current.status !== 'playing') return
        if (s.refutation) {
          token++
          set({ refutation: null })
        }
        record(false)
        const exp = expectedMove(s.current)!
        set({
          feedback: {
            tone: 'wrong',
            title: `Lösung: ${showMove(applyUci(s.current.fen, exp)!.san, s.current.color)}`,
            lines: ['Spiel den Zug nach, um den Rest der Lösung zu sehen.'],
            arrow: { from: exp.slice(0, 2) as Square, to: exp.slice(2, 4) as Square },
          },
        })
      },

      retry() {
        if (!get().refutation) return
        token++
        set({
          refutation: null,
          feedback: { tone: 'info', title: 'Neuer Versuch', lines: ['Zurück in der Ausgangsstellung. Was zwingt den Gegner mehr – Schach, Schlagen oder eine Drohung?'] },
        })
      },

      boardFen() {
        const c = get().current
        if (!c) return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        const ref = get().refutation
        if (ref?.moves.length) return ref.moves[ref.moves.length - 1].fenAfter
        return get().intro ? c.puzzle.fen : c.fen
      },

      lastMove() {
        const c = get().current
        if (!c || get().intro) return null
        const ref = get().refutation
        if (ref?.moves.length) return ref.moves[ref.moves.length - 1]
        return c.played.at(-1) ?? null
      },

      dispose() {
        if (timer) clearTimeout(timer)
      },
    }
  })
}
