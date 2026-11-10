# Schachtrainer – Hinweise für Claude

Interaktiver Schachtrainer als lokale Web-App (React + TypeScript + Vite). UI-Sprache **Deutsch**.
Zielnutzer: ca. 500–600 Elo, will **Verständnis und Pläne** lernen, nicht Varianten pauken.
Gesamtplan und Phasen: siehe [PLAN.md](PLAN.md). Nach jeder Phase: lauffähig, Tests grün,
Zusammenfassung, dann auf Freigabe warten. Diese Datei bei Architekturänderungen aktualisieren.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Dev-Server (kopiert vorher die Engine nach `public/engine/`) |
| `npm test` | alle Unit-Tests (Vitest, schnell, ohne echte Engine) |
| `npm run test:engine` | Integrationstest mit echtem Stockfish (Node-Build) |
| `npm run check` | Typecheck + Lint + Tests – vor Abschluss jeder Aufgabe ausführen |
| `npm run build` | Produktions-Build nach `dist/` |
| `node scripts/build-icons.mjs` | App-Icons (PNG) neu erzeugen – nur nötig, wenn sich das Icon ändert (macOS `sips`) |
| `npm run puzzles` | Lichess-Puzzle-Auszug neu bauen (lädt ~300 MB als Stream, nur nach Rückfrage beim Nutzer) |

Optional: `.env.example` → `.env` kopieren und `ANTHROPIC_API_KEY` setzen, um „Genauer erklären“ zu aktivieren.

## Architektur

