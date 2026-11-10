import type { MoveClass } from '../../core/coach/classify'

/** Übliche Kommentarzeichen zur Zugbewertung */
export const CLASS_SYMBOL: Record<MoveClass, string> = { best: '!', good: '', inaccuracy: '?!', mistake: '?', blunder: '??' }
