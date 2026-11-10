import { Link, useParams } from 'react-router'
import { lineLearned, progress } from '../../core/openings/trainer'
import { getRepertoire, getRepertoires } from '../../data/openings'
import { useCards } from './useCards'

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Gelernt">
      <div style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Übersicht aller Repertoires */
export function OpeningsPage() {
  const loaded = useCards()
  return (
    <div className="openings">
      <h1>Eröffnungen</h1>
      <p className="muted">Lerne wenige Hauptlinien – aber verstehe jeden Zug. Gelernte Züge fragt die App in wachsenden Abständen wieder ab.</p>
      <div className="module-grid">
        {getRepertoires().map((rep) => {
          const p = loaded ? progress(rep, loaded.cards, loaded.now) : null
          return (
            <Link key={rep.id} to={`/eroeffnungen/${rep.id}`} className="module-card ready rep-card">
              <span className={`color-chip ${rep.color === 'w' ? 'white' : 'black'}`}>{rep.color === 'w' ? 'Weiß' : 'Schwarz'}</span>
              <h2>{rep.name}</h2>
              <p>{rep.tagline}</p>
              {p && (
                <>
                  <ProgressBar value={p.learned} total={p.total} />
                  <p className="small muted">
                    {p.learned} von {p.total} Stellungen gelernt
                    {p.due > 0 && <strong className="due"> · {p.due} fällig</strong>}
                  </p>
                </>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

/** Ein Repertoire: Idee, typische Pläne, Linien */
export function RepertoirePage() {
  const { id = '' } = useParams()
  const rep = getRepertoire(id)
  const loaded = useCards()
  if (!rep) return <p>Diese Eröffnung gibt es nicht. <Link to="/eroeffnungen">Zur Übersicht</Link></p>
  const p = loaded ? progress(rep, loaded.cards, loaded.now) : null
  return (
    <div className="repertoire">
      <p>
        <Link to="/eroeffnungen">← Eröffnungen</Link>
      </p>
      <h1>{rep.name}</h1>
      <p className="muted">{rep.tagline}</p>
      <p>{rep.summary}</p>

      <div className="review-cta">
        {!p ? null : p.learned === 0 ? (
          <p className="muted">Lerne zuerst eine Linie – danach kannst du hier üben.</p>
        ) : (
          <Link className="button primary" to={`/eroeffnungen/${rep.id}/training?modus=ueben`}>
            {p.due > 0 ? `Üben: ${p.due} Stellungen fällig` : 'Üben (nichts fällig – freiwillig)'}
          </Link>
        )}
        {p && <ProgressBar value={p.learned} total={p.total} />}
      </div>

      <h2>Typische Pläne</h2>
      <ul className="ideas">
        {rep.ideas.map((i) => (
          <li key={i.title}>
            <strong>{i.title}</strong>
            <span>{i.text}</span>
          </li>
        ))}
      </ul>

      <h2>Linien</h2>
      <ul className="lines">
        {rep.lines.map((l) => {
          const learned = loaded ? lineLearned(rep, l.id, loaded.cards) : false
          return (
            <li key={l.id} className="line-item">
              <div>
                <strong>{l.name}</strong> {learned && <span className="badge ok">✓ gelernt</span>}
                <p className="muted small">{l.summary}</p>
              </div>
              <Link className="button" to={`/eroeffnungen/${rep.id}/training?modus=lernen&linie=${l.id}`}>
                {learned ? 'Wiederholen' : 'Lernen'}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
