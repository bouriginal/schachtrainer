import { create } from 'zustand'

/** App-weite Einstellungen dieses Geräts (localStorage, Fehler werden ignoriert). */
export interface AppSettings {
  sound: boolean
  vibration: boolean
}

export const APP_SETTINGS_KEY = 'schachtrainer.app'
const DEFAULTS: AppSettings = { sound: true, vibration: true }

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

interface Store extends AppSettings {
  set(patch: Partial<AppSettings>): void
}

export const useAppSettings = create<Store>((set, get) => ({
  ...load(),
  set(patch) {
    set(patch)
    try {
      const { sound, vibration } = get()
      localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify({ sound, vibration }))
    } catch {
      /* privater Modus – dann eben nicht merken */
    }
  },
}))
