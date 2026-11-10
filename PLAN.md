# Schachtrainer – Architektur- und Phasenplan

Stand: 10.11.2026 · Status: **Phasen 1–5 fertig · Phase 6 (Handy-App/PWA) umgesetzt, Deployment offen**

## 0. Entscheidungen nach Rückfragen
- **Brett:** react-chessboard (MIT).
- **Zielgruppe:** ca. 500–600 Elo. Das Hauptproblem ist planloses Spiel, nicht fehlende Varianten. Daraus folgt:
  - Der Coach spricht einfach und konkret, zuerst über Grundlagen (hängende Figuren, Drohungen, Entwicklung,
    König), und erst dann über Feinheiten.
  - Neu: **Plan-Modul** (Phase 2). Es benennt pro Stellung 1–2 konkrete Pläne aus Bauernstruktur und
    Figurenstellung („Bring deinen Springer nach e5“, „Rochiere, dann Türme auf die offene Linie“).
    Auf Wunsch fragt es vor dem Zug: „Was ist dein Plan?“
  - Eröffnungen: wenige Hauptlinien, viel Gewicht auf **Ideen und typischen Plänen** statt Variantentiefe.
  - Engine-Voreinstellung: schwach (Stufe 1–3). Puzzles: Rating ca. 600–1200.
- **Repertoire:** Weiß: Londoner System. Schwarz gegen 1.e4: Caro-Kann (Hauptrepertoire, solide und
  planbar) und Sizilianisch (Hauptideen der offenen Varianten plus Anti-Sizilianer Alapin und Grand Prix).
- **Git:** vorerst nicht, nur lokal.

## 1. Pakete (Versionen und Lizenzen geprüft am 10.11.2026)

| Zweck | Paket | Version | Lizenz | Bemerkung |
|---|---|---|---|---|
| UI | react, react-dom | 19.3.1 | MIT | |
| Build | vite + @vitejs/plugin-react | 8.3.7 / 6.3.0 | MIT | |
| Sprache | typescript | 7.0.2 | Apache-2.0 | Neuer nativer Compiler. Falls Tooling hakt: Fallback auf 5.9 |
| Regeln | chess.js | 1.4.0 | BSD-2 | Zuggenerierung, FEN/PGN, Matt/Patt |
| Engine | stockfish | 19.0.1 | **GPL-3.0** | Variante `stockfish-19-lite-single` (1,8 MB WASM, kein SharedArrayBuffer nötig, läuft auch auf iPhone-Safari). Die volle Version hat 99 MB, zu groß. |
| Brett | react-chessboard | 5.12.1 | MIT | Pfeile, Feldmarkierungen, Tippen und Ziehen. Alternative: @lichess-org/chessground 10.5.0 (GPL-3.0), siehe Rückfrage 1 |
| Speicher | dexie | 4.4.7 | Apache-2.0 | IndexedDB mit Schema-Versionen |
| Zustand | zustand | 5.1.0 | MIT | |
| Routing | react-router | 7.18.5 | MIT | |
| Spaced Repetition | ts-fsrs | 6.0.0 | MIT | FSRS-Algorithmus (moderner als SM-2) |
| Tests | vitest + @testing-library/react | 5.1.0 | MIT | |
| Claude (optional) | @anthropic-ai/sdk | 1.7.0 | Apache-2.0 | nur serverseitig im Vite-Proxy |
| Puzzle-Daten | Lichess-Puzzle-Datenbank | – | **CC0** | einmalig per Skript gefiltert |

**Lizenzfolge:** Stockfish ist GPL-3.0. Für eine lokale, private App ist das kein Problem. Sollte die App
je veröffentlicht werden, muss sie insgesamt unter GPL-3.0 stehen. Damit wäre auch chessground lizenzrechtlich unbedenklich.

## 2. Architektur

Grundregel: **Fachlogik ist reines TypeScript ohne React** und lässt sich deshalb ohne Browser testen.
React ist nur die Oberfläche.

