import { useState } from 'react'
import type { MoveReview } from '../../core/coach/explain'
import type { Plan } from '../../core/coach/plans'
import { showMove } from '../../core/coach/text/de'
import type { Color } from '../../core/chess/game'
import { CLASS_SYMBOL } from './symbols'
import { useClaudeExplain } from './useClaudeExplain'


function line(sans: string[], firstColor: Color) {
  return sans.map((s, i) => showMove(s, (i % 2 === 0) === (firstColor === 'w') ? 'w' : 'b')).join(' ')
}

interface Props {
  review: MoveReview | null
  reviewing: boolean
  paused: boolean
  onUndo: () => void
  onContinue: () => void
  plans: Plan[] | null
  selectedPlan: string | null
  onSelectPlan: (id: string | null) => void
  claudeEnabled: boolean
}

export function CoachPanel({ review, reviewing, paused, onUndo, onContinue, plans, selectedPlan, onSelectPlan, claudeEnabled }: Props) {
  return (
    <section className="coach" aria-label="Coach">
      {reviewing && <p className="coach-thinking">Coach schaut sich deinen Zug an …</p>}
      {review && !reviewing && (
        <ReviewCard review={review} paused={paused} onUndo={onUndo} onContinue={onContinue} claudeEnabled={claudeEnabled} />
      )}
      {plans && <PlanCard plans={plans} selected={selectedPlan} onSelect={onSelectPlan} />}
    </section>
  )
}

function ReviewCard({ review, paused, onUndo, onContinue, claudeEnabled }: { review: MoveReview; paused: boolean; onUndo: () => void; onContinue: () => void; claudeEnabled: boolean }) {
  const weak = review.moveClass !== 'best' && review.moveClass !== 'good'
  const claude = useClaudeExplain(review)
  const other: Color = review.mover === 'w' ? 'b' : 'w'
  return (
    <div className={`review review-${review.moveClass}`} role="status" aria-live="polite">
      <div className="review-head">
        <span className="review-badge">
          {review.label} {CLASS_SYMBOL[review.moveClass]}
        </span>
        <span className="review-move">{showMove(review.san, review.mover)}</span>
      </div>
      {review.sentences.map((s, i) => (
        <p key={i}>{s}</p>
      ))}
      {weak && review.replyLineSan.length > 0 && (
        <p className="engine-line">
          <span className="muted">Engine nach deinem Zug:</span> {line(review.replyLineSan.slice(0, 4), other)}
        </p>
      )}
      {weak && (
        <p className="legend">
          <span className="dot dot-best" /> bester Zug <span className="dot dot-threat" /> Antwort des Gegners
        </p>
      )}
      {paused && (
        <div className="button-row">
          <button type="button" className="primary" onClick={onUndo}>
            ↶ Zurücknehmen &amp; neu versuchen
          </button>
          <button type="button" onClick={onContinue}>
            Trotzdem weiterspielen
          </button>
        </div>
      )}
      {claudeEnabled && (
        <div className="claude">
          {claude.state === 'idle' && (
            <button type="button" onClick={claude.request}>
              ✦ Genauer erklären
            </button>
          )}
          {claude.state === 'loading' && <p className="muted">Claude denkt nach …</p>}
          {claude.state === 'error' && (
            <p className="error">
              {claude.error}{' '}
              <button type="button" onClick={claude.request}>
                Nochmal
              </button>
            </p>
          )}
          {claude.state === 'done' && (
            <div className="claude-text">
              {claude.text.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PlanCard({ plans, selected, onSelect }: { plans: Plan[]; selected: string | null; onSelect: (id: string | null) => void }) {
  const [revealed, setRevealed] = useState(false)
  // neue Stellung → wieder zudecken, damit du zuerst selbst nachdenkst
  const key = plans.map((p) => p.id + p.title).join('|')
  const [prevKey, setPrevKey] = useState(key)
  if (prevKey !== key) {
    setPrevKey(key)
    setRevealed(false)
  }
  return (
    <div className="plan-card">
      <h3>Was ist dein Plan?</h3>
      {!revealed ? (
        <>
          <p className="muted">Überleg kurz selbst: Was will ich in dieser Stellung erreichen? Dann vergleiche.</p>
          <button type="button" onClick={() => setRevealed(true)}>
            Plan-Ideen zeigen
          </button>
        </>
      ) : (
        <ul className="plans">
          {plans.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`plan ${selected === p.id ? 'active' : ''}`}
                aria-pressed={selected === p.id}
                onClick={() => onSelect(selected === p.id ? null : p.id)}
              >
                <strong>{p.title}</strong>
                <span>{p.why}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
