import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { RateBar, Sparkline } from '../../ui/charts'
import { ENDGAMES, loadProgress, type ProgressData } from './loadProgress'

export function ProgressPage() {
  const [d, setD] = useState<ProgressData | null>(null)
  useEffect(() => {
    void loadProgress().then(setD)
  }, [])
  if (!d) return <p className="muted">Lade deine Statistik …</p>

  const solvedEndgames = new Set(d.endgameResults.filter((r) => r.success).map((r) => r.endgameId))
  const triedThemes = d.tactics.themes.filter((t) => t.tried > 0).sort((a, b) => a.rate - b.rate)
  const rating = d.tactics.ratingHistory.at(-1)!

  return (
    <div className="progress-page">
      <h1>Dein Fortschritt</h1>

      <section>
        <h2>Als Nächstes üben</h2>
        <ol className="suggestions">
          {d.suggestions.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{s.title}</strong>
                <p className="muted small">{s.why}</p>
              </div>
              <Link className="button primary" to={s.to}>
                Los
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>Wiederkehrende Fehler</h2>
        {d.patterns.length === 0 ? (
          <p className="muted">
            Noch keine Muster erkannt. Dafür braucht der Coach mindestens zwei Partien mit ähnlichen Fehlern – spiel mit Coach oder lass
            importierte Partien analysieren.
          </p>
        ) : (
          <ul className="patterns">
            {d.patterns.map((p) => (
              <li key={p.id} className="pattern">
                <div className="pattern-head">
                  <strong>{p.title}</strong>
                  <span className="badge">
                    {p.count}× in {p.games} Partien
                  </span>
                </div>
                <p className="small">{p.explanation}</p>
                <p className="small">
                  <strong>Merksatz:</strong> {p.rule}
                </p>
                <p className="small muted">
                  Beispiele:{' '}
                  {p.examples.map((e, i) => (
                    <span key={i}>
                      {i > 0 && ', '}
                      <Link to={`/analyse/${e.gameId}?zug=${e.ply}`}>{e.san}</Link>
                    </span>
                  ))}
                </p>
                <Link className="button" to={p.practice.to}>
                  {p.practice.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Partien</h2>
        <div className="tiles">
          <div className="tile">
            <span className="tile-value">{d.games.played}</span>
            <span className="tile-label">beendet</span>
          </div>
          <div className="tile">
            <span className="tile-value">
              {d.games.wins} / {d.games.draws} / {d.games.losses}
            </span>
            <span className="tile-label">Siege / Remis / Niederlagen</span>
          </div>
          <div className="tile">
            <span className="tile-value">{d.games.mistakesPerGame ?? '–'}</span>
            <span className="tile-label">Fehler + Patzer pro Partie</span>
          </div>
          <div className="tile">
            <span className="tile-value">{d.games.accuracy !== null ? `${d.games.accuracy} %` : '–'}</span>
            <span className="tile-label">Genauigkeit (analysiert)</span>
          </div>
        </div>
        {d.games.recentMistakes.length >= 2 && (
          <div className="mini-bars" role="img" aria-label={`Fehler und Patzer in den letzten Partien: ${d.games.recentMistakes.join(', ')}`}>
            {d.games.recentMistakes.map((m, i) => (
              <span key={i} title={`${m} Fehler/Patzer`} style={{ height: `${Math.min(100, 12 + m * 18)}%` }} />
            ))}
            <span className="mini-bars-label small muted">Fehler je Partie, älteste links</span>
          </div>
        )}
        <p>
          <Link to="/analyse">Partien analysieren oder PGN importieren →</Link>
        </p>
      </section>

      <section>
        <h2>Eröffnungen</h2>
        {d.openings.map((o) => (
          <div key={o.repId} className="opening-stat">
            <RateBar label={o.name} rate={o.total ? o.learned / o.total : 0} detail={`${o.learned}/${o.total} gelernt`} />
            <p className="small muted">
              {o.due > 0 ? `${o.due} fällig · ` : ''}
              {o.accuracy !== null ? `Trefferquote zuletzt ${Math.round(o.accuracy * 100)} %` : 'noch nicht geübt'}
              {o.weakSpots.length > 0 &&
                ` · Schwachstellen: ${o.weakSpots.map((w) => `${w.expected} (${w.wrong}× falsch${w.played ? `, meist ${w.played}` : ''})`).join('; ')}`}
            </p>
          </div>
        ))}
      </section>

      <section>
        <h2>Taktik</h2>
        <div className="tactics-summary">
          <div className="tile">
            <span className="tile-value">{rating}</span>
            <span className="tile-label">Taktik-Wertung</span>
          </div>
          <Sparkline values={d.tactics.ratingHistory} label="Verlauf der Taktik-Wertung" />
          <p className="small muted">
            {d.tactics.attempts} {d.tactics.attempts === 1 ? 'Versuch' : 'Versuche'}
            {d.tactics.solvedRate !== null && ` · ${Math.round(d.tactics.solvedRate * 100)} % beim ersten Versuch gelöst`}
          </p>
        </div>
        {triedThemes.length === 0 ? (
          <p className="muted">Noch keine Aufgaben gelöst.</p>
        ) : (
          <div className="theme-bars">
            {triedThemes.map((t) => (
              <Link key={t.theme} to={`/taktik?motiv=${t.theme}`} className="plain">
                <RateBar label={t.name} rate={t.rate} detail={`${t.solved}/${t.tried}`} />
              </Link>
            ))}
            <p className="small muted">Schwächste Motive oben. Antippen zum Üben.</p>
          </div>
        )}
      </section>

      <section>
        <h2>Endspiele</h2>
        <RateBar label="Geschafft" rate={solvedEndgames.size / ENDGAMES.length} detail={`${solvedEndgames.size}/${ENDGAMES.length}`} />
        <ul className="endgame-checklist">
          {ENDGAMES.map((e) => (
            <li key={e.id}>
              <Link to={`/endspiele/${e.id}`}>
                {solvedEndgames.has(e.id) ? '✓' : '○'} {e.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