```
src/
  core/                    # rein, ohne React und DOM
    chess/                 # Wrapper um chess.js: Position, Zugliste, SAN/UCI, PGN-Import
    engine/                # Stockfish-Client: Worker, UCI-Protokoll, Warteschlange, MultiPV, Abbruch
      EngineClient.ts      # Interface (im Test durch Fake ersetzbar)
      StockfishWorker.ts
      strength.ts          # Stärke 1–20 → Skill Level / UCI_Elo / Bedenkzeit
    coach/                 # ★ Erklärschicht, komplett getrennt
      classify.ts          # Bewertungsdifferenz → gut/ungenau/Fehler/Patzer
      heuristics/          # jede Heuristik: (Position vorher, Zug, Position nachher) → Fakten
        center.ts          # Zentrumskontrolle (d4/e4/d5/e5 + erweitertes Zentrum)
        development.ts     # entwickelte Leichtfiguren, Dame zu früh, Figur doppelt gezogen
        kingSafety.ts      # Rochade(recht), Bauernschild, offene Linien zum König
        hanging.ts         # ungedeckte und angegriffene Figuren (Abtauschbilanz/SEE)
        pawnStructure.ts   # Doppel-, isolierte, rückständige, Freibauern
        threats.ts         # neue Drohungen des Gegners (Nullzug-Analyse + Engine-Linie)
        missedTactics.ts   # Gabel, Fesselung, Spieß, Abzug, Grundreihe, im Vergleich zum besten Zug
      findings.ts          # Typen: Finding { kind, severity, squares, arrows, data }
      explain.ts           # Findings + Engine-Daten → priorisierte Erklärung
      text/de.ts           # Satzvorlagen auf Deutsch (Texte getrennt von der Logik)
      llm/                 # optional: Prompt-Aufbau für „Genauer erklären“
    srs/                   # FSRS-Planung für Eröffnungszüge
    storage/               # Dexie-Schema, Repositories (Partien, Statistik, SRS-Karten)
  features/
    play/                  # freies Spiel
    coach/                 # Coach-Panel, Pfeile, Rücknahme
    openings/              # Eröffnungstrainer
    tactics/               # Taktikaufgaben
    endgames/              # Endspiele
    progress/              # Statistik, Fehlermuster, Übungsvorschläge
    analysis/              # Partieanalyse, PGN-Import
  ui/                      # Brett-Adapter, Bewertungsbalken, Zugliste, Layout, Bottom-Sheet
  data/
    openings/london.json, sicilian.json
    puzzles/*.json         # gefilterter Lichess-Auszug
    endgames.json
scripts/
  build-puzzles.ts         # lädt die Lichess-CSV, filtert nach Motiv/Rating → JSON
server/
  claudeProxy.ts           # Vite-Middleware: API-Key bleibt in .env, gelangt nie ins Bundle
```

### Coach-Ablauf pro Zug
1. **Vorher:** Die Engine analysiert die Stellung vor meinem Zug (MultiPV 3). Das ist meist schon im Cache, weil die Analyse anläuft, während ich nachdenke.
2. **Nachher:** Die Engine analysiert die Stellung nach meinem Zug.
3. **Klassifikation** über Gewinnwahrscheinlichkeit statt über rohe Centipawns, damit +8 → +6 nicht als Patzer zählt.
   Schwellen (umgesetzt, wie Lichess): Verlust ≥ 5 % → ungenau, ≥ 10 % → Fehler, ≥ 15 % → Patzer.
   Zusätzlich: bester Zug, eine „gute“ Kategorie, erzwungene Züge.
4. **Heuristiken** laufen auf drei Stellungen: vor dem Zug, nach meinem Zug und nach dem besten Zug.
   Den Unterschied zwischen „mein Zug“ und „bester Zug“ zu erklären, ist der Kern des Coaches.
5. **explain.ts** wählt die 1–3 wichtigsten Findings aus und baut daraus Text, Pfeile und Markierungen.
   Beispiel: kingSafety (König in der Mitte) + threats (…Db6 greift b2 und f2 an)
   → „Mit diesem Zug bleibt dein König in der Mitte, und Schwarz kann mit …Db6 b2 und f2 angreifen.“
6. **Optional „Genauer erklären“:** Die App schickt FEN, Zug, Engine-Linie und Findings (als JSON) über den lokalen Proxy an Claude.

