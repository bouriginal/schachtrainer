import { useEffect, useState } from 'react'
import type { StudyCard } from '../../core/openings/srs'
import { getCardRepository } from '../../services'

/** Lädt alle Lernkarten (für Übersicht und Fortschrittsanzeige). `now` = Ladezeitpunkt für "fällig". */
export function useCards(): { cards: Map<string, StudyCard>; now: Date } | null {
  const [cards, setCards] = useState<{ cards: Map<string, StudyCard>; now: Date } | null>(null)
  useEffect(() => {
    let alive = true
    void getCardRepository()
      .all()
      .then((list) => alive && setCards({ cards: new Map(list.map((c) => [c.id, c])), now: new Date() }))
      .catch(() => alive && setCards({ cards: new Map(), now: new Date() }))
    return () => {
      alive = false
    }
  }, [])
  return cards
}
