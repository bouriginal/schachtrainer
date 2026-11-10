// Ohne Abhängigkeiten, damit auch der Node-Proxy (server/) es direkt laden kann.

/** SAN in deutscher Figurennotation: N→S, B→L, R→T, Q→D (auch bei Umwandlung) */
export function germanSan(san: string): string {
  const map: Record<string, string> = { N: 'S', B: 'L', R: 'T', Q: 'D', K: 'K' }
  return san.replace(/^[NBRQK]/, (m) => map[m]).replace(/=([NBRQ])/, (_, p: string) => `=${map[p]}`)
}
