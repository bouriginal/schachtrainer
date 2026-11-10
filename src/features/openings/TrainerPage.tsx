import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useStore } from 'zustand'
import type { PlayedMove } from '../../core/chess/game'
import { getRepertoire } from '../../data/openings'
import { getCardRepository, getEngine } from '../../services'
import { Board, type BoardArrow, type BoardHighlight } from '../../ui/Board'
import { MoveList } from '../../ui/MoveList'
import { createTrainerStore } from './trainerStore'
import { playResultSound, vibrate } from '../../ui/feedback'

const ARROW = { expected: 'rgba(22, 163, 74, 0.85)', played: 'rgba(220, 38, 38, 0.75)' }

export function TrainerPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const mode = params.get('modus') === 'ueben' ? 'review' : 'learn'
  const lineId = params.get('linie')
  const rep = getRepertoire(id)
  const [store] = useState(() => createTrainerStore({ engine: getEngine(), cards: getCardRepository() }))
  const s = useStore(store)
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (!rep) return
    let alive = true
    void store
      .getState()
      .loadCards()
      .then(() => alive && store.getState().start(rep, mode, mode === 'learn' ? lineId : null))
    return () => {
      alive = false
      store.getState().dispose()
    }
  }, [store, rep, mode, lineId, run])

  // Rückmeldung bei falschen Zügen und am Ende
  const tone = s.feedback?.tone
  const title = s.feedback?.title
  useEffect(() => {
    if (tone === 'wrong') {
      playResultSound(false)
      vibrate('error')
    }
    if (tone === 'done') playResultSound(true)
  }, [tone, title])

  if (!rep) return <p>Diese Eröffnung gibt es nicht. <Link to="/eroeffnungen">Zur Übersicht</Link></p>
  const line = rep.lines.find((l) => l.id === lineId)
  const session = s.session
  const fen = s.fen()
  const last = session?.steps.at(-1)
  const fb = s.feedback
  const playerTurn = !!session && !session.done && rep.nodes.get(session.key)?.turn === rep.color

  const arrows: BoardArrow[] = (fb?.arrows ?? []).map((a) => ({ from: a.from, to: a.to, color: ARROW[a.kind] }))
  const highlights: Record<string, BoardHighlight> = {}
  if (fb?.hintSquare) highlights[fb.hintSquare] = 'plan'

  const moves: PlayedMove[] = (session?.steps ?? []).map((st) => ({
    san: st.san,
    uci: st.uci,
    color: st.color,
    from: st.uci.slice(0, 2) as PlayedMove['from'],
    to: st.uci.slice(2, 4) as PlayedMove['to'],
    fenAfter: '',
  }))

  return (
    <div className="play-layout">
      <section className="board-area trainer-board">
        <Board
          fen={fen}
          orientation={rep.color === 'w' ? 'white' : 'black'}
          movableColor={playerTurn ? rep.color : null}
          onMove={(from, to, promo) => store.getState().playerMove(from, to, promo)}
          lastMove={last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) } : null}
          arrows={arrows}
          highlights={highlights}
        />
      </section>

      <aside className="side-panel">
        <div>
          <Link to={`/eroeffnungen/${rep.id}`}>← {rep.name}</Link>
          <h1 className="trainer-title">{mode === 'learn' ? `Lernen: ${line?.name ?? ''}` : 'Üben'}</h1>
        </div>

        {fb && (
          <div className={`review trainer-fb fb-${fb.tone}`} role="status" aria-live="polite">
            {fb.title && <div className="review-badge">{fb.title}</div>}
            {fb.lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
            {s.explaining && <p className="muted small">Coach schaut sich deinen Zug an …</p>}
          </div>
        )}

        {mode === 'review' && (
          <p className="small muted">
            Richtig: {s.score.correct} · mit Hinweis: {s.score.hinted} · falsch: {s.score.wrong}
          </p>
        )}

        <h2 className="panel-title">Züge</h2>
        <MoveList moves={moves} />

        <div className="button-row action-bar">
          {mode === 'review' && playerTurn && (
            <button type="button" onClick={() => s.hint()}>
              💡 Hinweis
            </button>
          )}
          <button type="button" onClick={() => setRun((r) => r + 1)}>
            ↻ Neu starten
          </button>
          {session?.done && mode === 'review' && (
            <button type="button" className="primary" onClick={() => setRun((r) => r + 1)}>
              Weiter üben
            </button>
          )}
          {session?.done && mode === 'learn' && (
            <Link className="button primary" to={`/eroeffnungen/${rep.id}/training?modus=ueben`}>
              Jetzt üben
            </Link>
          )}
        </div>
      </aside>
    </div>
  )
}
