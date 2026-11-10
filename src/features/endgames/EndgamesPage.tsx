import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useStore } from 'zustand'
import { GOAL_TEXT, playerColor, type Endgame } from '../../core/endgames/endgame'
import { formatScore } from '../../core/engine/score'
import type { EndgameResult } from '../../core/storage/db'
import data from '../../data/endgames.json'
import { getEngine, getTrainingRepository } from '../../services'
import { Board } from '../../ui/Board'
import { createEndgameStore } from './endgameStore'
import { playResultSound, vibrate } from '../../ui/feedback'

const ENDGAMES = data.endgames as Endgame[]
const CATEGORIES = [...new Set(ENDGAMES.map((e) => e.category))]

function status(results: EndgameResult[], id: string) {
  const mine = results.filter((r) => r.endgameId === id)
  if (mine.some((r) => r.success)) return 'geschafft'
  return mine.length ? 'versucht' : null
}

export function EndgamesPage() {
  const [results, setResults] = useState<EndgameResult[]>([])
  useEffect(() => {
    void getTrainingRepository()
      .endgameResults()
      .then(setResults)
      .catch(() => {})
  }, [])
  return (
    <div className="repertoire">
      <h1>Endspiele</h1>
      <p className="muted">
        Standardstellungen, die man kennen muss. Du spielst gegen Stockfish in voller Stärke – die Engine macht keine Fehler, du musst die
        Technik wirklich können.
      </p>
      {CATEGORIES.map((cat) => (
        <section key={cat}>
          <h2>{cat}</h2>
          <ul className="lines">
            {ENDGAMES.filter((e) => e.category === cat).map((e) => {
              const st = status(results, e.id)
              return (
                <li key={e.id} className="line-item">
                  <div>
                    <strong>{e.title}</strong>{' '}
                    {st === 'geschafft' && <span className="badge ok">✓ geschafft</span>}
                    {st === 'versucht' && <span className="badge">versucht</span>}
                    <p className="muted small">
                      {GOAL_TEXT[e.goal]} · du spielst {playerColor(e) === 'w' ? 'Weiß' : 'Schwarz'}
                    </p>
                  </div>
                  <Link className="button" to={`/endspiele/${e.id}`}>
                    Spielen
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function EndgameTrainerPage() {
  const { id = '' } = useParams()
  const endgame = ENDGAMES.find((e) => e.id === id)
  const [store] = useState(() => createEndgameStore({ engine: getEngine(), repo: getTrainingRepository() }))
  const s = useStore(store)

  useEffect(() => {
    if (!endgame) return
    void store.getState().init()
    store.getState().start(endgame)
    return () => store.getState().dispose()
  }, [store, endgame])

  const verdictState = s.verdict.state
  useEffect(() => {
    if (verdictState === 'success') playResultSound(true)
    if (verdictState === 'failure') playResultSound(false)
  }, [verdictState])
  useEffect(() => {
    if (s.warning) vibrate('error')
  }, [s.warning])

  if (!endgame) return <p>Dieses Endspiel gibt es nicht. <Link to="/endspiele">Zur Übersicht</Link></p>
  const me = playerColor(endgame)
  const last = s.moves.at(-1)
  const done = s.verdict.state !== 'running'
  const index = ENDGAMES.indexOf(endgame)
  const nextEndgame = ENDGAMES[index + 1]
  const myMoves = s.moves.filter((m) => m.color === me).length

  return (
    <div className="play-layout">
      <section className="board-area trainer-board">
        <Board
          fen={s.fen()}
          orientation={me === 'w' ? 'white' : 'black'}
          movableColor={!done && !s.engineThinking ? me : null}
          onMove={(from, to, promo) => store.getState().playerMove(from, to, promo)}
          lastMove={last ? { from: last.from, to: last.to } : null}
        />
      </section>

      <aside className="side-panel">
        <div>
          <Link to="/endspiele">← Endspiele</Link>
          <h1 className="trainer-title">{endgame.title}</h1>
          <p className="goal">
            🎯 {GOAL_TEXT[endgame.goal]}
            {endgame.goal === 'draw' && ` (${endgame.surviveMoves} Züge überstehen – noch ${Math.max(0, (endgame.surviveMoves ?? 20) - myMoves)})`}
          </p>
        </div>

        <div className="review trainer-fb fb-info">
          <div className="review-badge">Lernziel</div>
          <p>{endgame.lesson}</p>
        </div>

        {done && (
          <div className={`review trainer-fb ${s.verdict.state === 'success' ? 'fb-done' : 'fb-wrong'}`} role="status" aria-live="polite">
            <div className="review-badge">{s.verdict.state === 'success' ? 'Geschafft!' : 'Nicht geschafft'}</div>
            {'text' in s.verdict && <p>{s.verdict.text}</p>}
          </div>
        )}
        {!done && s.warning && (
          <div className="review trainer-fb fb-wrong" role="alert">
            <p>{s.warning}</p>
          </div>
        )}
        {!done && s.engineThinking && <p className="muted small">Stockfish überlegt …</p>}
        {s.score && !done && <p className="muted small">Engine-Bewertung: {formatScore(s.score)} (positiv = Weiß besser)</p>}

        {s.hintsShown > 0 && (
          <ol className="hints">
            {endgame.hints.slice(0, s.hintsShown).map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ol>
        )}

        <div className="button-row action-bar">
          <button type="button" onClick={() => s.hint()} disabled={s.hintsShown >= endgame.hints.length}>
            💡 Tipp {s.hintsShown}/{endgame.hints.length}
          </button>
          <button type="button" onClick={() => s.undo()} disabled={s.moves.length === 0 || s.engineThinking}>
            ↶ Zurück
          </button>
          <button type="button" onClick={() => s.start(endgame)}>
            ↻ Neu starten
          </button>
          {done && nextEndgame && (
            <Link className="button primary" to={`/endspiele/${nextEndgame.id}`}>
              Nächstes: {nextEndgame.title}
            </Link>
          )}
        </div>
      </aside>
    </div>
  )
}
