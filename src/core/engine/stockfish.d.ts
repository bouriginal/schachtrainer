// Minimale Typen für den Node-Einstieg des npm-Pakets "stockfish" (nur im Integrationstest genutzt).
declare module 'stockfish' {
  interface NodeStockfish {
    processCommand(command: string): void
    terminate(): void
  }
  const init: (engine: string, onMessage: (line: string) => void) => NodeStockfish
  export default init
}
