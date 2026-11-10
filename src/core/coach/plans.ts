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
import { MINOR_HOME } from './context'
import { pawnStructure } from './heuristics/pawnStructure'
import { joinList } from './text/de'

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

export function suggestPlans(fen: string, color: Color, max = 2): Plan[] {
  const chess = new Chess(fen)
  const plans: Plan[] = []
  const add = (p: Plan) => {
    if (!plans.some((x) => x.id === p.id)) plans.push(p)
  }
  const fullmove = fullmoveOf(fen)
  const enemy = opposite(color)
  const endgame = isEndgame(chess)

  // 1. Eigene Figur in Gefahr
  const mineExposed = exposedPieces(chess, color).filter((e) => e.expectedLoss >= 1)
  if (mineExposed.length) {
    const e = mineExposed[0]
    add({
      id: 'save-piece',
      title: `Sichere ${ACC[e.type]} auf ${e.square}`,
      why: `Er wird angegriffen und ist nicht ausreichend gedeckt. Bevor du etwas Neues planst: erst die Figur wegziehen, decken oder den Angreifer abtauschen.`.replace(
        'Er wird',
        e.type === 'q' ? 'Sie wird' : 'Er wird',
      ),
      squares: [e.square, ...e.attackers],
    })
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

  // 11. Rückfall (nur wenn sonst nichts greift): schlechteste Figur verbessern
  if (plans.length === 0) {
    const turnChess = withTurn(fen, color)
    if (turnChess) {
      const worst = piecesOf(turnChess, color)
        .filter((p) => p.type !== 'k' && p.type !== 'p')
        .map((p) => ({ p, mobility: turnChess.moves({ square: p.square }).length }))
        .sort((a, b) => a.mobility - b.mobility)[0]
      if (worst) {
        add({
          id: 'improve-worst',
          title: `Verbessere ${ACC[worst.p.type]} auf ${worst.p.square}`,
          why: `${worst.p.type === 'q' ? 'Sie' : 'Er'} hat kaum gute Felder. Frag dich: Wo würde diese Figur am meisten bewirken – und wie kommt sie dorthin?`,
          squares: [worst.p.square],
        })
      }
    }
  }
  return plans.slice(0, max)
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