```
src/
  core/            reines TypeScript, KEIN React/DOM-Import – hier liegt die Fachlogik
    chess/game.ts  Wrapper um chess.js: applyMove/applyUci (werfen nie, null bei illegal),
                   getStatus (Matt/Patt/Remisgründe auf Deutsch), toPgn, Hilfsfunktionen
    engine/        types.ts (EngineClient, Score immer aus Sicht von WEISS), uci.ts (Parser),
                   score.ts (winPercent, Formatierung), strength.ts (Stufen 1–10 + pickMove),
                   StockfishEngine.ts (UCI-Client mit Warteschlange + AbortSignal)
    chess/board.ts Brett-Hilfen: Figurenwerte, exposure (hängt eine Figur?), Angriffe,
                   Linienstatus, Nullzug (withTurn), uciLineToSan; notation.ts: germanSan
    coach/         ★ Erklärschicht – komplett ohne React/Engine-Aufrufe, rein und testbar
      classify.ts  Verlust an Gewinnchance → best/good/inaccuracy/mistake/blunder (5/10/15 %)
      context.ts   MoveContext (Stellung vor/nach, Zug, Ziehender) – Eingabe aller Heuristiken
      findings.ts  Finding = strukturierter Befund (kind, subject move|best, polarity, weight, Daten)
      heuristics/  tactics (hängend, Gabel, Material, Verteidigung, Gegner-Doppelangriff),
                   kingSafety, development, center, pawnStructure
      explain.ts   reviewMove(): Engine-Analysen vor/nach dem Zug + Heuristiken → MoveReview
                   (Klassifikation, Sätze, Pfeile, Markierungen); composeText wählt aus
      text/de.ts   ALLE deutschen Formulierungen (Logik nie hier, Texte nie in Heuristiken)
      plans.ts     suggestPlans(fen, color, max, analysis?): bis zu 3 Ideen – Gefahr (Matt-
                   drohung, hängende Figur), "Konkrete Idee" aus der Engine-PV mit Zweck je Zug,
                   Entwicklung, Rochade, Vorposten, Königsangriff, Figur mit Zielfeld verbessern
      hints.ts     buildHints(): 3 Stufen – Richtung, Figur (Feld), Zug mit Begründung
      threats.ts   threatsAgainst(): Nullzug – Mattdrohung und hängende eigene Figuren
      llm/prompt.ts Prompt + Validierung für "Genauer erklären" (auch vom Node-Proxy geladen)
    openings/      Eröffnungstrainer-Logik (rein)
      repertoire.ts buildRepertoire(): Linien (JSON) → Stellungsgraph; Schlüssel = FEN ohne
                   Zugzähler (Zugumstellungen laufen zusammen); validiert Legalität, Erklärungen,
                   genau EIN eigener Zug pro Stellung
      trainer.ts   Session-Ablauf (learn/review), Gegnerwahl gewichtet nach fälligen Karten
      srs.ts       FSRS via ts-fsrs: Karte = eigene Stellung; richtig→Good, Hinweis→Hard, falsch→Again
    tactics/       puzzle.ts (Ablauf: 1. Zug = Gegner, jedes Matt im letzten Zug zählt; Elo-artige
                   Wertung; pickPuzzle nach Motiv/Stufe, Ungesehenes zuerst), themes.ts (16 Motive DE)
    endgames/      endgame.ts: judgeEndgame() – Ziele mate | promote | draw (Züge überstehen)
    chess/pgn.ts   parsePgn (mehrere Partien, Kommentare/Varianten werden ignoriert), gameTitle
    analysis/      gameAnalysis.ts: analyzeGame() – jede Stellung einmal analysiert, jeder Zug
                   durch reviewMove (gleicher Coach wie im Spiel); Genauigkeit (Lichess-Formel),
                   keyMoments, winCurve. Ergebnis wird als StoredGame.analysis gespeichert
    progress/      progress.ts: gameStats, tacticsStats (Wertungsverlauf rekonstruiert),
                   openingStats (Schwachstellen), recurringMistakes (Finding-Kinds → 6 Muster,
                   ab 2× in 2 Partien), buildSuggestions (Top 5 aus allen Bereichen)
    chess/moveEvent.ts  detectMoveEvent(): welches Geräusch (Zug/Schlagen/Schach/Rochade/Matt)
    storage/backup.ts   Export/Import aller Tabellen als JSON (Datumswerte markiert), ersetzt beim Import
    storage/db.ts  Dexie: v1 games; v2 cards + openingLog; v3 puzzleAttempts, endgameResults, meta.
                   Repositories mit Memory-Varianten
  features/        eine Mappe pro Modul (play, später coach, openings, tactics, …)
    play/playStore.ts   zustand-Store (vanilla), Abhängigkeiten werden injiziert; Coach-Ablauf:
                        Zug → Analyse vor (MultiPV 3, gecacht) + nach → reviewMove → bei
                        Fehler/Patzer Pause (Engine wartet), sonst Engine-Antwort
    openings/           Übersicht, Repertoire-Seite, TrainerPage + trainerStore (falscher Zug
                        → nicht ausgeführt, Engine-Coach erklärt im Hintergrund)
    tactics/            TacticsPage + tacticsStore (Puzzles per dynamic import → eigenes Bundle)
    endgames/           EndgamesPage, EndgameTrainerPage + endgameStore (Engine volle Stärke,
                        Warnung bei Gewinnverlust, Zurücknehmen)
    analysis/           Partieliste + PGN-Import, Analyse-Seite (Brett, EvalGraph, Wendepunkte,
                        ?zug=N springt zu Zug N)
    progress/           Fortschritts-Seite (Vorschläge, Muster, Statistik)
    coach/              CoachPanel (Bewertung, Pause-Buttons, Plan-Karte), Einstellungen
                        (localStorage), useClaudeExplain
  App.tsx          App-Rahmen: Kopfzeile (Desktop: alle Bereiche), Tab-Leiste unten (Handy < 768 px:
                   Start, Spielen, Eröffnungen, Taktik, Mehr), Seiten per React.lazy
  ui/              wiederverwendbare Komponenten; feedback.ts (Zuggeräusche per Web Audio,
                   Vibration), appSettings.ts (Töne/Vibration), install.ts (PWA-Installation),
                   Icon.tsx; (charts.tsx: EvalGraph, Sparkline, RateBar); Board.tsx ist der EINZIGE Ort, der
                   react-chessboard importiert (Adapter, austauschbar)
  data/openings/   Repertoires als JSON (london, caro-kann, sicilian) + index.ts
  data/puzzles/    puzzles.json – generiert von scripts/build-puzzles.mjs (Lichess, CC0), nicht von Hand ändern
  data/endgames.json  kuratierte Endspiele; Ergebnis jeder Stellung prüft `npm run test:engine`
  services.ts      einzige Stelle, die Worker/IndexedDB erzeugt (Singletons)
  test/            FakeEngine, Test-Setup
scripts/copy-engine.mjs   kopiert stockfish-19-lite-single.{js,wasm} nach public/engine/
server/claudeProxy.ts     Vite-Middleware /api/coach/{status,explain}; Key aus .env
                          (ANTHROPIC_API_KEY, ohne VITE_-Präfix) bleibt im Node-Prozess
```

### Wichtige Entscheidungen
- **Engine:** `stockfish@19` in der Variante *lite-single* (≈1,8 MB, kein SharedArrayBuffer,
  keine COOP/COEP-Header nötig, läuft auf iOS). Läuft als Web Worker. Bewertungen werden
  im Client sofort in die Sicht von Weiß umgerechnet – überall im Code gilt: positiv = Weiß besser.
- **Schwache Stufen:** Stockfish lässt sich nicht unter ~1300 Elo drosseln. Darum MultiPV mit
  geringer Tiefe und `pickMove` wählt mit `mistakeChance` einen schlechteren Zug innerhalb
  `maxLossCp`. Elo-Angaben sind Schätzungen.
- **Abbrechen:** Jede Stellungsänderung von außen (Zurücknehmen, neue Partie) bricht über
  `AbortController` alle laufenden Engine-Aufträge ab; Ergebnisse werden zusätzlich gegen die
  aktuelle FEN geprüft, bevor sie angewendet werden.
- **Persistenz:** Jede Änderung speichert die Partie (`StoredGame`) in IndexedDB; beim Öffnen
  von /spielen wird die letzte unbeendete Partie fortgesetzt. Schema-Änderungen nur über neue
  `db.version(n)`, nie bestehende Versionen ändern.
