import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { analyzeGame, keyMoments, winCurve, type GameAnalysis } from '../../core/analysis/gameAnalysis'
import { germanSan, sideName } from '../../core/chess/board'
import type { Color } from '../../core/chess/game'
import { gameTitle, parsePgn } from '../../core/chess/pgn'
import { showMove } from '../../core/coach/text/de'
import { AbortedError } from '../../core/engine/types'
import type { ReviewSummary, StoredGame } from '../../core/storage/db'
import { getEngine, getGameRepository } from '../../services'
import { Board, type BoardArrow, type BoardHighlight } from '../../ui/Board'
import { EvalGraph } from '../../ui/charts'
import { MoveList, type MoveMark } from '../../ui/MoveList'
import { CLASS_SYMBOL } from '../coach/symbols'

const ARROW = { best: 'rgba(22, 163, 74, 0.85)', threat: 'rgba(220, 38, 38, 0.8)', played: 'rgba(120,120,120,0.6)' }

/** Ergebnis aus deiner Sicht */
function outcomeText(g: StoredGame): string {
  if (g.result === '*') return 'läuft'
  if (g.result === '1/2-1/2') return 'Remis'
  return (g.result === '1-0') === (g.playerColor === 'w') ? 'Sieg' : 'Niederlage'
}

function titleOf(g: StoredGame) {
  if (g.headers) return gameTitle(g.headers)
  const d = new Date(g.createdAt)
  return `Gegen Stockfish Stufe ${g.level} · ${d.toLocaleDateString('de-DE')}`
}

/* ───────────────────── Liste + Import ───────────────────── */

