import { useState } from 'react'
import type { MoveReview } from '../../core/coach/explain'
import { toExplainRequest } from '../../core/coach/llm/prompt'

type State = { state: 'idle' } | { state: 'loading' } | { state: 'done'; text: string } | { state: 'error'; error: string }

/** Fordert für eine Zugbewertung eine ausführlichere Erklärung beim lokalen Claude-Proxy an. */
export function useClaudeExplain(review: MoveReview) {
  const [s, setS] = useState<State & { for: MoveReview }>({ state: 'idle', for: review })
  // neue Bewertung → zurücksetzen
  const current = s.for === review ? s : { state: 'idle' as const, for: review }

  const request = async () => {
    setS({ state: 'loading', for: review })
    try {
      const res = await fetch('/api/coach/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toExplainRequest(review)),
      })
      const data = (await res.json()) as { text?: string; error?: string }
      if (!res.ok || !data.text) throw new Error(data.error ?? 'Keine Antwort erhalten.')
      setS({ state: 'done', text: data.text, for: review })
    } catch (e) {
      setS({ state: 'error', error: e instanceof Error ? e.message : 'Fehler bei der Anfrage.', for: review })
    }
  }

  return {
    state: current.state,
    text: current.state === 'done' ? current.text : '',
    error: current.state === 'error' ? current.error : '',
    request,
  }
}

/** Ist der Proxy mit API-Key konfiguriert? */
export async function fetchClaudeAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/coach/status')
    if (!res.ok) return false
    return ((await res.json()) as { available?: boolean }).available === true
  } catch {
    return false
  }
}
