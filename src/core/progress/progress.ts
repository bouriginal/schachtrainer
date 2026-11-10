import type { FindingKind } from '../coach/findings'
import type { Endgame } from '../endgames/endgame'
import type { Repertoire } from '../openings/repertoire'
import type { StudyCard } from '../openings/srs'
import { progress as openingProgress, type RepertoireProgress } from '../openings/trainer'
import type { EndgameResult, OpeningLogEntry, PuzzleAttempt, StoredGame } from '../storage/db'
import { START_RATING, updateRating } from '../tactics/puzzle'
import { themeName, THEMES } from '../tactics/themes'
import { germanSan } from '../chess/notation'

/* ───────────────────────── Statistik ───────────────────────── */

export interface GameStats {
  played: number
  wins: number
  draws: number
  losses: number
  /** Fehler + Patzer pro Partie (eigene Züge, mit Coach-Bewertung) */
  mistakesPerGame: number | null
  /** durchschnittliche Genauigkeit der analysierten Partien (eigene Farbe) */
  accuracy: number | null
  /** letzte Partien, älteste zuerst: Fehler+Patzer je Partie */
  recentMistakes: number[]
}

export function gameStats(games: readonly StoredGame[]): GameStats {
  const finished = games.filter((g) => g.result !== '*')
  let wins = 0
  let draws = 0
  let losses = 0
  for (const g of finished) {
    if (g.result === '1/2-1/2') draws++
    else if ((g.result === '1-0') === (g.playerColor === 'w')) wins++
    else losses++
  }
  const reviewed = games.filter((g) => (g.reviews?.length ?? 0) >= 5).sort((a, b) => a.updatedAt - b.updatedAt)
  const bad = (g: StoredGame) => (g.reviews ?? []).filter((r) => r.moveClass === 'mistake' || r.moveClass === 'blunder').length
  const analyzed = games.filter((g) => g.analysis)
  return {
    played: finished.length,
    wins,
    draws,
    losses,
    mistakesPerGame: reviewed.length ? Math.round((reviewed.reduce((s, g) => s + bad(g), 0) / reviewed.length) * 10) / 10 : null,
    accuracy: analyzed.length ? Math.round(analyzed.reduce((s, g) => s + g.analysis!.accuracy[g.playerColor], 0) / analyzed.length) : null,
    recentMistakes: reviewed.slice(-10).map(bad),
  }
}

export interface ThemeStat {
  theme: string
  name: string
  tried: number
  solved: number
  rate: number
}

export interface TacticsStats {
  attempts: number
  solvedRate: number | null
  /** Wertungsverlauf (nach jedem Versuch), beginnend mit dem Startwert */
  ratingHistory: number[]
  themes: ThemeStat[]
}

export function tacticsStats(attempts: readonly PuzzleAttempt[]): TacticsStats {
  const sorted = [...attempts].sort((a, b) => a.at - b.at)
  const history = [START_RATING]
  for (const a of sorted) history.push(updateRating(history[history.length - 1], a.puzzleRating, a.solved))
  // je Aufgabe zählt der erste Versuch – Wiederholungen verfälschen sonst die Quote
  const first = new Map<string, PuzzleAttempt>()
  for (const a of sorted) if (!first.has(a.puzzleId)) first.set(a.puzzleId, a)
  const themes = THEMES.map((t) => {
    const xs = [...first.values()].filter((a) => a.theme === t.id)
    const solved = xs.filter((a) => a.solved).length
    return { theme: t.id, name: t.name, tried: xs.length, solved, rate: xs.length ? solved / xs.length : 0 }
  })
  const all = [...first.values()]
  return {
    attempts: sorted.length,
    solvedRate: all.length ? all.filter((a) => a.solved).length / all.length : null,
    ratingHistory: history,
    themes,
  }
}

export interface WeakSpot {
  key: string
  /** erwarteter Zug in deutscher Notation */
  expected: string
  wrong: number
  /** was du stattdessen gespielt hast (häufigster Fehler) */
  played?: string
}

export interface OpeningStats extends RepertoireProgress {
  repId: string
  name: string
  /** Trefferquote der letzten 50 Abfragen */
  accuracy: number | null
  weakSpots: WeakSpot[]
}

export function openingStats(rep: Repertoire, cards: ReadonlyMap<string, StudyCard>, logs: readonly OpeningLogEntry[], now: Date): OpeningStats {
  const mine = logs.filter((l) => l.repId === rep.id).sort((a, b) => b.at - a.at)
  const recent = mine.slice(0, 50)
  const byKey = new Map<string, OpeningLogEntry[]>()
  for (const l of mine) byKey.set(l.key, [...(byKey.get(l.key) ?? []), l])
  const weakSpots: WeakSpot[] = []
  for (const [key, ls] of byKey) {
    const wrong = ls.filter((l) => l.outcome === 'wrong')
    if (wrong.length < 2) continue
    const played = mostCommon(wrong.map((l) => l.played).filter((x): x is string => !!x))
    weakSpots.push({ key, expected: germanSan(ls[0].san), wrong: wrong.length, played: played ? germanSan(played) : undefined })
  }
  weakSpots.sort((a, b) => b.wrong - a.wrong)
  return {
    repId: rep.id,
    name: rep.name,
    ...openingProgress(rep, cards, now),
    accuracy: recent.length ? recent.filter((l) => l.outcome === 'correct').length / recent.length : null,
    weakSpots: weakSpots.slice(0, 3),
  }
}

