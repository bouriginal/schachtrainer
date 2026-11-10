# ♞ Schachtrainer

Interaktiver Schachtrainer als Web-App (PWA) – **Schach verstehen statt Züge auswendig lernen**.
Läuft komplett im Browser, auch offline, und lässt sich auf Handy und Laptop als App installieren.

- **Spielen mit Coach** – Stockfish 19 (WASM) in 10 Stärkestufen; der Coach erklärt jeden Zug
  in Klartext (hängende Figuren, Gabeln, Königssicherheit, Entwicklung …) und schlägt Pläne vor.
- **Eröffnungen** – Londoner System, Caro-Kann und Sizilianisch mit Erklärung jedes Zugs,
  Wiederholung per Spaced Repetition (FSRS).
- **Taktik** – 2.160 Aufgaben aus der Lichess-Puzzle-Datenbank, nach Motiv und Schwierigkeit.
- **Endspiele** – Standardstellungen mit Lernziel gegen die Engine.
- **Analyse & Fortschritt** – PGN-Import, Partieanalyse, wiederkehrende Fehler, Übungsvorschläge.

Alle Lerndaten bleiben lokal auf dem Gerät (IndexedDB). Abgleich zwischen Geräten über
Backup-Export/-Import in den Einstellungen.

## Entwicklung

```bash
npm install
npm run dev      # Entwicklungsserver
npm run check    # Typecheck, Lint, Tests
npm run build    # Produktions-Build nach dist/
```

Details zu Architektur und Konventionen: [CLAUDE.md](CLAUDE.md).

## Lizenz

GPL-3.0-or-later – siehe [LICENSE](LICENSE).

- Stockfish (stockfish.js) – GPL-3.0
- Aufgaben aus der [Lichess-Puzzle-Datenbank](https://database.lichess.org/#puzzles) – CC0
- Weitere Bibliotheken (chess.js, React, react-chessboard, Dexie, ts-fsrs …) unter MIT/BSD/Apache-2.0
