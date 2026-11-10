import { Chess, type Square } from 'chess.js'
import type { Color } from '../chess/game'
import {
  exposedPieces,
  fileOf,
  fileState,
  fullmoveOf,
  materialBalance,
  opposite,
  piecesOf,
  PIECE_VALUE,
  withTurn,
} from '../chess/board'
import type { AnalysisResult } from '../engine/types'
import { buildContext, MINOR_HOME } from './context'
import { moveFeatures } from './explain'
import { sortByWeight } from './findings'
import { pawnStructure } from './heuristics/pawnStructure'
import { joinList, shortPurpose, showMove } from './text/de'
import { threatsAgainst } from './threats'

/**
 * Plan-Modul: schlägt für eine Stellung 1–2 konkrete, verständliche Pläne vor.
 * Gedacht gegen "planloses" Spiel: Es beantwortet die Frage "Was soll ich hier eigentlich tun?"
 * Die Regeln sind nach Dringlichkeit geordnet (erst Gefahr, dann Entwicklung, dann Feinheiten).
 */
export interface Plan {
  id: string
  title: string
  why: string
  squares: Square[]
  /** Art der Idee – für die Anzeige (z. B. "Konkrete Idee" aus der Engine) */
  kind?: 'danger' | 'engine' | 'strategy'
}

