import { createStore, type StoreApi } from 'zustand/vanilla'
import { applyMove, applyUci, getStatus, type PlayedMove } from '../../core/chess/game'
import { winFor } from '../../core/coach/classify'
import { judgeEndgame, playerColor, type Endgame, type Verdict } from '../../core/endgames/endgame'
import { AbortedError, type EngineClient, type Score } from '../../core/engine/types'
import type { EndgameResult, TrainingRepository } from '../../core/storage/db'

export interface EndgameState {
  endgame: Endgame | null
  moves: PlayedMove[]
  verdict: Verdict
  engineThinking: boolean
  /** Bewertung nach deinem letzten Zug (Sicht Weiß) */
  score: Score | null
  /** Warnung, wenn ein Zug das Ziel gefährdet */
  warning: string | null
  hintsShown: number
  results: EndgameResult[]

  init(): Promise<void>
  start(e: Endgame): void
  playerMove(from: string, to: string, promotion?: string): boolean
  undo(): void
  hint(): void
  fen(): string
  dispose(): void
}

export interface EndgameDeps {
  engine: EngineClient
  repo: TrainingRepository
  now?: () => number
  /** Suchtiefe der Engine – sie verteidigt bzw. greift mit voller Stärke an */
  depth?: number
}

export function createEndgameStore(deps: EndgameDeps): StoreApi<EndgameState> {
  const { engine, repo, now = Date.now, depth = 16 } = deps
  let controller = new AbortController()

  return createStore<EndgameState>((set, get) => {
    const reset = () => {
      controller.abort()
      controller = new AbortController()
      return controller.signal
    }

    const finish = (verdict: Verdict) => {
      const e = get().endgame!
      set({ verdict, engineThinking: false })
      if (verdict.state === 'running') return
      const result: EndgameResult = {
        endgameId: e.id,
        success: verdict.state === 'success',
        moves: get().moves.filter((m) => m.color === playerColor(e)).length,
        at: now(),
      }
      set({ results: [...get().results, result] })
      void repo.addEndgameResult(result).catch(() => {})
    }

    /** Engine antwortet; ihre Analyse liefert zugleich die Bewertung deines Zugs */
    const engineTurn = (signal: AbortSignal) => {
      const e = get().endgame!
      const fen = get().fen()
      set({ engineThinking: true })
      engine
        .analyze(fen, { depth, multiPv: 1, signal })
        .then((r) => {
          if (signal.aborted || get().fen() !== fen) return
          const score = r.lines[0]?.score ?? null
          const me = playerColor(e)
          let warning: string | null = null
          if (score) {
            const chance = winFor(score, me)
            if (e.goal !== 'draw' && chance < 75) warning = 'Vorsicht: Laut Engine ist der Gewinn mit diesem Zug in Gefahr. Nimm ihn zurück und versuch es anders.'
            if (e.goal === 'draw' && chance < 20) warning = 'Vorsicht: Laut Engine ist diese Stellung jetzt verloren. Nimm den Zug zurück.'
          }
          const reply = r.bestMove ? applyUci(fen, r.bestMove) : null
          const moves = reply ? [...get().moves, reply] : get().moves
          set({ moves, score, warning, engineThinking: false })
          finish(judgeEndgame(e, moves))
        })
        .catch((err) => {
          if (!(err instanceof AbortedError)) {
            console.error(err)
            set({ engineThinking: false, warning: 'Die Engine reagiert nicht. Bitte Seite neu laden.' })
          }
        })
    }

    return {
      endgame: null,
      moves: [],
      verdict: { state: 'running' },
      engineThinking: false,
      score: null,
      warning: null,
      hintsShown: 0,
      results: [],

      async init() {
        set({ results: await repo.endgameResults() })
      },

      fen() {
        const { endgame, moves } = get()
        if (!endgame) return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        return moves.at(-1)?.fenAfter ?? endgame.fen
      },

      start(endgame) {
        reset()
        set({ endgame, moves: [], verdict: { state: 'running' }, engineThinking: false, score: null, warning: null, hintsShown: 0 })
      },

      playerMove(from, to, promotion) {
        const s = get()
        const e = s.endgame
        if (!e || s.engineThinking || s.verdict.state !== 'running') return false
        if (getStatus(e.fen, s.moves).turn !== playerColor(e)) return false
        const move = applyMove(s.fen(), from, to, promotion)
        if (!move) return false
        const moves = [...s.moves, move]
        set({ moves, warning: null })
        const v = judgeEndgame(e, moves)
        if (v.state !== 'running') finish(v)
        else engineTurn(reset())
        return true
      },

      undo() {
        const s = get()
        const e = s.endgame
        if (!e || s.moves.length === 0) return
        reset()
        const me = playerColor(e)
        const moves = [...s.moves]
        // zurück bis vor deinen letzten Zug
        while (moves.length && moves[moves.length - 1].color !== me) moves.pop()
        moves.pop()
        set({ moves, verdict: { state: 'running' }, engineThinking: false, warning: null, score: null })
      },

      hint() {
        const e = get().endgame
        if (!e) return
        set({ hintsShown: Math.min(e.hints.length, get().hintsShown + 1) })
      },

      dispose() {
        controller.abort()
      },
    }
  })
}
