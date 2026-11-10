import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useStore } from 'zustand'
import { kingSquare, toPgn } from '../../core/chess/game'
import { buildHints } from '../../core/coach/hints'
import { suggestPlans } from '../../core/coach/plans'
import { STRENGTH_LEVELS, getStrength } from '../../core/engine/strength'
import { getEngine, getGameRepository } from '../../services'
import { Board, type BoardArrow, type BoardHighlight } from '../../ui/Board'
import { EvalBar } from '../../ui/EvalBar'
import { MoveList, type MoveMark } from '../../ui/MoveList'
import { CoachPanel } from '../coach/CoachPanel'
import { CLASS_SYMBOL } from '../coach/symbols'
import { loadSettings, saveSettings, type CoachSettings } from '../coach/settings'
import { fetchClaudeAvailable } from '../coach/useClaudeExplain'
import { createPlayStore } from './playStore'
import { vibrate } from '../../ui/feedback'
import { Icon } from '../../ui/Icon'

const ARROW_COLOR = { best: 'rgba(22, 163, 74, 0.85)', threat: 'rgba(220, 38, 38, 0.8)', played: 'rgba(120,120,120,0.6)' }

// Eine Store-Instanz pro Seitenbesuch; die Partie selbst kommt aus IndexedDB.
function usePlayStore(settings: CoachSettings) {
  // Store genau einmal anlegen; spätere Einstellungsänderungen laufen über setCoach
  const [store] = useState(() =>
    createPlayStore({
      engine: getEngine(),
      repo: getGameRepository(),
      coach: { enabled: settings.enabled, pauseOnMistake: settings.pauseOnMistake },
    }),
  )
  useEffect(() => {
    let cancelled = false
    void getGameRepository()
      .latestUnfinished('free')
      .then((g) => {
        if (cancelled) return
        if (g) store.getState().resume(g)
        else store.getState().newGame({ playerColor: 'w', level: store.getState().level })
      })
    return () => {
      cancelled = true
    }
  }, [store])
  return store
}

