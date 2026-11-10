import { createStore, type StoreApi } from 'zustand/vanilla'
import { applyMove, applyUci, getStatus, START_FEN, type Color, type GameStatus, type PlayedMove } from '../../core/chess/game'
import { isBad } from '../../core/coach/classify'
import { reviewMove, type MoveReview } from '../../core/coach/explain'
import { DEFAULT_LEVEL, getStrength, pickMove } from '../../core/engine/strength'
import { AbortedError, type AnalysisResult, type EngineClient, type Score } from '../../core/engine/types'
import type { GameRepository, ReviewSummary, StoredGame } from '../../core/storage/db'

export interface Evaluation {
  fen: string
  score: Score
  depth: number
  bestMove: string | null
}

export interface CoachOptions {
  enabled: boolean
  /** bei Fehler/Patzer anhalten, damit man zurücknehmen kann, bevor die Engine antwortet */
  pauseOnMistake: boolean
}

export interface PlayState {
  gameId: string
  createdAt: number
  startFen: string
  moves: PlayedMove[]
  playerColor: Color
  level: number
  status: GameStatus
  /** gesetzt bei Aufgabe, überschreibt status */
  resigned: boolean
  engineThinking: boolean
  evaluation: Evaluation | null
  engineError: string | null

  coach: CoachOptions
  /** Analyse des letzten eigenen Zugs */
  review: MoveReview | null
  reviewing: boolean
  /** Partie pausiert nach einem Fehler – Engine wartet */
  paused: boolean
  /** Kurzfassung aller Coach-Bewertungen dieser Partie, Schlüssel = Index in moves */
  reviews: Record<number, ReviewSummary>

  newGame(opts: { playerColor: Color; level: number }): void
  /** true, wenn der Zug ausgeführt wurde */
  playerMove(from: string, to: string, promotion?: string): boolean
  /** nimmt den letzten eigenen Zug (und die Engine-Antwort) zurück */
  undo(): void
  /** nach einer Pause trotzdem weiterspielen */
  continueGame(): void
  resign(): void
  setLevel(level: number): void
  setCoach(options: Partial<CoachOptions>): void
  resume(game: StoredGame): void
  currentFen(): string
}

export interface PlayDeps {
  engine: EngineClient
  repo: GameRepository
  rng?: () => number
  now?: () => number
  newId?: () => string
  /** Analysetiefe für Bewertungsbalken und Coach */
  evalDepth?: number
  coach?: Partial<CoachOptions>
}

/** Kandidatenzüge, die der Coach vor dem eigenen Zug kennen will */
const COACH_MULTIPV = 3

const lastFen = (startFen: string, moves: PlayedMove[]) => (moves.length ? moves[moves.length - 1].fenAfter : startFen)

