import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { Suggestion } from '../../core/progress/progress'
import { loadProgress } from '../progress/loadProgress'

const MODULES = [
  { to: '/fortschritt', title: 'Fortschritt', text: 'Was du als Nächstes üben solltest, wiederkehrende Fehler und Statistik.' },
  { to: '/spielen', title: 'Spielen mit Coach', text: 'Gegen Stockfish mit einstellbarer Stärke – der Coach erklärt jeden deiner Züge.' },
  { to: '/eroeffnungen', title: 'Eröffnungen', text: 'Londoner System, Caro-Kann und Sizilianisch – mit den Ideen dahinter.' },
  { to: '/taktik', title: 'Taktik', text: '2.160 Aufgaben nach Motiv: Gabel, Fesselung, Spieß … – mit Erklärung des Motivs.' },
  { to: '/endspiele', title: 'Endspiele', text: 'Standardstellungen mit Lernziel gegen die Engine.' },
  { to: '/analyse', title: 'Partieanalyse', text: 'Eigene Partien Zug für Zug erklären lassen – auch per PGN-Import von Lichess oder Chess.com.' },
] as const

export function HomePage() {
  const [today, setToday] = useState<Suggestion[] | null>(null)
  useEffect(() => {
    void loadProgress()
      .then((d) => setToday(d.suggestions.slice(0, 3)))
      .catch(() => setToday([]))
  }, [])
  return (
    <div className="home">
      <h1>Willkommen im Schachtrainer</h1>
      <p className="muted">Ziel: Schach verstehen, nicht nur Züge auswendig lernen.</p>
      {today && today.length > 0 && (
        <section className="today">
          <h2>Heute üben</h2>
          <ol className="suggestions">
            {today.map((s) => (
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
          <Link to="/fortschritt" className="small">
            Alle Vorschläge und deine Statistik →
          </Link>
        </section>
      )}
      <h2 className="home-sub">Bereiche</h2>
      <div className="module-grid">
        {MODULES.map((m) => (
          <Link key={m.title} to={m.to} className="module-card ready">
            <h2>{m.title}</h2>
            <p>{m.text}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