export function PlayPage() {
  const [settings, setSettings] = useState<CoachSettings>(loadSettings)
  const store = usePlayStore(settings)
  const s = useStore(store)
  const [flipped, setFlipped] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [claudeAvailable, setClaudeAvailable] = useState(false)
  /** Hinweisstufe für die aktuelle Stellung (0 = keiner) */
  const [hint, setHint] = useState<{ fen: string; level: number }>({ fen: '', level: 0 })

  useEffect(() => {
    void fetchClaudeAvailable().then(setClaudeAvailable)
  }, [])

  const updateSettings = (patch: Partial<CoachSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next)
    store.getState().setCoach({ enabled: next.enabled, pauseOnMistake: next.pauseOnMistake })
  }

  // Vibration, wenn der Coach einen Fehler oder Patzer meldet
  useEffect(() => {
    if (s.review && (s.review.moveClass === 'mistake' || s.review.moveClass === 'blunder')) vibrate('error')
  }, [s.review])

  const fen = s.currentFen()
  const last = s.moves[s.moves.length - 1]
  const playerSide = s.playerColor === 'w' ? 'white' : 'black'
  const orientation = flipped ? (playerSide === 'white' ? 'black' : 'white') : playerSide
  const over = s.status.over || s.resigned
  const strength = getStrength(s.level)
  const playerToMove = !over && !s.paused && !s.reviewing && !s.engineThinking && s.status.turn === s.playerColor

  // Plan-Ideen für die aktuelle Stellung (nur wenn du am Zug bist)
  const currentAnalysis = s.analysis && s.analysis.fen === fen ? s.analysis : null
  const plans = useMemo(
    () => (settings.enabled && playerToMove ? suggestPlans(fen, s.playerColor, 3, currentAnalysis ?? undefined) : null),
    [settings.enabled, playerToMove, fen, s.playerColor, currentAnalysis],
  )
  const hints = useMemo(() => (playerToMove && currentAnalysis ? buildHints(fen, currentAnalysis) : []), [playerToMove, currentAnalysis, fen])
  const hintLevel = hint.fen === fen ? hint.level : 0
  const shownHint = hintLevel > 0 ? hints[hintLevel - 1] : null
  const activePlan = plans?.find((p) => p.id === selectedPlan) ?? null

  // Pfeile/Markierungen des Coaches nur, solange das Brett die besprochene Stellung zeigt
  const review = settings.enabled ? s.review : null
  const reviewOnBoard = review && review.fenAfter === fen
  const arrows: BoardArrow[] = reviewOnBoard ? review.arrows.map((a) => ({ from: a.from, to: a.to, color: ARROW_COLOR[a.kind] })) : []
  const highlights: Record<string, BoardHighlight> = {}
  if (reviewOnBoard) Object.assign(highlights, review.highlights)
  if (activePlan) for (const sq of activePlan.squares) highlights[sq] = 'plan'
  if (shownHint?.square) highlights[shownHint.square] = 'plan'
  if (shownHint?.arrow) arrows.push({ from: shownHint.arrow.from, to: shownHint.arrow.to, color: 'rgba(37, 99, 235, 0.85)' })

  const marks: Record<number, MoveMark> = {}
  if (settings.enabled) {
    for (const [i, r] of Object.entries(s.reviews)) marks[Number(i)] = { symbol: CLASS_SYMBOL[r.moveClass], tone: r.moveClass }
  }

  let statusText: string
  if (s.resigned) statusText = 'Du hast aufgegeben.'
  else if (s.status.over) {
    const youWon = (s.status.result === '1-0') === (s.playerColor === 'w') && s.status.result !== '1/2-1/2'
    statusText = `${s.status.reason}. ${s.status.result === '1/2-1/2' ? 'Remis.' : youWon ? 'Du hast gewonnen! 🎉' : 'Stockfish gewinnt.'}`
  } else if (s.paused) statusText = 'Pause – schau dir die Erklärung an.'
  else if (s.reviewing) statusText = 'Coach analysiert …'
  else if (s.engineThinking) statusText = 'Stockfish denkt nach …'
  else statusText = s.status.inCheck ? 'Du stehst im Schach – du bist am Zug.' : 'Du bist am Zug.'

  const copyPgn = async () => {
    const pgn = toPgn(s.startFen, s.moves, {
      white: s.playerColor === 'w' ? 'Du' : `Stockfish Stufe ${s.level}`,
      black: s.playerColor === 'b' ? 'Du' : `Stockfish Stufe ${s.level}`,
      result: s.resigned ? (s.playerColor === 'w' ? '0-1' : '1-0') : s.status.result,
    })
    try {
      await navigator.clipboard.writeText(pgn)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('PGN kopieren:', pgn)
    }
  }

  return (
    <div className="play-layout">
      <section className="board-area">
        <EvalBar score={s.evaluation?.fen === fen ? s.evaluation.score : null} orientation={orientation} />
        <Board
          fen={fen}
          orientation={orientation}
          movableColor={playerToMove ? s.playerColor : null}
          onMove={(from, to, promo) => {
            setSelectedPlan(null)
            return store.getState().playerMove(from, to, promo)
          }}
          lastMove={last ? { from: last.from, to: last.to } : null}
          checkSquare={s.status.inCheck ? kingSquare(fen, s.status.turn) : null}
          arrows={arrows}
          highlights={highlights}
        />
      </section>

      <aside className="side-panel">
        <div className={`status ${over ? 'status-over' : ''}`} role="status" aria-live="polite">
          <span>{statusText}</span>
          {over && s.moves.length >= 4 && (
            <Link className="status-action" to={`/analyse/${s.gameId}`}>
              🔍 Analysieren
            </Link>
          )}
        </div>
        {shownHint && (
          <div className="hint-card" role="status" aria-live="polite">
            <div className="hint-head">
              <span className="hint-badge">💡 Hinweis {shownHint.level}/3</span>
              <strong>{shownHint.title}</strong>
            </div>
            <p>{shownHint.text}</p>
          </div>
        )}
        {s.engineError && <div className="error">{s.engineError}</div>}
        {setupOpen && (
          <NewGameForm
            initialLevel={s.level}
            onStart={(playerColor, level) => {
              setSetupOpen(false)
              setFlipped(false)
              setSelectedPlan(null)
              s.newGame({ playerColor, level })
            }}
          />
        )}

        {settings.enabled && (
          <CoachPanel
            review={s.review}
            reviewing={s.reviewing}
            paused={s.paused}
            onUndo={() => s.undo()}
            onContinue={() => s.continueGame()}
            plans={plans}
            selectedPlan={selectedPlan}
            onSelectPlan={setSelectedPlan}
            claudeEnabled={settings.claude && claudeAvailable}
          />
        )}

        <div className="info-line">
          Gegner: Stockfish Stufe {strength.level} – {strength.label} (ca. {strength.approxElo} Elo)
        </div>

        <h2 className="panel-title">Züge</h2>
        <MoveList moves={s.moves} marks={marks} />

        <div className="button-row small">
          <button type="button" onClick={copyPgn} disabled={s.moves.length === 0}>
            {copied ? '✓ Kopiert' : 'PGN kopieren'}
          </button>
        </div>

        <details className="settings">
          <summary>Coach-Einstellungen</summary>
          <label className="toggle">
            <input type="checkbox" checked={settings.enabled} onChange={(e) => updateSettings({ enabled: e.target.checked })} />
            Coach erklärt jeden meiner Züge
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.pauseOnMistake}
              disabled={!settings.enabled}
              onChange={(e) => updateSettings({ pauseOnMistake: e.target.checked })}
            />
            Bei Fehlern anhalten, damit ich zurücknehmen kann
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.claude}
              disabled={!settings.enabled}
              onChange={(e) => updateSettings({ claude: e.target.checked })}
            />
            „Genauer erklären“ mit Claude anbieten
          </label>
          {settings.claude && !claudeAvailable && (
            <p className="muted small">
              Dafür fehlt noch der API-Key: Kopiere <code>.env.example</code> nach <code>.env</code>, trage{' '}
              <code>ANTHROPIC_API_KEY</code> ein und starte <code>npm run dev</code> neu. Dabei werden Stellung und Engine-Analyse an die
              Claude-API geschickt.
            </p>
          )}
        </details>

        {/* Aktionsleiste: am Handy fest unten am Daumen */}
        <div className="action-bar icon-bar">
          <button type="button" onClick={() => s.undo()} disabled={s.moves.length === 0} aria-label="Zug zurücknehmen">
            <Icon name="undo" size={22} />
            <span>Zurück</span>
          </button>
          <button
            type="button"
            className={hintLevel > 0 ? 'active' : ''}
            onClick={() => setHint({ fen, level: Math.min(3, hintLevel + 1) })}
            disabled={!playerToMove || hints.length === 0 || hintLevel >= 3}
            aria-label={hintLevel === 0 ? 'Hinweis anzeigen' : 'Nächster Hinweis'}
            title={playerToMove && hints.length === 0 ? 'Engine rechnet noch …' : undefined}
          >
            <Icon name="bulb" size={22} />
            <span>{hintLevel === 0 ? 'Hinweis' : hintLevel < 3 ? 'Mehr' : 'Lösung'}</span>
          </button>
          <button type="button" onClick={() => setFlipped((f) => !f)} aria-label="Brett drehen">
            <Icon name="flip" size={22} />
            <span>Drehen</span>
          </button>
          <button type="button" onClick={() => s.resign()} disabled={over} aria-label="Aufgeben">
            <Icon name="flag" size={22} />
            <span>Aufgeben</span>
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setSetupOpen((o) => !o)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            aria-label="Neue Partie"
          >
            <Icon name="plus" size={22} />
            <span>Neu</span>
          </button>
        </div>
      </aside>
    </div>
  )
}

function NewGameForm({ initialLevel, onStart }: { initialLevel: number; onStart: (c: 'w' | 'b', level: number) => void }) {
  const [color, setColor] = useState<'w' | 'b' | 'random'>('w')
  const [level, setLevel] = useState(initialLevel)
  const cfg = getStrength(level)
  return (
    <form
      className="new-game"
      onSubmit={(e) => {
        e.preventDefault()
        onStart(color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color, level)
      }}
    >
      <fieldset>
        <legend>Deine Farbe</legend>
        <div className="segmented">
          {(
            [
              ['w', 'Weiß'],
              ['b', 'Schwarz'],
              ['random', 'Zufall'],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className={color === v ? 'active' : ''}>
              <input type="radio" name="color" value={v} checked={color === v} onChange={() => setColor(v)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="level">
        Stärke: <strong>Stufe {cfg.level}</strong> – {cfg.label} (ca. {cfg.approxElo} Elo)
        <input
          type="range"
          min={1}
          max={STRENGTH_LEVELS.length}
          value={level}
          onChange={(e) => setLevel(Number(e.target.value))}
        />
      </label>
      <button type="submit" className="primary">Partie starten</button>
    </form>
  )
}
