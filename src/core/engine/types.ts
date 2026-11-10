/** Bewertung aus Sicht von Weiß. `cp` = Centipawns, `mate` = Matt in n Zügen (negativ: Schwarz setzt matt). */
export type Score = { type: 'cp'; value: number } | { type: 'mate'; value: number }

export interface AnalysisLine {
  /** 1-basiert, Rang der Variante bei MultiPV */
  multipv: number
  depth: number
  /** immer aus Sicht von Weiß */
  score: Score
  /** Hauptvariante in UCI-Notation, z. B. ["e2e4", "e7e5"] */
  pv: string[]
}

export interface AnalysisResult {
  fen: string
  bestMove: string | null
  /** sortiert nach multipv (beste zuerst) */
  lines: AnalysisLine[]
}

export interface AnalyzeOptions {
  depth?: number
  movetimeMs?: number
  multiPv?: number
  signal?: AbortSignal
}

/** Abstraktion über die Engine – in Tests durch einen Fake ersetzbar. */
export interface EngineClient {
  analyze(fen: string, options: AnalyzeOptions): Promise<AnalysisResult>
  dispose(): void
}

/** Zeilenbasierter UCI-Kanal (Web Worker im Browser, Fake im Test). */
export interface UciTransport {
  send(command: string): void
  onLine(listener: (line: string) => void): void
  terminate(): void
}

export class AbortedError extends Error {
  constructor() {
    super('Analyse abgebrochen')
    this.name = 'AbortedError'
  }
}