/* ───────────────────────── Fehlermuster ───────────────────────── */

export type PatternId = 'hanging' | 'double-attack' | 'mate' | 'king-safety' | 'development' | 'structure'

interface PatternDef {
  id: PatternId
  kinds: FindingKind[]
  title: string
  explanation: string
  rule: string
  practice: { title: string; to: string }
}

export const PATTERNS: PatternDef[] = [
  {
    id: 'hanging',
    kinds: ['hanging_after'],
    title: 'Du lässt Figuren ungedeckt stehen',
    explanation: 'Nach deinem Zug konnte der Gegner eine Figur einfach schlagen.',
    rule: 'Mach vor jedem Zug den „Sicherheits-Check“: Welche meiner Figuren ist angegriffen oder ungedeckt? Was kann der Gegner schlagen?',
    practice: { title: 'Taktik: Hängende Figuren', to: '/taktik?motiv=hangingPiece' },
  },
  {
    id: 'double-attack',
    kinds: ['reply_attack'],
    title: 'Du übersiehst Doppelangriffe',
    explanation: 'Der Gegner konnte mit einem Zug zwei deiner Figuren gleichzeitig angreifen.',
    rule: 'Frag dich nach jedem Zug: Welche Felder könnte ein gegnerischer Springer oder die Dame erreichen, um zwei Ziele zu treffen?',
    practice: { title: 'Taktik: Gabeln', to: '/taktik?motiv=fork' },
  },
  {
    id: 'mate',
    kinds: ['reply_mate'],
    title: 'Du übersiehst Mattdrohungen',
    explanation: 'Nach deinem Zug konnte der Gegner mattsetzen.',
    rule: 'Prüfe vor jedem Zug alle Schachgebote des Gegners – besonders gegen deinen König auf der Grundreihe.',
    practice: { title: 'Taktik: Matt in 2', to: '/taktik?motiv=mateIn2' },
  },
  {
    id: 'king-safety',
    kinds: ['king_in_center', 'lost_castling', 'pawn_shield'],
    title: 'Dein König steht oft unsicher',
    explanation: 'Dein König blieb in der Mitte, verlor das Rochaderecht oder seinen Bauernschutz.',
    rule: 'Rochiere möglichst bis Zug 10 und zieh die Bauern vor deinem rochierten König nur mit gutem Grund.',
    practice: { title: 'Eröffnungen üben – dort steht die Rochade im Plan', to: '/eroeffnungen' },
  },
  {
    id: 'development',
    kinds: ['early_queen', 'moved_twice', 'flank_pawn'],
    title: 'Du entwickelst deine Figuren zu langsam',
    explanation: 'Dame zu früh, dieselbe Figur mehrfach gezogen oder Randbauernzüge in der Eröffnung.',
    rule: 'In den ersten 10 Zügen: Springer und Läufer raus, Zentrum besetzen, rochieren – jede Figur möglichst nur einmal ziehen.',
    practice: { title: 'Eine Eröffnungslinie lernen', to: '/eroeffnungen' },
  },
  {
    id: 'structure',
    kinds: ['doubled_pawns', 'isolated_pawn'],
    title: 'Du schwächst deine Bauernstruktur',
    explanation: 'Durch deine Züge entstanden Doppel- oder isolierte Bauern.',
    rule: 'Bauern können nicht zurück. Prüfe vor jedem Bauernzug und Abtausch, ob danach ein Bauer allein dasteht.',
    practice: { title: 'Endspiele: Bauernendspiele verstehen', to: '/endspiele' },
  },
]

export interface MistakePattern {
  id: PatternId
  title: string
  explanation: string
  rule: string
  practice: { title: string; to: string }
  /** wie oft in den betrachteten Partien */
  count: number
  /** in wie vielen Partien */
  games: number
  examples: { gameId: string; ply: number; san: string }[]
}

/**
 * Wiederkehrende Fehler: zählt die Coach-Befunde deiner ungenauen und fehlerhaften Züge
 * über die letzten Partien. Ein Muster gilt als wiederkehrend ab 2 Vorkommen in 2 Partien.
 */
export function recurringMistakes(games: readonly StoredGame[], lastN = 20): MistakePattern[] {
  const recent = [...games].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, lastN)
  const out: MistakePattern[] = []
  for (const def of PATTERNS) {
    const examples: MistakePattern['examples'] = []
    const inGames = new Set<string>()
    for (const g of recent) {
      for (const r of g.reviews ?? []) {
        if (r.moveClass === 'best' || r.moveClass === 'good') continue
        if (!r.kinds.some((k) => def.kinds.includes(k))) continue
        examples.push({ gameId: g.id, ply: r.ply, san: germanSan(r.san) })
        inGames.add(g.id)
      }
    }
    if (examples.length >= 2 && inGames.size >= 2) {
      out.push({ ...def, count: examples.length, games: inGames.size, examples: examples.slice(0, 5) })
    }
  }
  return out.sort((a, b) => b.count - a.count)
}

