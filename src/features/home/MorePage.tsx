import { Link } from 'react-router'

const ITEMS = [
  { to: '/endspiele', title: 'Endspiele', text: 'Standardstellungen mit Lernziel gegen die Engine.' },
  { to: '/analyse', title: 'Partieanalyse', text: 'Eigene Partien analysieren, PGN importieren.' },
  { to: '/fortschritt', title: 'Fortschritt', text: 'Statistik, wiederkehrende Fehler, Übungsvorschläge.' },
  { to: '/einstellungen', title: 'Einstellungen', text: 'Töne, Coach, Backup, App installieren.' },
]

/** Sammelseite für die Bereiche, die am Handy nicht in die Tab-Leiste passen */
export function MorePage() {
  return (
    <div className="more-page">
      <h1>Mehr</h1>
      <ul className="menu-list">
        {ITEMS.map((i) => (
          <li key={i.to}>
            <Link to={i.to}>
              <strong>{i.title}</strong>
              <span>{i.text}</span>
              <span className="chevron" aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
