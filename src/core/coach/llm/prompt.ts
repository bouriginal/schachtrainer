// Imports mit Endung: Diese Datei wird auch vom Node-Proxy (server/claudeProxy.ts) geladen.
import { germanSan } from '../../chess/notation.ts'
import type { MoveReview } from '../explain.ts'

/**
 * Daten, die für "Genauer erklären" an den lokalen Proxy gehen. Bewusst nur das
 * Nötigste: Stellung, Zug, Engine-Linien und die Ergebnisse der Heuristiken.
 */
export interface ExplainRequest {
  fenBefore: string
  mover: 'w' | 'b'
  san: string
  label: string
  winLoss: number
  bestSan: string | null
  bestLineSan: string[]
  replyLineSan: string[]
  coachText: string[]
  findings: { kind: string; subject: string; polarity: number; square?: string; piece?: string; san?: string; targets?: string[] }[]
}

export function toExplainRequest(r: MoveReview): ExplainRequest {
  return {
    fenBefore: r.fenBefore,
    mover: r.mover,
    san: r.san,
    label: r.label,
    winLoss: Math.round(r.winLoss),
    bestSan: r.bestSan,
    bestLineSan: r.bestLineSan.slice(0, 6),
    replyLineSan: r.replyLineSan.slice(0, 6),
    coachText: r.sentences,
    findings: r.findings.slice(0, 8).map((f) => ({
      kind: f.kind,
      subject: f.subject,
      polarity: f.polarity,
      square: f.square,
      piece: f.piece,
      san: f.san,
      targets: f.targets?.map((t) => `${t.type}@${t.square}`),
    })),
  }
}

export const SYSTEM_PROMPT = `Du bist ein geduldiger Schachtrainer für einen Anfänger (ca. 500–600 Elo), der Schach wirklich verstehen will und oft ohne Plan spielt.
Antworte auf Deutsch, in der Du-Form, in 3 bis 6 kurzen Sätzen, ohne Überschriften und ohne Aufzählungszeichen.
Verwende deutsche Figurenbuchstaben (K, D, T, L, S) und schreibe schwarze Züge mit "…" davor.
Erkläre konkret, WARUM der Zug gut oder schlecht ist, und was der bessere Zug erreicht. Nenne nur Züge, die in den gegebenen Engine-Linien stehen – erfinde keine Varianten.
Schließe mit einem kurzen Merksatz, den man auf andere Partien übertragen kann, beginnend mit "Merksatz:".`

/** Baut die Nutzernachricht für Claude. Rein, damit sie testbar bleibt. */
export function buildExplainPrompt(req: ExplainRequest): string {
  const side = req.mover === 'w' ? 'Weiß' : 'Schwarz'
  const lines = [
    `Stellung vor dem Zug (FEN): ${req.fenBefore}`,
    `Ich spiele ${side} und habe ${germanSan(req.san)} gezogen.`,
    `Engine-Urteil: ${req.label} (Verlust an Gewinnchance: ${req.winLoss} Prozentpunkte).`,
  ]
  if (req.bestSan && req.bestSan !== req.san) {
    lines.push(`Bester Zug laut Engine: ${germanSan(req.bestSan)}. Beste Variante: ${req.bestLineSan.map(germanSan).join(' ')}`)
  }
  if (req.replyLineSan.length) lines.push(`Engine-Fortsetzung nach meinem Zug: ${req.replyLineSan.map(germanSan).join(' ')}`)
  lines.push(`Erkannte Motive (Heuristiken, JSON): ${JSON.stringify(req.findings)}`)
  lines.push(`Bisherige Kurz-Erklärung des Coaches: ${req.coachText.join(' ')}`)
  lines.push('Erkläre mir das bitte genauer und verständlich.')
  return lines.join('\n')
}

/** Grenzen für eingehende Anfragen am Proxy */
export function validateExplainRequest(body: unknown): ExplainRequest | null {
  if (!body || typeof body !== 'object') return null
  const r = body as Partial<ExplainRequest>
  if (typeof r.fenBefore !== 'string' || r.fenBefore.length > 100) return null
  if (r.mover !== 'w' && r.mover !== 'b') return null
  if (typeof r.san !== 'string' || r.san.length > 10) return null
  if (!Array.isArray(r.findings) || !Array.isArray(r.coachText) || !Array.isArray(r.bestLineSan) || !Array.isArray(r.replyLineSan)) return null
  if (JSON.stringify(body).length > 8000) return null
  return r as ExplainRequest
}
