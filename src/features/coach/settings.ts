/** Coach-Einstellungen, pro Browser in localStorage gemerkt (Fehler beim Zugriff werden ignoriert). */
export interface CoachSettings {
  enabled: boolean
  pauseOnMistake: boolean
  /** "Genauer erklären" über die Claude-API anbieten */
  claude: boolean
}

const KEY = 'schachtrainer.coach'
export const DEFAULT_SETTINGS: CoachSettings = { enabled: true, pauseOnMistake: true, claude: false }

export function loadSettings(): CoachSettings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<CoachSettings>) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: CoachSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* privater Modus o. Ä. – dann eben nicht merken */
  }
}
