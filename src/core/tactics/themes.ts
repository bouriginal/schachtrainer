/** Lichess-Motive mit deutschem Namen und einer kurzen Erklärung, worauf man achten muss. */
export interface ThemeInfo {
  id: string
  name: string
  /** Was ist das Motiv? */
  idea: string
  /** Woran erkennt man die Chance? */
  lookFor: string
}

export const THEMES: ThemeInfo[] = [
  { id: 'mateIn1', name: 'Matt in 1', idea: 'Ein einziger Zug setzt matt.', lookFor: 'Prüfe zuerst alle Schachgebote – besonders die, nach denen der König kein Fluchtfeld hat.' },
  { id: 'hangingPiece', name: 'Hängende Figur', idea: 'Eine gegnerische Figur ist ungedeckt oder zu schwach gedeckt und kann einfach geschlagen werden.', lookFor: 'Frag dich bei jedem Zug: Welche Figur des Gegners ist nicht gedeckt?' },
  { id: 'fork', name: 'Gabel', idea: 'Eine Figur greift zwei Ziele gleichzeitig an – der Gegner kann nur eines retten.', lookFor: 'Suche Felder, von denen aus eine Figur (oft ein Springer) König, Dame oder Turm zugleich angreift.' },
  { id: 'pin', name: 'Fesselung', idea: 'Eine Figur darf nicht ziehen, weil dahinter eine wertvollere steht (oft der König).', lookFor: 'Stehen König oder Dame auf einer Linie mit einer anderen Figur? Dann kann ein Läufer, Turm oder eine Dame fesseln.' },
  { id: 'skewer', name: 'Spieß', idea: 'Wie eine Fesselung, nur umgekehrt: Die wertvolle Figur steht vorne, muss weichen, und die dahinter geht verloren.', lookFor: 'Greif den König oder die Dame entlang einer Linie an, hinter der noch eine Figur steht.' },
  { id: 'mateIn2', name: 'Matt in 2', idea: 'Nach zwei eigenen Zügen ist der Gegner matt – oft mit einem Opfer oder einem stillen Zug.', lookFor: 'Schachs, Schlagzüge, Drohungen – in dieser Reihenfolge prüfen. Wo hat der König wenig Luft?' },
  { id: 'backRankMate', name: 'Grundreihenmatt', idea: 'Der König steht hinter seinen eigenen Bauern eingesperrt; ein Turm oder die Dame auf der Grundreihe setzt matt.', lookFor: 'Hat der gegnerische König kein Luftloch (z. B. h6/h3)? Ist die Grundreihe nur schwach gedeckt?' },
  { id: 'discoveredAttack', name: 'Abzugsangriff', idea: 'Eine Figur zieht weg und gibt dabei die Linie einer anderen frei – plötzlich gibt es zwei Angriffe.', lookFor: 'Steht eine eigene Figur zwischen deinem Turm/Läufer/Dame und einem Ziel? Ziehe sie mit Tempo weg.' },
  { id: 'trappedPiece', name: 'Gefangene Figur', idea: 'Eine gegnerische Figur hat keine sicheren Felder mehr und kann erobert werden.', lookFor: 'Figuren am Rand oder tief im eigenen Lager haben oft wenig Felder – nimm ihnen das letzte.' },
  { id: 'doubleCheck', name: 'Doppelschach', idea: 'Zwei Figuren geben gleichzeitig Schach – der König MUSS ziehen.', lookFor: 'Ein Abzugsschach, bei dem die ziehende Figur ebenfalls Schach gibt.' },
  { id: 'deflection', name: 'Ablenkung', idea: 'Ein Verteidiger wird von seiner Aufgabe weggelockt.', lookFor: 'Welche gegnerische Figur deckt gerade alles? Zwing sie mit einem Opfer oder Schach weg.' },
  { id: 'attraction', name: 'Hinlenkung', idea: 'Eine gegnerische Figur (oft der König) wird auf ein schlechtes Feld gezwungen.', lookFor: 'Ein Opfer, das den König auf ein Feld lockt, auf dem dann Gabel oder Matt folgt.' },
  { id: 'capturingDefender', name: 'Verteidiger schlagen', idea: 'Du schlägst die Figur, die eine andere deckt – danach ist die zweite ungeschützt.', lookFor: 'Wer deckt die Figur, die du gern hättest? Kannst du den Verteidiger schlagen?' },
  { id: 'promotion', name: 'Umwandlung', idea: 'Ein Bauer erreicht die letzte Reihe und wird zur Dame (oder einer anderen Figur).', lookFor: 'Kann ein Bauer mit Hilfe eines Opfers oder einer Ablenkung durchlaufen?' },
  { id: 'smotheredMate', name: 'Ersticktes Matt', idea: 'Ein Springer setzt einen König matt, der von seinen eigenen Figuren eingeklemmt ist.', lookFor: 'König in der Ecke, umgeben von eigenen Figuren – der Springer findet das Feld.' },
  { id: 'xRayAttack', name: 'Röntgenangriff', idea: 'Eine Figur wirkt durch eine andere hindurch auf ein Feld dahinter.', lookFor: 'Nach einem Abtausch auf einer Linie wirkt deine Figur plötzlich weiter, als es aussieht.' },
]

export const THEME_BY_ID = new Map(THEMES.map((t) => [t.id, t]))
export const themeName = (id: string) => THEME_BY_ID.get(id)?.name ?? id