export function AnalysisListPage() {
  const [games, setGames] = useState<StoredGame[] | null>(null)
  const [pgn, setPgn] = useState('')
  const [color, setColor] = useState<Color>('w')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const load = useCallback(() => {
    void getGameRepository()
      .list(300)
      .then((gs) => setGames(gs.filter((g) => g.mode === 'import' || (g.result !== '*' && g.moves.length > 0))))
  }, [])
  useEffect(load, [load])

  const importPgn = async () => {
    setError(null)
    try {
      const parsed = parsePgn(pgn)
      const now = Date.now()
      const ids: string[] = []
      for (const [i, p] of parsed.entries()) {
        const id = crypto.randomUUID()
        ids.push(id)
        await getGameRepository().save({
          id,
          mode: 'import',
          createdAt: now + i,
          updatedAt: now + i,
          startFen: p.startFen,
          moves: p.moves,
          playerColor: color,
          level: 0,
          result: p.result,
          reason: null,
          headers: p.headers,
        })
      }
      setPgn('')
      if (ids.length === 1) navigate(`/analyse/${ids[0]}`)
      else load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import fehlgeschlagen.')
    }
  }

  const remove = async (g: StoredGame) => {
    if (!window.confirm(`„${titleOf(g)}“ endgültig löschen? Das lässt sich nicht rückgängig machen.`)) return
    await getGameRepository().delete(g.id)
    load()
  }

  return (
    <div className="repertoire">
      <h1>Partieanalyse</h1>
      <p className="muted">Jede Partie wird Zug für Zug vom Coach bewertet. Die Fehler fließen in deine Fortschrittsstatistik ein.</p>

      <section className="import-box">
        <h2>Partie importieren (PGN)</h2>
        <p className="muted small">
          Auf Lichess: Partie öffnen → „Teilen &amp; exportieren“ → PGN kopieren. Auf Chess.com: Partie → Teilen → PGN. Mehrere Partien auf einmal
          gehen auch.
        </p>
        <textarea value={pgn} onChange={(e) => setPgn(e.target.value)} rows={6} placeholder={'[Event "…"]\n\n1. e4 e5 2. Nf3 …'} aria-label="PGN-Text" />
        <div className="import-row">
          <label className="file">
            .pgn-Datei wählen
            <input
              type="file"
              accept=".pgn,text/plain"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void f.text().then(setPgn)
              }}
            />
          </label>
          <div className="segmented" role="radiogroup" aria-label="Deine Farbe">
            {(['w', 'b'] as const).map((c) => (
              <label key={c} className={color === c ? 'active' : ''}>
                <input type="radio" name="impcolor" checked={color === c} onChange={() => setColor(c)} />
                Ich war {c === 'w' ? 'Weiß' : 'Schwarz'}
              </label>
            ))}
          </div>
          <button type="button" className="primary" onClick={importPgn} disabled={!pgn.trim()}>
            Importieren
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      <h2>Deine Partien</h2>
      {games === null ? (
        <p className="muted">Lade …</p>
      ) : games.length === 0 ? (
        <p className="muted">Noch keine beendete Partie. Spiel eine Partie oder importiere eine PGN.</p>
      ) : (
        <ul className="lines">
          {games.map((g) => (
            <li key={g.id} className="line-item">
              <div>
                <strong>{titleOf(g)}</strong>
                <p className="muted small">
                  {outcomeText(g)} · {Math.ceil(g.moves.length / 2)} Züge · du warst {g.playerColor === 'w' ? 'Weiß' : 'Schwarz'}
                  {g.analysis && ` · Genauigkeit ${g.analysis.accuracy[g.playerColor]} %`}
                  {g.mode === 'import' && ' · importiert'}
                </p>
              </div>
              <div className="item-actions">
                <Link className="button" to={`/analyse/${g.id}`}>
                  {g.analysis ? 'Ansehen' : 'Analysieren'}
                </Link>
                {g.mode === 'import' && (
                  <button type="button" className="link" onClick={() => remove(g)} aria-label={`${titleOf(g)} löschen`}>
                    Löschen
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ───────────────────── Analyse einer Partie ───────────────────── */

/** Kurzfassungen der eigenen Züge aus der Analyse (für Fehlermuster) */
function summaries(g: StoredGame, a: GameAnalysis): ReviewSummary[] {
  return a.plies
    .map((p, ply) => ({ p, ply }))
    .filter(({ ply }) => g.moves[ply].color === g.playerColor)
    .map(({ p, ply }) => ({ ply, san: g.moves[ply].san, moveClass: p.moveClass, winLoss: p.winLoss, kinds: p.kinds }))
}

export function GameAnalysisPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const [game, setGame] = useState<StoredGame | null | undefined>(undefined)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Stellung: 0 = Start, i = nach Zug i−1 */
  const [pos, setPos] = useState(0)

  useEffect(() => {
    let alive = true
    void getGameRepository()
      .get(id)
      .then((g) => {
        if (!alive) return
        setGame(g ?? null)
        const z = Number(params.get('zug'))
        if (g && params.get('zug') !== null && Number.isInteger(z) && z >= 0 && z < g.moves.length) setPos(z + 1)
        else if (g?.analysis) {
          // schon analysiert: direkt zum ersten Wendepunkt
          const km = keyMoments(g.analysis, g.moves, g.playerColor)
          if (km.length) setPos(km[0] + 1)
        }
      })
    return () => {
      alive = false
    }
  }, [id, params])

  // Analyse starten, falls noch keine vorhanden
  useEffect(() => {
    if (!game || game.analysis) return
    const controller = new AbortController()
    analyzeGame(game.startFen, game.moves, getEngine(), { depth: 12, signal: controller.signal, onProgress: (d, t) => setProgress([d, t]) })
      .then(async (analysis) => {
        const updated: StoredGame = { ...game, analysis, reviews: summaries(game, analysis), updatedAt: Math.max(game.updatedAt, Date.now()) }
        await getGameRepository().save(updated)
        setGame(updated)
        setProgress(null)
        const km = keyMoments(analysis, game.moves, game.playerColor)
        if (km.length && !params.get('zug')) setPos(km[0] + 1)
      })
      .catch((e) => {
        if (e instanceof AbortedError) return
        console.error(e)
        setError('Die Analyse ist fehlgeschlagen. Bitte Seite neu laden.')
      })
    return () => controller.abort()
  }, [game, params])

  const n = game?.moves.length ?? 0
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 1))
      if (e.key === 'ArrowRight') setPos((p) => Math.min(n, p + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [n])

  const a = game?.analysis
  const labels = useMemo(
    () => (game ? ['Start', ...game.moves.map((m, i) => `${Math.floor(i / 2) + 1}${m.color === 'b' ? '…' : '.'} ${germanSan(m.san)}`)] : []),
    [game],
  )

  if (game === undefined) return <p className="muted">Lade …</p>
  if (game === null) return <p>Diese Partie gibt es nicht. <Link to="/analyse">Zur Übersicht</Link></p>

  const me = game.playerColor
  const ply = pos - 1
  const move = ply >= 0 ? game.moves[ply] : null
  const pa = a && ply >= 0 ? a.plies[ply] : null
  const fen = move ? move.fenAfter : game.startFen
  const mine = move?.color === me
  const weak = pa && pa.moveClass !== 'best' && pa.moveClass !== 'good'

  const arrows: BoardArrow[] = weak ? pa.arrows.map((x) => ({ from: x.from, to: x.to, color: ARROW[x.kind] })) : []
  const highlights: Record<string, BoardHighlight> = weak && mine ? { ...pa.highlights } : {}
  const marks: Record<number, MoveMark> = {}
  const graphMarks: Record<number, string> = {}
  a?.plies.forEach((p, i) => {
    marks[i] = { symbol: CLASS_SYMBOL[p.moveClass], tone: p.moveClass }
    if (game.moves[i].color === me && (p.moveClass === 'mistake' || p.moveClass === 'blunder')) graphMarks[i + 1] = p.moveClass
  })
  const moments = a ? keyMoments(a, game.moves, me) : []
  const other: Color = me === 'w' ? 'b' : 'w'

  return (
    <div className="play-layout">
      <section className="board-area trainer-board board-col">
        <Board
          fen={fen}
          orientation={me === 'w' ? 'white' : 'black'}
          movableColor={null}
          onMove={() => false}
          lastMove={move ? { from: move.from, to: move.to } : null}
          arrows={arrows}
          highlights={highlights}
        />
        <div className="nav-row" role="group" aria-label="Durch die Partie blättern">
          <button type="button" onClick={() => setPos(0)} aria-label="Zum Anfang">⏮</button>
          <button type="button" onClick={() => setPos((p) => Math.max(0, p - 1))} aria-label="Ein Zug zurück">◀</button>
          <button type="button" onClick={() => setPos((p) => Math.min(n, p + 1))} aria-label="Ein Zug vor">▶</button>
          <button type="button" onClick={() => setPos(n)} aria-label="Zum Ende">⏭</button>
        </div>
      </section>

      <aside className="side-panel">
        <div>
          <Link to="/analyse">← Partien</Link>
          <h1 className="trainer-title">{titleOf(game)}</h1>
          <p className="muted small">
            {outcomeText(game)} · du warst {me === 'w' ? 'Weiß' : 'Schwarz'}
          </p>
        </div>

        {!a && !error && (
          <div className="analysis-progress" role="status">
            <p>
              Stockfish analysiert … {progress?.[0] ?? 0} von {progress?.[1] ?? n + 1} Stellungen
            </p>
            <div className="progress">
              <div style={{ width: `${Math.round(((progress?.[0] ?? 0) / (progress?.[1] ?? n + 1)) * 100)}%` }} />
            </div>
          </div>
        )}
        {error && <p className="error">{error}</p>}

        {a && (
          <>
            <div className="tiles">
              <div className="tile">
                <span className="tile-value">{a.accuracy[me]} %</span>
                <span className="tile-label">deine Genauigkeit</span>
              </div>
              <div className="tile">
                <span className="tile-value">
                  {a.counts[me].mistake} / {a.counts[me].blunder}
                </span>
                <span className="tile-label">Fehler / Patzer</span>
              </div>
              <div className="tile">
                <span className="tile-value">{a.accuracy[other]} %</span>
                <span className="tile-label">Gegner</span>
              </div>
            </div>
            <EvalGraph values={winCurve(a)} labels={labels} current={pos} marks={graphMarks} onSelect={setPos} />
            {moments.length > 0 && (
              <div className="moments">
                <span className="small muted">Wendepunkte:</span>
                {moments.map((i) => (
                  <button key={i} type="button" className={pos === i + 1 ? 'active' : ''} onClick={() => setPos(i + 1)}>
                    {labels[i + 1]}
                    {CLASS_SYMBOL[a.plies[i].moveClass]}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {pa && move && (
          <div className={`review review-${pa.moveClass}`} role="status" aria-live="polite">
            <div className="review-head">
              <span className="review-badge">
                {pa.label} {CLASS_SYMBOL[pa.moveClass]}
              </span>
              <span className="review-move">
                {labels[pos]} {mine ? '(du)' : `(${sideName(move.color)})`}
              </span>
            </div>
            {mine ? (
              pa.sentences.map((s, i) => <p key={i}>{s}</p>)
            ) : weak && pa.bestSan ? (
              <p>
                Hier hat der Gegner danebengegriffen – besser war {showMove(pa.bestSan, move.color)}. Solche Momente sind deine Chancen: Schau dir
                deinen nächsten Zug an, ob du sie genutzt hast.
              </p>
            ) : (
              <p className="muted">Zug des Gegners.</p>
            )}
            {weak && pa.bestLineSan.length > 0 && (
              <p className="engine-line">
                <span className="muted">Beste Fortsetzung:</span>{' '}
                {pa.bestLineSan.map((s, i) => showMove(s, (i % 2 === 0) === (move.color === 'w') ? 'w' : 'b')).join(' ')}
              </p>
            )}
          </div>
        )}
        {!pa && a && <p className="muted">Klick auf einen Zug, den Graphen oder nutze die Pfeiltasten.</p>}

        <h2 className="panel-title">Züge</h2>
        <MoveList moves={game.moves} marks={marks} active={ply >= 0 ? ply : null} onSelect={(i) => setPos(i + 1)} />
      </aside>
    </div>
  )
}