export function createPlayStore(deps: PlayDeps): StoreApi<PlayState> {
  const { engine, repo, rng = Math.random, now = Date.now, newId = () => crypto.randomUUID(), evalDepth = 12 } = deps
  /** bricht alle laufenden Engine-Aufträge ab, wenn sich die Stellung "von außen" ändert */
  let controller = new AbortController()
  /** Analysen nach FEN (für den Coach: Stellung vor dem eigenen Zug, mit MultiPV) */
  const cache = new Map<string, { result: AnalysisResult; multiPv: number }>()

  return createStore<PlayState>((set, get) => {
    const resetController = () => {
      controller.abort()
      controller = new AbortController()
      return controller.signal
    }

    const persist = () => {
      const s = get()
      void repo
        .save({
          id: s.gameId,
          mode: 'free',
          createdAt: s.createdAt,
          updatedAt: now(),
          startFen: s.startFen,
          moves: s.moves,
          playerColor: s.playerColor,
          level: s.level,
          result: s.resigned ? (s.playerColor === 'w' ? '0-1' : '1-0') : s.status.result,
          reason: s.resigned ? 'Aufgegeben' : s.status.reason,
          reviews: Object.entries(s.reviews)
            .filter(([i]) => Number(i) < s.moves.length)
            .map(([, r]) => r),
        })
        .catch((e) => console.warn('Partie konnte nicht gespeichert werden', e))
    }

    const handleEngineError = (e: unknown) => {
      if (e instanceof AbortedError) return
      console.error(e)
      set({ engineThinking: false, reviewing: false, engineError: 'Die Engine reagiert nicht. Bitte Seite neu laden.' })
    }

    const analyzeCached = async (fen: string, multiPv: number, signal: AbortSignal) => {
      const hit = cache.get(fen)
      if (hit && hit.multiPv >= multiPv) return hit.result
      const result = await engine.analyze(fen, { depth: evalDepth, multiPv, signal })
      cache.set(fen, { result, multiPv })
      if (cache.size > 200) cache.delete(cache.keys().next().value!)
      return result
    }

    const showEvaluation = (r: AnalysisResult) => {
      if (get().currentFen() !== r.fen || !r.lines[0]) return
      set({ evaluation: { fen: r.fen, score: r.lines[0].score, depth: r.lines[0].depth, bestMove: r.bestMove } })
    }

    /** Bewertet die aktuelle Stellung; ist der Spieler am Zug, gleich mit Kandidatenzügen für den Coach. */
    const evaluate = (signal: AbortSignal) => {
      const s = get()
      const fen = s.currentFen()
      const multiPv = s.coach.enabled && s.status.turn === s.playerColor && !s.status.over ? COACH_MULTIPV : 1
      analyzeCached(fen, multiPv, signal).then(showEvaluation).catch(handleEngineError)
    }

    const pushMove = (move: PlayedMove) => {
      const moves = [...get().moves, move]
      set({ moves, status: getStatus(get().startFen, moves) })
      persist()
    }

    const engineReply = (signal: AbortSignal) => {
      const s = get()
      if (s.status.over || s.resigned || s.paused || s.status.turn === s.playerColor) return
      const fen = s.currentFen()
      const cfg = getStrength(s.level)
      set({ engineThinking: true })
      engine
        .analyze(fen, { depth: cfg.depth, movetimeMs: cfg.movetimeMs, multiPv: cfg.multiPv, signal })
        .then((r) => {
          if (signal.aborted || get().currentFen() !== fen) return
          const uci = pickMove(r.lines, cfg, s.status.turn, rng) ?? r.bestMove
          const move = uci ? applyUci(fen, uci) : null
          set({ engineThinking: false })
          if (!move) return
          pushMove(move)
          evaluate(signal)
        })
        .catch(handleEngineError)
    }

    /** Coach: Stellung vor und nach dem Zug analysieren, erklären, ggf. anhalten. */
    const reviewAndReply = async (fenBefore: string, move: PlayedMove, moveIndex: number, signal: AbortSignal) => {
      set({ reviewing: true, review: null })
      try {
        const before = await analyzeCached(fenBefore, COACH_MULTIPV, signal)
        const after = await analyzeCached(move.fenAfter, 1, signal)
        if (signal.aborted) return
        showEvaluation(after)
        const review = reviewMove({ fenBefore, uci: move.uci, before, after })
        const pause = !!review && get().coach.pauseOnMistake && isBad(review.moveClass) && !get().status.over
        set({
          review,
          reviewing: false,
          paused: pause,
          reviews: review
            ? {
                ...get().reviews,
                [moveIndex]: {
                  ply: moveIndex,
                  san: review.san,
                  moveClass: review.moveClass,
                  winLoss: Math.round(review.winLoss * 10) / 10,
                  kinds: review.findings.filter((f) => f.subject === 'move' && f.polarity < 0).map((f) => f.kind),
                },
              }
            : get().reviews,
        })
        persist()
        if (!pause) engineReply(signal)
      } catch (e) {
        set({ reviewing: false })
        handleEngineError(e)
        // Fällt der Coach aus, soll die Partie trotzdem weitergehen
        if (!(e instanceof AbortedError)) engineReply(signal)
      }
    }

    const freshGame = (playerColor: Color, level: number) => ({
      gameId: newId(),
      createdAt: now(),
      startFen: START_FEN,
      moves: [] as PlayedMove[],
      playerColor,
      level,
      status: getStatus(START_FEN, []),
      resigned: false,
      engineThinking: false,
      evaluation: null,
      engineError: null,
      review: null,
      reviewing: false,
      paused: false,
      reviews: {},
    })

    return {
      ...freshGame('w', DEFAULT_LEVEL),
      coach: { enabled: true, pauseOnMistake: true, ...deps.coach },

      currentFen: () => lastFen(get().startFen, get().moves),

      newGame({ playerColor, level }) {
        const signal = resetController()
        set(freshGame(playerColor, level))
        persist()
        evaluate(signal)
        engineReply(signal)
      },

      playerMove(from, to, promotion) {
        const s = get()
        if (s.status.over || s.resigned || s.engineThinking || s.reviewing || s.paused || s.status.turn !== s.playerColor) return false
        const fenBefore = s.currentFen()
        const move = applyMove(fenBefore, from, to, promotion)
        if (!move) return false
        const signal = resetController()
        const index = s.moves.length
        pushMove(move)
        if (s.coach.enabled) void reviewAndReply(fenBefore, move, index, signal)
        else {
          set({ review: null })
          engineReply(signal)
          if (get().status.over) evaluate(signal)
        }
        return true
      },

      undo() {
        const s = get()
        if (s.moves.length === 0) return
        const signal = resetController()
        const moves = [...s.moves]
        // bis zur letzten Stellung zurück, in der der Spieler am Zug ist
        do {
          moves.pop()
        } while (moves.length > 0 && moves[moves.length - 1].color === s.playerColor)
        const reviews = Object.fromEntries(Object.entries(s.reviews).filter(([i]) => Number(i) < moves.length))
        set({
          moves,
          status: getStatus(s.startFen, moves),
          resigned: false,
          engineThinking: false,
          reviewing: false,
          paused: false,
          review: null,
          reviews,
          evaluation: null,
        })
        persist()
        evaluate(signal)
        engineReply(signal) // falls der Spieler Schwarz ist und alles zurückgenommen wurde
      },

      continueGame() {
        if (!get().paused) return
        set({ paused: false })
        engineReply(controller.signal)
      },

      resign() {
        const s = get()
        if (s.status.over || s.resigned) return
        resetController()
        set({ resigned: true, engineThinking: false, reviewing: false, paused: false })
        persist()
      },

      setLevel(level) {
        set({ level: getStrength(level).level })
        persist()
      },

      setCoach(options) {
        const coach = { ...get().coach, ...options }
        set({ coach })
        if (!coach.enabled && get().paused) get().continueGame()
        if (coach.enabled) evaluate(controller.signal) // Kandidatenzüge nachladen
      },

      resume(game) {
        const signal = resetController()
        const reviews: Record<number, ReviewSummary> = {}
        for (const r of game.reviews ?? []) reviews[r.ply] = r
        set({
          gameId: game.id,
          createdAt: game.createdAt,
          startFen: game.startFen,
          moves: game.moves,
          playerColor: game.playerColor,
          level: game.level,
          status: getStatus(game.startFen, game.moves),
          resigned: game.reason === 'Aufgegeben',
          engineThinking: false,
          evaluation: null,
          engineError: null,
          review: null,
          reviewing: false,
          paused: false,
          reviews,
        })
        evaluate(signal)
        engineReply(signal)
      },
    }
  })
}
