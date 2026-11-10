import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs'

/**
 * Spaced Repetition für Eröffnungszüge mit FSRS (ts-fsrs).
 * Eine Karte = eine Stellung, in der du deinen Repertoirezug kennen musst.
 */
export type Outcome = 'correct' | 'hint' | 'wrong'

export interface StudyCard {
  /** repId|positionKey */
  id: string
  repId: string
  key: string
  /** erwarteter Zug (SAN) – zur Anzeige in Statistiken */
  san: string
  fsrs: Card
}

const scheduler = fsrs()

const RATING: Record<Outcome, Grade> = {
  correct: Rating.Good,
  hint: Rating.Hard,
  wrong: Rating.Again,
}

/** Neue Karte nach dem ersten Durchgehen einer Linie im Lernmodus */
export function introduceCard(id: string, repId: string, key: string, san: string, now: Date): StudyCard {
  const fresh = createEmptyCard(now)
  return { id, repId, key, san, fsrs: scheduler.next(fresh, now, Rating.Good).card }
}

export function gradeCard(card: StudyCard, outcome: Outcome, now: Date): StudyCard {
  return { ...card, fsrs: scheduler.next(card.fsrs, now, RATING[outcome]).card }
}

export const isDue = (card: StudyCard, now: Date) => card.fsrs.due.getTime() <= now.getTime()

/** Für die Anzeige: "jetzt", "in 10 Min.", "morgen", "in 4 Tagen" */
export function formatDue(due: Date, now: Date): string {
  const ms = due.getTime() - now.getTime()
  if (ms <= 0) return 'jetzt'
  const min = Math.round(ms / 60_000)
  if (min < 60) return `in ${min} Min.`
  const h = Math.round(min / 60)
  if (h < 24) return `in ${h} Std.`
  const d = Math.round(h / 24)
  return d === 1 ? 'morgen' : `in ${d} Tagen`
}
