import { buildRepertoire, type Repertoire, type RepertoireData } from '../../core/openings/repertoire'
import caroKann from './caro-kann.json'
import london from './london.json'
import sicilian from './sicilian.json'

export const REPERTOIRE_DATA = [london, caroKann, sicilian] as RepertoireData[]

let cache: Repertoire[] | null = null

/** Alle Repertoires als Stellungsgraph (einmal gebaut, dann gecacht) */
export function getRepertoires(): Repertoire[] {
  cache ??= REPERTOIRE_DATA.map(buildRepertoire)
  return cache
}

export function getRepertoire(id: string): Repertoire | undefined {
  return getRepertoires().find((r) => r.id === id)
}
