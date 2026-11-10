// Ohne Abhängigkeiten, damit auch der Node-Proxy (server/) es direkt laden kann.

/** SAN in deutscher Notation: N→S, B→L, R→T, Q→D (auch bei Umwandlung), Rochade 0-0 / 0-0-0 */
export function germanSan(san: string): string {
  const map: Record<string, string> = { N: 'S', B: 'L', R: 'T', Q: 'D', K: 'K' }
  if (san.startsWith('O-O')) return san.replace(/O/g, '0')
  return san.replace(/^[NBRQK]/, (m) => map[m]).replace(/=([NBRQ])/, (_, p: string) => `=${map[p]}`)
}