const FILES = 'abcdefgh'
const DAT: Record<string, string> = { p: 'Bauern', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' }
const ACC: Record<string, string> = { p: 'deinen Bauern', n: 'deinen Springer', b: 'deinen Läufer', r: 'deinen Turm', q: 'deine Dame', k: 'deinen König' }
const ENEMY_NOM: Record<string, string> = { p: 'der Bauer', n: 'der Springer', b: 'der Läufer', r: 'der Turm', q: 'die Dame' }

function isEndgame(chess: Chess): boolean {
  const pieces = piecesOf(chess)
  const queens = pieces.filter((p) => p.type === 'q').length
  const nonPawn = pieces.filter((p) => p.type !== 'p' && p.type !== 'k').reduce((s, p) => s + PIECE_VALUE[p.type], 0)
  return queens === 0 ? nonPawn <= 26 : nonPawn <= 12
}

/**
 * Konkrete Idee aus der Engine-Hauptvariante: deine nächsten 1–2 Züge samt Zweck.
 * Macht die Vorschläge stellungsspezifisch, statt immer dieselben Faustregeln zu nennen.
 */
function engineIdea(fen: string, color: Color, analysis: AnalysisResult): Plan | null {
  const pv = analysis.lines[0]?.pv ?? []
  if (analysis.fen.split(' ').slice(0, 4).join(' ') !== fen.split(' ').slice(0, 4).join(' ') || pv.length === 0) return null
  const steps: { san: string; purpose: string | null; from: Square; to: Square }[] = []
  let current = fen
  for (let i = 0; i < Math.min(pv.length, 4); i++) {
    const ctx = buildContext(current, pv[i])
    if (!ctx) break
    if (ctx.mover === color) {
      const top = sortByWeight(moveFeatures(ctx, 'best')).find((f) => f.polarity > 0)
      steps.push({ san: showMove(ctx.move.san, color), purpose: top ? shortPurpose(top) : null, from: ctx.move.from, to: ctx.move.to })
    }
    current = ctx.fenAfter
    if (steps.length === 2) break
  }
  if (steps.length === 0) return null
  const purposes = steps.map((st) => st.purpose).filter((x): x is string => !!x)
  const title = steps.length === 2 ? `Idee: ${steps[0].san}, danach ${steps[1].san}` : `Idee: ${steps[0].san}`
  const why = purposes.length
    ? `Ziel: ${joinList(purposes)}. Überleg dir, warum die Züge in dieser Reihenfolge Sinn ergeben.`
    : 'So verbesserst du laut Engine deine Stellung am meisten. Frag dich: Welche Figur wird dadurch aktiver, welche Schwäche des Gegners entsteht?'
  return { id: 'engine-idea', kind: 'engine', title, why, squares: [steps[0].from, steps[0].to] }
}

/** Felder, die einem Springer als Vorposten dienen könnten (eigene Bauerndeckung, kein gegnerischer Bauer kann angreifen) */
function outposts(chess: Chess, color: Color): Square[] {
  const dir = color === 'w' ? 1 : -1
  const ranks = color === 'w' ? [4, 5, 6] : [5, 4, 3]
  const enemyPawns = piecesOf(chess, opposite(color)).filter((p) => p.type === 'p')
  const out: Square[] = []
  for (const r of ranks) {
    for (let f = 1; f <= 6; f++) {
      const sq = `${FILES[f]}${r}` as Square
      if (chess.get(sq)) continue
      const supported = [f - 1, f + 1].some((ff) => {
        const p = chess.get(`${FILES[ff]}${r - dir}` as Square)
        return p?.type === 'p' && p.color === color
      })
      // kann ein gegnerischer Bauer das Feld jemals angreifen? (Bauer auf Nachbarlinie vor dem Feld)
      const attackable = enemyPawns.some((e) => Math.abs(fileOf(e.square) - f) === 1 && (Number(e.square[1]) - r) * dir > 0)
      if (supported && !attackable) out.push(sq)
    }
  }
  return out
}

export function suggestPlans(fen: string, color: Color, max = 3, analysis?: AnalysisResult): Plan[] {
  const chess = new Chess(fen)
  const plans: Plan[] = []
  const add = (p: Plan) => {
    if (!plans.some((x) => x.id === p.id)) plans.push(p)
  }
  const fullmove = fullmoveOf(fen)
  const enemy = opposite(color)
  const endgame = isEndgame(chess)

  // 0. Mattdrohung des Gegners
  const threats = threatsAgainst(fen, color)
  if (threats.mateIn1) {
    add({
      id: 'stop-mate',
      kind: 'danger',
      title: `Verhindere das Matt durch ${showMove(threats.mateIn1.san, enemy)}`,
      why: 'Der Gegner droht im nächsten Zug Matt. Alles andere ist jetzt unwichtig: decke das Feld, schaffe deinem König Luft oder schlag die angreifende Figur.',
      squares: [threats.mateIn1.from, threats.mateIn1.to],
    })
  }

  // 1. Eigene Figur in Gefahr
  const mineExposed = exposedPieces(chess, color).filter((e) => e.expectedLoss >= 1)
  if (mineExposed.length) {
    const e = mineExposed[0]
    add({
      id: 'save-piece',
      kind: 'danger',
      title: `Sichere ${ACC[e.type]} auf ${e.square}`,
      why: `Er wird angegriffen und ist nicht ausreichend gedeckt. Bevor du etwas Neues planst: erst die Figur wegziehen, decken oder den Angreifer abtauschen.`.replace(
        'Er wird',
        e.type === 'q' ? 'Sie wird' : 'Er wird',
      ),
      squares: [e.square, ...e.attackers],
    })
  }

  // 1b. Konkrete Idee aus der Engine-Variante
  if (analysis && chess.turn() === color) {
    const idea = engineIdea(fen, color, analysis)
    if (idea) add(idea)
  }

  // 2. Gegnerische Figur ungedeckt (nur wenn wir am Zug sind)
  if (chess.turn() === color) {
    const theirs = exposedPieces(chess, enemy).filter((e) => e.expectedLoss >= 2)
    if (theirs.length) {
      const e = theirs[0]
      add({
        id: 'win-material',
        title: `Prüfe, ob du ${e.type === 'q' ? 'die Dame' : `den ${DAT[e.type]}`} auf ${e.square} gewinnen kannst`,
        why: `${cap(ENEMY_NOM[e.type])} ist angegriffen und nicht ausreichend gedeckt. Schau aber vorher, ob nach dem Schlagen eine Falle droht.`,
        squares: [e.square, ...e.attackers],
      })
    }
  }

  // 3. Entwicklung
  const homeMinors = MINOR_HOME[color].filter((sq) => {
    const p = chess.get(sq as Square)
    return p?.color === color && (p.type === 'n' || p.type === 'b')
  }) as Square[]
  if (!endgame && fullmove <= 15 && homeMinors.length >= 2) {
    add({
      id: 'develop',
      title: 'Entwickle deine Leichtfiguren',
      why: `Auf ${joinList(homeMinors)} stehen noch Figuren, die nicht mitspielen. Faustregel: Springer vor Läufern, jede Figur möglichst nur einmal ziehen, Richtung Zentrum.`,
      squares: homeMinors,
    })
  }

  // 4. Rochade
  const rights = chess.getCastlingRights(color)
  const king = chess.findPiece({ type: 'k', color })[0]
  if (!endgame && king && (rights.k || rights.q) && fullmove >= 3) {
    const rank = color === 'w' ? '1' : '8'
    const between = (files: string) =>
      files.split('').map((f) => `${f}${rank}` as Square).filter((sq) => chess.get(sq))
    const blockK = rights.k ? between('fg') : null
    const blockQ = rights.q ? between('bcd') : null
    const best = blockK && (!blockQ || blockK.length <= blockQ.length) ? { side: 'kurz', block: blockK } : { side: 'lang', block: blockQ! }
    add({
      id: 'castle',
      title: 'Bring deinen König in Sicherheit: rochiere',
      why:
        best.block.length === 0
          ? `Die ${best.side}e Rochade ist jetzt möglich. Danach steht der König hinter seinen Bauern sicher, und der Turm kommt ins Spiel.`
          : `Für die ${best.side}e Rochade müssen noch ${joinList(best.block)} frei werden. Ein König in der Mitte wird schnell zum Angriffsziel.`,
      squares: [king, ...best.block],
    })
  }

  // 5. Zentrum
  if (!endgame && fullmove <= 10) {
    const centerRanks = color === 'w' ? ['4', '5'] : ['5', '4']
    const hasCenterPawn = piecesOf(chess, color).some((p) => p.type === 'p' && 'de'.includes(p.square[0]) && centerRanks.includes(p.square[1]))
    if (!hasCenterPawn) {
      add({
        id: 'center',
        title: 'Nimm dir einen Anteil am Zentrum',
        why: 'Ein Bauer auf d4/e4 (bzw. d5/e5) gibt deinen Figuren Platz und nimmt dem Gegner gute Felder weg.',
        squares: (color === 'w' ? ['d4', 'e4'] : ['d5', 'e5']) as Square[],
      })
    }
  }

  // 6. Türme auf offene Linien
  if (!endgame || piecesOf(chess, color).some((p) => p.type === 'r')) {
    const rooks = piecesOf(chess, color).filter((p) => p.type === 'r')
    const open = [...Array(8).keys()].filter((f) => fileState(chess, f, color) === 'open')
    const halfOpen = [...Array(8).keys()].filter((f) => fileState(chess, f, color) === 'half-open')
    const target = open[0] ?? halfOpen[0]
    const castled = !rights.k && !rights.q && king && 'gcb'.includes(king[0])
    if (rooks.length && target !== undefined && !rooks.some((r) => fileOf(r.square) === target) && (castled || endgame)) {
      add({
        id: 'rook-file',
        title: `Stell einen Turm auf die ${open.includes(target) ? 'offene' : 'halboffene'} ${FILES[target]}-Linie`,
        why: 'Türme brauchen freie Linien. Dort drücken sie bis in die gegnerische Stellung hinein.',
        squares: [rooks[0].square, `${FILES[target]}${color === 'w' ? '1' : '8'}` as Square],
      })
    }
  }

  // 7. Gegnerische Schwäche
  const theirStruct = pawnStructure(chess, enemy)
  const isolated = [...theirStruct.isolated]
  if (!endgame && fullmove > 10 && isolated.length) {
    add({
      id: 'attack-weakness',
      title: `Greif den isolierten Bauern auf ${isolated[0]} an`,
      why: 'Kein Nachbarbauer kann ihn schützen – der Gegner muss ihn mit Figuren decken, die dann woanders fehlen. Das Feld davor ist ein guter Platz für deine Figuren.',
      squares: [isolated[0]],
    })
  }

  // 8. Eigener Freibauer
  const passed = [...pawnStructure(chess, color).passed]
  if (passed.length && (endgame || fullmove > 20)) {
    const furthest = passed.sort((a, b) => (color === 'w' ? Number(b[1]) - Number(a[1]) : Number(a[1]) - Number(b[1])))[0]
    add({
      id: 'push-passer',
      title: `Schieb deinen Freibauern auf ${furthest} vorwärts`,
      why: 'Freibauern müssen laufen! Unterstütze ihn mit König oder Turm – Türme gehören hinter den Freibauern.',
      squares: [furthest],
    })
  }

  // 9. Endspiel: König aktivieren
  if (endgame && king) {
    add({
      id: 'activate-king',
      title: 'Aktiviere deinen König',
      why: 'Im Endspiel ist der König eine starke Figur. Bring ihn Richtung Zentrum oder zu den Bauern.',
      squares: [king],
    })
  }

  // 10. Materialvorteil verwerten
  if (materialBalance(chess, color) >= 2 && !endgame) {
    add({
      id: 'trade',
      title: 'Tausche Figuren ab',
      why: 'Du hast mehr Material. Jeder Figurentausch macht deinen Vorteil größer und nimmt dem Gegner Angriffschancen. Tausche Figuren, nicht Bauern.',
      squares: [],
    })
  }

  // 10b. Materialrückstand: Komplikationen statt Tausch
  if (materialBalance(chess, color) <= -2 && !endgame) {
    add({
      id: 'behind',
      title: 'Du liegst zurück: Bleib aktiv',
      why: 'Mit weniger Material helfen dir Tauschaktionen nicht. Behalte deine Figuren, schaffe Drohungen gegen den König und suche Stellungen, in denen der Gegner Fehler machen kann.',
      squares: [],
    })
  }

  // 12. Vorposten für einen Springer
  if (!endgame && fullmove >= 8) {
    const posts = outposts(chess, color)
    const knights = piecesOf(chess, color).filter((p) => p.type === 'n')
    if (posts.length && knights.length) {
      const target = posts.sort((a, b) => Math.abs(3.5 - fileOf(a)) - Math.abs(3.5 - fileOf(b)))[0]
      add({
        id: 'outpost',
        title: `Bring einen Springer auf den Vorposten ${target}`,
        why: `Auf ${target} wird der Springer von einem Bauern gedeckt, und kein gegnerischer Bauer kann ihn je vertreiben. Von dort greift er tief ins gegnerische Lager.`,
        squares: [target, knights[0].square],
      })
    }
  }

  // 13. Königsangriff, wenn der gegnerische Bauernschutz Lücken hat
  const enemyKing = chess.findPiece({ type: 'k', color: enemy })[0]
  if (!endgame && enemyKing && 'gh'.includes(enemyKing[0])) {
    const shieldRank = enemy === 'w' ? 2 : 7
    const missing = ['f', 'g', 'h'].filter((f) => {
      const p = chess.get(`${f}${shieldRank}` as Square)
      const ahead = chess.get(`${f}${shieldRank + (enemy === 'w' ? 1 : -1)}` as Square)
      return !(p?.type === 'p' && p.color === enemy) && !(ahead?.type === 'p' && ahead.color === enemy)
    })
    const attackers = piecesOf(chess, color).filter((p) => p.type === 'q' || p.type === 'r' || p.type === 'b' || p.type === 'n').length
    if (missing.length && attackers >= 3) {
      const holes = missing.map((f) => `${f}${shieldRank}`)
      add({
        id: 'king-attack',
        title: 'Greif den gegnerischen König an',
        why: `Vor dem König fehlt Bauernschutz (${joinList(holes)}). Bring Dame und weitere Figuren in Richtung Königsflügel – gemeinsam können sie dort durchbrechen.`,
        squares: holes as Square[],
      })
    }
  }

  // 11. Rückfall (nur wenn sonst nichts greift): schlechteste Figur verbessern
  if (plans.length < 2 && !plans.some((p) => p.id === 'develop')) {
    const turnChess = withTurn(fen, color)
    if (turnChess) {
      const worst = piecesOf(turnChess, color)
        .filter((p) => p.type !== 'k' && p.type !== 'p')
        .map((p) => ({ p, mobility: turnChess.moves({ square: p.square }).length }))
        .sort((a, b) => a.mobility - b.mobility)[0]
      if (worst) {
        // bestes sicheres Zielfeld: maximale Beweglichkeit danach, nicht hängend
        let bestTarget: Square | null = null
        let bestMob = worst.mobility
        for (const m of turnChess.moves({ square: worst.p.square, verbose: true })) {
          const after = new Chess(m.after)
          if (exposedPieces(after, color).some((e) => e.square === m.to)) continue
          const again = withTurn(m.after, color)
          const mob = again ? again.moves({ square: m.to }).length : 0
          if (mob > bestMob) {
            bestMob = mob
            bestTarget = m.to
          }
        }
        add({
          id: 'improve-worst',
          title: bestTarget ? `Verbessere ${ACC[worst.p.type]}: z. B. nach ${bestTarget}` : `Verbessere ${ACC[worst.p.type]} auf ${worst.p.square}`,
          why: bestTarget
            ? `Auf ${worst.p.square} hat ${worst.p.type === 'q' ? 'sie' : 'er'} nur ${worst.mobility} Züge, auf ${bestTarget} wären es ${bestMob}. Aktive Figuren gewinnen Partien.`
            : `${worst.p.type === 'q' ? 'Sie' : 'Er'} hat kaum gute Felder. Frag dich: Wo würde diese Figur am meisten bewirken – und wie kommt sie dorthin?`,
          squares: bestTarget ? [worst.p.square, bestTarget] : [worst.p.square],
        })
      }
    }
  }
  return plans.slice(0, max)
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