- **Coach-Prinzip:** Heuristiken liefern Befunde, die Engine bestätigt sie (z. B. "hängt" nur,
  wenn die beste Gegnerantwort die Figur schlägt). Erklärt wird der Unterschied zwischen
  gespieltem und bestem Zug. Neue Motive: Heuristik + Finding-Kind + Satz in de.ts + FEN-Test.
- **Bewertungsskala:** Stockfish 19 skaliert anders als alte Versionen (Leichtfigur ≈ +6–7).
  Deshalb wird nie mit rohen Centipawns klassifiziert, sondern immer über `winPercent`.
- **Claude:** Modell `claude-opus-5-5`, effort `medium`, serverseitiger Refusal-Fallback
  (`fallbacks: 'default'`, Beta `server-side-fallback-2026-07-01`). Nur hinter Einstellung.
- **Repertoire-Daten:** Züge in englischer SAN (wie chess.js), Erklärungen deutsch, max. ~260
  Zeichen. `why` nur beim ersten Auftreten eines Zugs nötig. Neue Linie = JSON ergänzen, der
  Test `src/data/openings/openings.test.ts` prüft alles automatisch.
- **Handy/PWA:** Installierbar (vite-plugin-pwa, Manifest, Icons in public/icons). Der Service
  Worker hält ALLES vor, auch Engine-WASM und Puzzles → komplett offline nutzbar. Im
  eingebetteten Vorschau-Browser blockiert die Umgebung Service Worker – zum Testen echtes
  Chrome nehmen. Daten liegen pro Gerät; Abgleich über Backup (Einstellungen).
- **Texte:** describeMoveFinding (Vergangenheit, eigener Zug), describeBestFinding ("damit hättest
  du …"), describePurpose (Gegenwart, Hinweise), shortPurpose (Stichwort, Plan-Ideen). saves_piece
  unterscheidet "decken" (Figur blieb stehen) und "in Sicherheit bringen" (weggezogen).
- **Design:** Grundwerte als CSS-Variablen ganz am Ende von index.css ("Modernes Design v2"),
  Hell/Dunkel per prefers-color-scheme. Karten: .status/.review/.plan-card/.card … mit --shadow-sm.
- **Handy-Layout (v3):** Die SEITE scrollt (nicht das Panel) – nur so blendet Safari seine Leisten
  aus. Brett immer voll breit. Tab-Leiste versteckt sich beim Runterscrollen (`html.tabbar-hidden`,
  useAutoHideTabBar in App.tsx); `.action-bar` ist sticky und rutscht mit. Kinder von `.side-panel`
  haben flex-shrink: 0. Auf dem Brett gilt touch-action: none (Ziehen ≠ Scrollen).
- **Ziehen:** Board.tsx – Zielfelder auch beim Ziehen, Figur schwebt am Touchscreen über dem Finger,
  Schatten am Startfeld, Drop-Feld markiert; Ablegen auf dem Startfeld = Antippen.
- **Taktik, falscher Zug:** wird ausgeführt, Coach erklärt (ohne „Besser war …“, sonst wäre die
  Lösung verraten), Engine spielt die Widerlegung; `retry()` stellt die Aufgabe wieder her.
- **Handy-Layout (Grundlage):** Brettseiten nutzen `.play-layout` und eine `.action-bar` als LETZTES
  Kind des Panels (sticky unten).
- **Lizenz:** Projekt steht unter GPL-3.0-or-later (wegen Stockfish).
- **Deployment:** GitHub `bouriginal/schachtrainer` (main) → Vercel-Projekt `schachtrainer`, jeder
  Push auf main geht automatisch live unter https://schachtrainer-mu.vercel.app. Commits mit der
  GitHub-noreply-Adresse, nie mit privater E-Mail.

## Konventionen
- UI-Texte, Kommentare und Testnamen auf Deutsch; Bezeichner (Code) auf Englisch.
- Fachlogik nach `core/`, testbar ohne Browser. Komponenten bleiben dünn.
- Abhängigkeiten (Engine, Repository, Zufall, Zeit) werden injiziert → deterministische Tests
  mit `FakeEngine` und `memoryGameRepository`.
- Tests liegen neben dem Code (`*.test.ts`). UI-Tests mit `// @vitest-environment jsdom`.
  Integrationstests heißen `*.integration.test.ts` und laufen nur über `npm run test:engine`.
- TypeScript strikt mit `erasableSyntaxOnly`: keine `enum`s, keine Parameter-Properties im Konstruktor.
- Mobil zuerst: Touch-Ziele ≥ 44 px, Tippen–Tippen-Züge, Brett passt in die Viewport-Höhe.
- Imports in Dateien, die auch der Node-Proxy lädt (`server/`, `core/coach/llm/`,
  `core/chess/notation.ts`), mit `.ts`-Endung schreiben – Vite 8 lädt die Config nativ.
- Hot-Reload ersetzt keine laufende Store-Instanz: nach Änderungen in `core/` die Seite neu laden.
- Fallstrick Node-Stockfish: `processCommand` nie synchron aus dem Ausgabe-Callback aufrufen
  (Ausgabe verklebt); Zeilen asynchron weiterreichen wie ein Worker.
