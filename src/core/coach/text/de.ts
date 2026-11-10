import type { PieceSymbol } from 'chess.js'
import type { Color } from '../../chess/game'
import { germanSan, sideName } from '../../chess/board'
import type { Finding, Target } from '../findings'

/**
 * Deutsche Satzvorlagen. Nur hier stehen Formulierungen – die Logik liegt in
 * heuristics/ und explain.ts. Anrede: "du"; Gegner: "Weiß"/"Schwarz".
 */

const NOM: Record<PieceSymbol, string> = { p: 'dein Bauer', n: 'dein Springer', b: 'dein Läufer', r: 'dein Turm', q: 'deine Dame', k: 'dein König' }
const ACC_OWN: Record<PieceSymbol, string> = { p: 'deinen Bauern', n: 'deinen Springer', b: 'deinen Läufer', r: 'deinen Turm', q: 'deine Dame', k: 'deinen König' }
const ACC_ENEMY: Record<PieceSymbol, string> = { p: 'den Bauern', n: 'den Springer', b: 'den Läufer', r: 'den Turm', q: 'die Dame', k: 'den König' }
const NAME: Record<PieceSymbol, string> = { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Zug zur Anzeige: deutsche Figurenbuchstaben, schwarze Züge mit "…" */
export function showMove(san: string, color: Color): string {
  return (color === 'b' ? '…' : '') + germanSan(san)
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`
}

/** Ziele eines Angriffs: Bauern nur als Feld ("b2"), Figuren mit Namen ("deinen Turm auf a1") */
function targetList(targets: Target[], own: boolean): string {
  return joinList(
    targets.map((t) => {
      if (t.type === 'k') return own ? 'deinen König' : 'den König'
      if (t.type === 'p') return t.square
      return `${own ? ACC_OWN[t.type] : ACC_ENEMY[t.type]} auf ${t.square}`
    }),
  )
}

export interface TextContext {
  mover: Color
}

/** saves_piece: blieb die bedrohte Figur stehen (= wurde gedeckt) oder zog sie weg? */
const defended = (f: Finding) => f.kind === 'saves_piece' && f.squares[0] === f.square

/** Ein Satz pro Finding über den eigenen (gespielten) Zug */
export function describeMoveFinding(f: Finding, { mover }: TextContext): string {
  const opp = sideName(mover === 'w' ? 'b' : 'w')
  const reply = f.san ? showMove(f.san, mover === 'w' ? 'b' : 'w') : ''
  switch (f.kind) {
    case 'hanging_after':
      return f.wasBefore
        ? `${cap(NOM[f.piece!])} auf ${f.square} hing schon vorher und ist immer noch ungeschützt${reply ? ` – ${opp} schlägt mit ${reply}` : ''}.`
        : `Danach ist ${NOM[f.piece!]} auf ${f.square} nicht ausreichend gedeckt${reply ? ` – ${opp} schlägt mit ${reply}` : ''}.`
    case 'reply_attack':
      return `${opp} kann mit ${reply} ${targetList(f.targets!, true)} angreifen.`
    case 'reply_mate':
      return `Damit erlaubst du ein Matt: ${opp} setzt mit ${reply} matt${f.count && f.count > 1 ? ` (in ${f.count} Zügen)` : ''}.`
    case 'king_in_center':
      return 'Dein König steht noch in der Mitte und ist dort leicht angreifbar.'
    case 'lost_castling':
      return 'Mit dem Königszug verlierst du das Recht zu rochieren – dein König bleibt ungeschützt in der Mitte.'
    case 'pawn_shield':
      return 'Der Bauernzug reißt eine Lücke in den Schutzwall vor deinem König.'
    case 'early_queen':
      return 'Die Dame kommt zu früh ins Spiel: Der Gegner kann sie mit Entwicklungszügen angreifen und gewinnt dabei Zeit.'
    case 'moved_twice':
      return `Du ziehst ${ACC_OWN[f.piece!]} ein zweites Mal, während andere Figuren noch auf ihren Startfeldern stehen.`
    case 'flank_pawn':
      return 'Ein Randbauernzug in der Eröffnung hilft der Entwicklung kaum – Figuren und Zentrum sind wichtiger.'
    case 'doubled_pawns':
      return 'Du bekommst Doppelbauern – sie können sich nicht gegenseitig schützen.'
    case 'isolated_pawn':
      return `Der Bauer auf ${f.square} wird isoliert: Kein Nachbarbauer kann ihn mehr decken.`
    case 'castled':
      return `Gut: Mit der ${f.side === 'king' ? 'kurzen' : 'langen'} Rochade bringst du deinen König in Sicherheit und aktivierst den Turm.`
    case 'develops':
      return `Du entwickelst ${ACC_OWN[f.piece!]} – jede Figur, die mitspielt, macht dich stärker.`
    case 'center_pawn':
      return 'Der Bauer besetzt das Zentrum und nimmt dem Gegner wichtige Felder weg.'
    case 'wins_material':
      return `Du gewinnst Material: ${ACC_ENEMY[f.piece!]} auf ${f.square} war nicht ausreichend gedeckt.`
    case 'fork':
      return `Gabel! ${cap(NOM[f.piece!])} greift ${targetList(f.targets!, false)} gleichzeitig an.`
    case 'gives_mate':
      return 'Schachmatt!'
    case 'removes_attacker':
      return `Gut: Du schlägst ${ACC_ENEMY[f.piece!]}, der ${ACC_OWN[f.targets![0].type]} auf ${f.targets![0].square} bedroht hat.`
    case 'saves_piece':
      return defended(f) ? `Gut: Du deckst ${ACC_OWN[f.piece!]} auf ${f.square}.` : `Gut: Du bringst ${ACC_OWN[f.piece!]} aus der Gefahr.`
    case 'passed_pawn':
      return `Du hast jetzt einen Freibauern auf ${f.square} – kein gegnerischer Bauer kann ihn mehr aufhalten.`
  }
}

/** Begründung, warum der beste Zug besser gewesen wäre */
export function describeBestFinding(f: Finding): string | null {
  switch (f.kind) {
    case 'gives_mate':
      return 'damit hättest du sofort mattgesetzt'
    case 'wins_material':
      return `damit hättest du ${ACC_ENEMY[f.piece!]} auf ${f.square} gewonnen – er war nicht ausreichend gedeckt`
    case 'fork':
      return `eine Gabel – ${NOM[f.piece!]} hätte ${targetList(f.targets!, false)} gleichzeitig angegriffen`
    case 'removes_attacker':
      return `damit hättest du ${ACC_ENEMY[f.piece!]} auf ${f.square} geschlagen, der ${ACC_OWN[f.targets![0].type]} auf ${f.targets![0].square} angreift`
    case 'saves_piece':
      return defended(f)
        ? `damit hättest du ${ACC_OWN[f.piece!]} auf ${f.square} gedeckt`
        : `damit hättest du ${ACC_OWN[f.piece!]} auf ${f.square} in Sicherheit gebracht`
    case 'castled':
      return 'damit wäre dein König in Sicherheit gewesen'
    case 'develops':
      return `damit hättest du ${ACC_OWN[f.piece!]} entwickelt`
    case 'center_pawn':
      return 'damit hättest du das Zentrum besetzt'
    default:
      return null
  }
}

/** Was ein (empfohlener) Zug bewirkt – Gegenwart, für Hinweise: "Lb5 entwickelt deinen Läufer." */
export function describePurpose(f: Finding): string | null {
  switch (f.kind) {
    case 'gives_mate':
      return 'setzt matt'
    case 'wins_material':
      return `gewinnt ${ACC_ENEMY[f.piece!]} auf ${f.square} – er ist nicht ausreichend gedeckt`
    case 'fork':
      return `greift ${targetList(f.targets!, false)} gleichzeitig an (Gabel)`
    case 'castled':
      return 'bringt deinen König in Sicherheit'
    case 'develops':
      return `entwickelt ${ACC_OWN[f.piece!]}`
    case 'center_pawn':
      return 'besetzt das Zentrum'
    case 'removes_attacker':
      return `schlägt ${ACC_ENEMY[f.piece!]} auf ${f.square}, der ${ACC_OWN[f.targets![0].type]} bedroht`
    case 'saves_piece':
      return defended(f) ? `deckt ${ACC_OWN[f.piece!]} auf ${f.square}` : `bringt ${ACC_OWN[f.piece!]} in Sicherheit`
    case 'passed_pawn':
      return 'schafft einen Freibauern'
    default:
      return null
  }
}

/** Kurzer Zweck eines Zugs für Plan-Ideen: "Entwicklung", "Rochade" … */
export function shortPurpose(f: Finding): string | null {
  switch (f.kind) {
    case 'gives_mate':
      return 'Matt'
    case 'wins_material':
      return `${NAME[f.piece!]} gewinnen`
    case 'fork':
      return 'Doppelangriff'
    case 'castled':
      return 'König in Sicherheit'
    case 'develops':
      return `${NAME[f.piece!]} entwickeln`
    case 'center_pawn':
      return 'Zentrum besetzen'
    case 'removes_attacker':
      return 'Angreifer schlagen'
    case 'saves_piece':
      return defended(f) ? `${NAME[f.piece!]} decken` : `${NAME[f.piece!]} retten`
    case 'passed_pawn':
      return 'Freibauer schaffen'
    default:
      return null
  }
}

/** Sonderfall aus Erklärungen: König in der Mitte + Gegner greift an (z. B. …Db6 gegen b2 und f2) */
export function kingInCenterWithAttack(attack: Finding, mover: Color): string {
  const opp = sideName(mover === 'w' ? 'b' : 'w')
  return `Mit diesem Zug bleibt dein König in der Mitte, und ${opp} kann mit ${showMove(attack.san!, mover === 'w' ? 'b' : 'w')} ${targetList(attack.targets!, true)} angreifen.`
}

/**
 * Fallback, wenn keine Heuristik den Fehler erklärt. Die Formulierung richtet sich nach
 * der Gewinnchance danach: Wer weiter klar besser steht, "verschenkt Vorteil" – er steht nicht schlechter.
 */
export function genericWorse(mover: Color, lineSan: string[], winAfter: number): string {
  const opp = sideName(mover === 'w' ? 'b' : 'w')
  const moves = lineSan.map((s, i) => showMove(s, i % 2 === 0 ? (mover === 'w' ? 'b' : 'w') : mover))
  const engine = moves.length ? ` – die Engine zeigt ${moves.join(' ')}` : ''
  if (winAfter >= 60) return `Du stehst zwar noch besser, verschenkst aber einen Teil deines Vorteils${engine}.`
  if (winAfter >= 40) return `Damit wird die Stellung ausgeglichen, und dein Vorteil ist weg${engine}.`
  return `Danach steht ${opp} besser${engine}.`
}

export const pieceName = (p: PieceSymbol) => NAME[p]
