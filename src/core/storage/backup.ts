import type { TrainerDB } from './db'

/**
 * Backup aller Lerndaten als JSON-Datei – damit lassen sich Handy und Laptop abgleichen
 * (Export auf dem einen, Import auf dem anderen Gerät) oder Daten sichern.
 */
export const BACKUP_APP = 'schachtrainer'
export const BACKUP_VERSION = 1

const TABLES = ['games', 'cards', 'openingLog', 'puzzleAttempts', 'endgameResults', 'meta'] as const
type TableName = (typeof TABLES)[number]

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  tables: Record<TableName, unknown[]>
  /** Einstellungen aus localStorage (Coach, Töne …) */
  settings: Record<string, string>
}

export interface BackupSummary {
  games: number
  cards: number
  puzzleAttempts: number
  endgameResults: number
}

// Datumswerte (z. B. Fälligkeit der Lernkarten) überleben JSON nur mit Markierung
const DATE_TAG = '__date'
const replacer = function (this: Record<string, unknown>, key: string, value: unknown) {
  const raw = this[key]
  return raw instanceof Date ? { [DATE_TAG]: raw.toISOString() } : value
}
const reviver = (_: string, value: unknown) =>
  value && typeof value === 'object' && DATE_TAG in value && Object.keys(value).length === 1
    ? new Date((value as Record<string, string>)[DATE_TAG])
    : value

export async function createBackup(db: TrainerDB, settings: Record<string, string> = {}): Promise<string> {
  const tables = {} as Backup['tables']
  for (const t of TABLES) tables[t] = await db.table(t).toArray()
  const backup: Backup = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables, settings }
  return JSON.stringify(backup, replacer)
}

/** Liest und prüft eine Backup-Datei. Wirft mit deutscher Meldung, wenn sie nicht passt. */
export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text, reviver)
  } catch {
    throw new Error('Die Datei ist kein gültiges Backup (kein JSON).')
  }
  const b = data as Partial<Backup>
  if (!b || b.app !== BACKUP_APP) throw new Error('Diese Datei ist kein Schachtrainer-Backup.')
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new Error('Das Backup stammt aus einer neueren App-Version. Bitte zuerst die App aktualisieren.')
  }
  if (!b.tables || TABLES.some((t) => !Array.isArray(b.tables![t]))) throw new Error('Das Backup ist unvollständig.')
  return { settings: {}, ...b } as Backup
}

export function summarize(b: Backup): BackupSummary {
  return {
    games: b.tables.games.length,
    cards: b.tables.cards.length,
    puzzleAttempts: b.tables.puzzleAttempts.length,
    endgameResults: b.tables.endgameResults.length,
  }
}

/** Ersetzt ALLE Lerndaten auf diesem Gerät durch das Backup (in einer Transaktion). */
export async function restoreBackup(db: TrainerDB, b: Backup): Promise<void> {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear()
      await db.table(t).bulkAdd(b.tables[t])
    }
  })
}