/* ───────────────────────── Übungsvorschläge ───────────────────────── */

export interface Suggestion {
  id: string
  title: string
  why: string
  to: string
  priority: number
}

export interface SuggestionInput {
  games: readonly StoredGame[]
  openings: readonly OpeningStats[]
  tactics: TacticsStats
  endgames: readonly Endgame[]
  endgameResults: readonly EndgameResult[]
  patterns: readonly MistakePattern[]
}

/** Die 5 sinnvollsten nächsten Übungen, aus allen Bereichen zusammen */
export function buildSuggestions(x: SuggestionInput): Suggestion[] {
  const s: Suggestion[] = []

  for (const o of x.openings) {
    if (o.due > 0) s.push({ id: `due-${o.repId}`, title: `${o.name}: ${o.due} Stellungen wiederholen`, why: 'Sie sind heute fällig – kurz wiederholen festigt das Gedächtnis am besten.', to: `/eroeffnungen/${o.repId}/training?modus=ueben`, priority: 90 + Math.min(o.due, 9) })
    if (o.weakSpots[0]) {
      const w = o.weakSpots[0]
      s.push({ id: `weak-${o.repId}`, title: `${o.name}: Stelle mit ${w.expected} üben`, why: `Hier lagst du schon ${w.wrong}× daneben${w.played ? ` (meist mit ${w.played})` : ''}.`, to: `/eroeffnungen/${o.repId}/training?modus=ueben`, priority: 72 + w.wrong })
    }
  }

  for (const p of x.patterns) {
    s.push({ id: `pattern-${p.id}`, title: p.practice.title, why: `${p.title} (${p.count}× in ${p.games} Partien). ${p.rule}`, to: p.practice.to, priority: 80 + Math.min(p.count, 15) })
  }

  const weakTheme = x.tactics.themes.filter((t) => t.tried >= 5 && t.rate < 0.6).sort((a, b) => a.rate - b.rate)[0]
  if (weakTheme) {
    s.push({ id: `theme-${weakTheme.theme}`, title: `Taktik: ${weakTheme.name}`, why: `Bisher nur ${Math.round(weakTheme.rate * 100)} % gelöst – hier steckt das meiste Potenzial.`, to: `/taktik?motiv=${weakTheme.theme}`, priority: 70 })
  } else if (x.tactics.attempts === 0) {
    s.push({ id: 'tactics-start', title: `Taktik: ${themeName('hangingPiece')}`, why: 'Der beste Einstieg: ungedeckte Figuren sehen – beim Gegner und bei dir selbst.', to: '/taktik?motiv=hangingPiece', priority: 65 })
  } else {
    s.push({ id: 'tactics-more', title: 'Taktik: 10 gemischte Aufgaben', why: 'Taktik entscheidet die meisten Partien auf deinem Niveau – ein paar Aufgaben am Tag schärfen den Blick.', to: '/taktik', priority: 58 })
  }

  // Repertoire, das noch gar nicht begonnen wurde
  const fresh = x.openings.find((o) => o.learned === 0)
  if (fresh) s.push({ id: `learn-${fresh.repId}`, title: `${fresh.name}: erste Linie lernen`, why: 'Mit einer Hauptlinie und ihren Ideen weißt du in der Eröffnung, was du willst.', to: `/eroeffnungen/${fresh.repId}`, priority: 52 })

  const unanalyzed = [...x.games].filter((g) => g.result !== '*' && !g.analysis && g.moves.length >= 10).sort((a, b) => b.updatedAt - a.updatedAt)[0]
  if (unanalyzed) s.push({ id: `analyze-${unanalyzed.id}`, title: 'Deine letzte Partie analysieren', why: 'Aus eigenen Partien lernt man am meisten: Wo kippte die Partie?', to: `/analyse/${unanalyzed.id}`, priority: 75 })

  const solved = new Set(x.endgameResults.filter((r) => r.success).map((r) => r.endgameId))
  const nextEndgame = x.endgames.find((e) => !solved.has(e.id))
  if (nextEndgame) s.push({ id: `endgame-${nextEndgame.id}`, title: `Endspiel: ${nextEndgame.title}`, why: nextEndgame.lesson, to: `/endspiele/${nextEndgame.id}`, priority: solved.size === 0 ? 55 : 50 })

  if (x.games.filter((g) => g.result !== '*').length === 0) {
    s.push({ id: 'play', title: 'Eine Partie mit Coach spielen', why: 'Der Coach erklärt jeden Zug – so findet die App heraus, woran du arbeiten solltest.', to: '/spielen', priority: 60 })
  }

  return s.sort((a, b) => b.priority - a.priority).slice(0, 5)
}

function mostCommon<T>(xs: T[]): T | undefined {
  const m = new Map<T, number>()
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

