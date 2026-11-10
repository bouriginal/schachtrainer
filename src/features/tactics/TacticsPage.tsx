import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useStore } from 'zustand'
import type { Difficulty, Puzzle } from '../../core/tactics/puzzle'
import { THEMES } from '../../core/tactics/themes'
import { getEngine, getTrainingRepository } from '../../services'
import { Board, type BoardArrow, type BoardHighlight } from '../../ui/Board'
import { createTacticsStore } from './tacticsStore'
import { playResultSound, vibrate } from '../../ui/feedback'

// Der Puzzle-Auszug (~370 KB) wird erst geladen, wenn die Seite gebraucht wird
const loadPuzzles = () => import('../../data/puzzles/puzzles.json').then((m) => m.default.puzzles as Puzzle[])

const DIFFICULTIES: [Difficulty, string][] = [
  ['auto', 'Passend'],
  ['leicht', 'Leicht'],
  ['mittel', 'Mittel'],
  ['schwer', 'Schwer'],
]

export function TacticsPage() {
  const [store] = useState(() => createTacticsStore({ repo: getTrainingRepository(), loadPuzzles, engine: getEngine() }))
  const s = useStore(store)
  const [params] = useSearchParams()
  const initialTheme = params.get('motiv')

  useEffect(() => {
    void store.getState().init(initialTheme)
    return () => store.getState().dispose()
  }, [store, initialTheme])

  const fb = s.feedback
  const fbTone = fb?.tone
  const fbTitle = fb?.title
  useEffect(() => {
    if (fbTone === 'wrong') {
      playResultSound(false)
      vibrate('error')
    }
    if (fbTone === 'solved') playResultSound(true)
  }, [fbTone, fbTitle])
  const cur = s.current
  const playing = !!cur && cur.status === 'playing' && !s.intro && !s.refutation
  const last = s.lastMove()
  const arrows: BoardArrow[] = fb?.arrow
    ? [{ from: fb.arrow.from, to: fb.arrow.to, color: fb.arrowTone === 'threat' ? 'rgba(220, 38, 38, 0.85)' : 'rgba(22, 163, 74, 0.85)' }]
    : []
  const highlights: Record<string, BoardHighlight> = {}
  if (fb?.hintSquare) highlights[fb.hintSquare] = 'plan'

  // Statistik je Motiv (letzter Versuch je Aufgabe zählt)
  const perTheme = new Map<string, { tried: number; solved: number }>()
  for (const [id, solved] of s.seen) {
    const p = s.puzzles.find((x) => x.id === id)
    if (!p) continue
    const t = perTheme.get(p.theme) ?? { tried: 0, solved: 0 }
    t.tried++
    if (solved) t.solved++
    perTheme.set(p.theme, t)
  }

  if (s.loading) return <p className="muted">Aufgaben werden geladen …</p>

  return (
    <div className="play-layout">
      <section className="board-area trainer-board">
        <Board
          fen={s.boardFen()}
          orientation={cur?.color === 'b' ? 'black' : 'white'}
          movableColor={playing ? cur!.color : null}
          onMove={(from, to, promo) => store.getState().move(from, to, promo)}
          lastMove={last ? { from: last.from, to: last.to } : null}
          arrows={arrows}
          highlights={highlights}
        />
      </section>

      <aside className="side-panel">
        <div className="tactics-head">
          <h1 className="trainer-title">Taktik</h1>
          <span className="rating" title="Deine Taktik-Wertung – steigt mit gelösten, sinkt mit verpatzten Aufgaben">
            Wertung {s.rating}
            {s.ratingDelta !== null && s.ratingDelta !== 0 && (
              <span className={s.ratingDelta > 0 ? 'up' : 'down'}> ({s.ratingDelta > 0 ? '+' : ''}{s.ratingDelta})</span>
            )}
          </span>
        </div>

        {fb && (
          <div className={`review trainer-fb fb-${fb.tone === 'solved' ? 'done' : fb.tone === 'failed' ? 'wrong' : fb.tone}`} role="status" aria-live="polite">
            <div className="review-badge">{fb.title}</div>
            {fb.lines.filter(Boolean).map((l, i) => (
              <p key={i}>{l}</p>
            ))}
            {cur && cur.status === 'solved' && <p className="muted small">Aufgabe {cur.puzzle.id} · Schwierigkeit {cur.puzzle.rating}</p>}
          </div>
        )}

        <div className="filters">
          <label>
            Motiv
            <select value={s.theme ?? ''} onChange={(e) => s.setTheme(e.target.value || null)}>
              <option value="">Alle Motive gemischt</option>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="segmented" role="radiogroup" aria-label="Schwierigkeit">
            {DIFFICULTIES.map(([d, label]) => (
              <label key={d} className={s.difficulty === d ? 'active' : ''}>
                <input type="radio" name="difficulty" checked={s.difficulty === d} onChange={() => s.setDifficulty(d)} />
                {label}
              </label>
            ))}
          </div>
        </div>

        <details className="settings">
          <summary>Fortschritt je Motiv</summary>
          <ul className="theme-stats">
            {THEMES.map((t) => {
              const st = perTheme.get(t.id)
              return (
                <li key={t.id}>
                  <button type="button" className="link" onClick={() => s.setTheme(t.id)}>
                    {t.name}
                  </button>
                  <span className="muted">{st ? `${st.solved}/${st.tried} gelöst` : '–'}</span>
                </li>
              )
            })}
          </ul>
          <p className="muted small">Aufgaben aus der Lichess-Puzzle-Datenbank (CC0).</p>
        </details>

        <div className="button-row action-bar">
          {s.refutation && (
            <button type="button" className="primary" onClick={() => s.retry()} disabled={s.refutation.explaining}>
              ↶ Nochmal versuchen
            </button>
          )}
          {s.refutation && (
            <button type="button" onClick={() => s.showSolution()}>
              Lösung zeigen
            </button>
          )}
          {playing && (
            <>
              <button type="button" onClick={() => s.hint()} disabled={s.hints >= 2}>
                💡 Hinweis
              </button>
              <button type="button" onClick={() => s.showSolution()}>
                Lösung zeigen
              </button>
            </>
          )}
          <button type="button" className={cur?.status === 'solved' ? 'primary' : ''} onClick={() => s.next()} hidden={!!s.refutation}>
            {cur?.status === 'solved' ? 'Nächste Aufgabe →' : 'Überspringen'}
          </button>
        </div>
      </aside>
    </div>
  )
}