**Tests der Erklärschicht:** Fixture-Dateien mit FEN, Zug, (gefakter) Engine-Ausgabe und erwarteten Findings
bzw. Textbausteinen. Die Heuristiken werden ohne Engine getestet, explain.ts mit Fake-Engine-Daten. Dadurch laufen
die Tests schnell und deterministisch.

### Mobil
Das Brett nimmt die volle Breite ein. Züge gehen per Tippen–Tippen und per Ziehen. Coach und Zugliste stehen auf dem
Handy in einem Bottom-Sheet, auf dem Desktop in einer Seitenleiste. Die Engine läuft im Web Worker, damit die
Oberfläche nicht ruckelt.

## 3. Phasen

Jede Phase endet mit: lauffähigem Stand, grünen Tests (`npm test`), aktueller CLAUDE.md, kurzer Zusammenfassung. Danach warte ich auf dein OK.

**Phase 1 – Fundament und freies Spiel**
Vite-Projekt, CLAUDE.md, Lint/Format, Vitest. Brett mit Regeln (Promotion-Dialog, Matt/Patt/Remis), Stockfish-Worker
mit UCI-Client, Spiel gegen Stockfish mit Stärke 1–20 und Farbwahl, Bewertungsbalken, Zugliste, Zug zurücknehmen,
Partie in IndexedDB speichern, responsives Layout.
*Tests:* UCI-Parser, Stärke-Mapping, Spielablauf (mit Fake-Engine).

**Phase 2 – Coach**
Klassifikation, alle Heuristik-Module, explain + deutsche Texte, Pfeile und Markierungen, „Zurücknehmen und neu
versuchen“, Coach-Panel. Einstellung für den Claude-Button, dazu der Vite-Proxy.
*Tests:* je Heuristik mehrere FEN-Fixtures, dazu End-to-End-Fixtures für explain (u. a. dein Db6-Beispiel).

**Phase 3 – Eröffnungstrainer**
Datenformat für Repertoire-Bäume (JSON mit Erklärung je Zug und erlaubten Nebenvarianten). Londoner System als Weiß
und Sizilianisch als Schwarz. Modi „Lernen“ (Linie wird gezeigt und erklärt) und „Abfragen“. Abweichungen werden
korrigiert und begründet. Der Coach erklärt dabei, warum der eigene Zug schlechter ist. FSRS-Wiederholung je Zug bzw. Position.
*Tests:* Datenvalidierung aller Linien (jeder Zug legal), SRS-Planung, Abweichungslogik.

**Phase 4 – Taktik und Endspiel**
Skript für den Lichess-Auszug (z. B. 15–20 Motive à 100–200 Aufgaben, Rating-Bänder). Puzzle-Modus mit Motivfilter
und Schwierigkeit. Kuratierte Endspiele (z. B. Grundmatts, Quadratregel, Opposition, Lucena, Philidor, T+B vs. T),
jeweils mit Lernziel, gegen die Engine auszuspielen und mit Erfolgskriterium.
*Tests:* Puzzle-Validierung, Lösungsprüfung, Erfolgskriterien der Endspiele.

**Phase 5 – Fortschritt und Analyse**
Statistik pro Eröffnung und Motiv, Fehlermuster (Findings-Typen über viele Partien zählen, z. B. „lässt oft Figuren
ungedeckt“), daraus Übungsvorschläge. Partieanalyse im Hintergrund mit Fehlergrafik und Sprung zu Schlüsselmomenten,
PGN-Import (eigene Lichess- oder Chess.com-Partien).
*Tests:* Aggregation, Mustererkennung, PGN-Import.

## 4. Offene Punkte / Risiken
- Wie gut der Coach erklärt, hängt an den Heuristiken. Ich starte mit einem soliden Kern und erweitere ihn anhand echter Partien.
- Die Lite-Engine ist schwächer als volles Stockfish 19, für Training aber weit mehr als genug (> 3000 Elo).
- Die Lichess-Puzzle-CSV ist groß (komprimiert mehrere hundert MB). Sie wird nur einmal lokal verarbeitet. Ins Repo kommt nur der kleine JSON-Auszug.
