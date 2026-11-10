import { useEffect, useState } from 'react'

/**
 * "App installieren": Chrome/Edge/Android liefern ein beforeinstallprompt-Ereignis, das wir
 * aufheben und auf Knopfdruck auslösen. iPhone/iPad kennen das nicht – dort hilft nur die
 * Anleitung "Teilen → Zum Home-Bildschirm".
 */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

export function registerInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
  })
}

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

export const isIos = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return {
    installed: isStandalone(),
    canPrompt: deferred !== null,
    ios: isIos(),
    async prompt() {
      if (!deferred) return
      await deferred.prompt()
      await deferred.userChoice
      deferred = null
      force((n) => n + 1)
    },
  }
}
