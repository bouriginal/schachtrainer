import { AbortedError, type AnalysisLine, type AnalysisResult, type AnalyzeOptions, type EngineClient, type UciTransport } from './types'
import { parseBestMove, parseInfo, rawToLine, sideToMoveFromFen } from './uci'

interface Job {
  fen: string
  options: AnalyzeOptions
  resolve: (r: AnalysisResult) => void
  reject: (e: unknown) => void
}

/**
 * UCI-Client für Stockfish. Aufträge laufen strikt nacheinander (die Engine kann nur
 * eine Suche gleichzeitig). Abgebrochene Aufträge werden übersprungen bzw. per `stop`
 * beendet und mit `AbortedError` abgelehnt.
 */
export class StockfishEngine implements EngineClient {
  private queue: Job[] = []
  private current: Job | null = null
  private infos = new Map<number, AnalysisLine>()
  private ready: Promise<void>
  private disposed = false
  private readyResolve!: () => void
  private stage: 'uci' | 'ready' | 'idle' = 'uci'
  private transport: UciTransport

  constructor(transport: UciTransport) {
    this.transport = transport
    this.ready = new Promise((r) => (this.readyResolve = r))
    transport.onLine((line) => this.handleLine(line))
    transport.send('uci')
  }

  analyze(fen: string, options: AnalyzeOptions): Promise<AnalysisResult> {
    if (this.disposed) return Promise.reject(new Error('Engine wurde beendet'))
    if (options.signal?.aborted) return Promise.reject(new AbortedError())
    return new Promise((resolve, reject) => {
      const job: Job = { fen, options, resolve, reject }
      options.signal?.addEventListener('abort', () => this.abort(job), { once: true })
      this.queue.push(job)
      void this.ready.then(() => this.next())
    })
  }

  dispose(): void {
    this.disposed = true
    for (const job of this.queue) job.reject(new AbortedError())
    this.queue = []
    this.current?.reject(new AbortedError())
    this.current = null
    this.transport.terminate()
  }

  private abort(job: Job) {
    if (this.current === job) {
      this.transport.send('stop') // bestmove kommt gleich, wird dann verworfen
    } else {
      const i = this.queue.indexOf(job)
      if (i >= 0) {
        this.queue.splice(i, 1)
        job.reject(new AbortedError())
      }
    }
  }

  private next() {
    if (this.current || this.disposed) return
    const job = this.queue.shift()
    if (!job) return
    this.current = job
    this.infos.clear()
    const { depth, movetimeMs, multiPv = 1 } = job.options
    this.transport.send(`setoption name MultiPV value ${multiPv}`)
    this.transport.send(`position fen ${job.fen}`)
    if (movetimeMs) this.transport.send(`go movetime ${movetimeMs}`)
    else this.transport.send(`go depth ${depth ?? 12}`)
  }

  private handleLine(line: string) {
    if (this.stage === 'uci') {
      if (line === 'uciok') {
        this.stage = 'ready'
        this.transport.send('setoption name Hash value 32')
        this.transport.send('isready')
      }
      return
    }
    if (this.stage === 'ready') {
      if (line === 'readyok') {
        this.stage = 'idle'
        this.readyResolve()
      }
      return
    }

    const job = this.current
    if (!job) return

    const raw = parseInfo(line)
    if (raw) {
      this.infos.set(raw.multipv, rawToLine(raw, sideToMoveFromFen(job.fen)))
      return
    }

    const best = parseBestMove(line)
    if (best === undefined) return
    this.current = null
    if (job.options.signal?.aborted) {
      job.reject(new AbortedError())
    } else {
      const lines = [...this.infos.values()].sort((a, b) => a.multipv - b.multipv)
      job.resolve({ fen: job.fen, bestMove: best, lines })
    }
    this.next()
  }
}

/** Transport über einen Web Worker, der die Stockfish-WASM-Datei lädt. */
export function createWorkerTransport(url = '/engine/stockfish-19-lite-single.js'): UciTransport {
  const worker = new Worker(url)
  return {
    send: (cmd) => worker.postMessage(cmd),
    onLine: (listener) => {
      worker.addEventListener('message', (e: MessageEvent) => {
        const data = typeof e.data === 'string' ? e.data : String(e.data)
        for (const l of data.split('\n')) if (l.trim()) listener(l.trim())
      })
    },
    terminate: () => worker.terminate(),
  }
}
