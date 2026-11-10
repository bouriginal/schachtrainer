import { useRef, useState } from 'react'
import { createBackup, parseBackup, restoreBackup, summarize, type Backup } from '../../core/storage/backup'
import { getDatabase } from '../../services'
import { APP_SETTINGS_KEY, useAppSettings } from '../../ui/appSettings'
import { playMoveSound, vibrate } from '../../ui/feedback'
import { useInstall } from '../../ui/install'
import { loadSettings, saveSettings, type CoachSettings } from '../coach/settings'

const SETTINGS_KEYS = [APP_SETTINGS_KEY, 'schachtrainer.coach']

function readSettings(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (const k of SETTINGS_KEYS) {
      const v = localStorage.getItem(k)
      if (v !== null) out[k] = v
    }
  } catch {
    /* kein localStorage */
  }
  return out
}

export function SettingsPage() {
  const app = useAppSettings()
  const [coach, setCoach] = useState<CoachSettings>(loadSettings)
  const install = useInstall()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, setPending] = useState<Backup | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const updateCoach = (patch: Partial<CoachSettings>) => {
    const next = { ...coach, ...patch }
    setCoach(next)
    saveSettings(next)
  }

  const exportBackup = async () => {
    setMsg(null)
    try {
      const json = await createBackup(getDatabase(), readSettings())
      const name = `schachtrainer-backup-${new Date().toISOString().slice(0, 10)}.json`
      const file = new File([json], name, { type: 'application/json' })
      // Am Handy ist "Teilen" der bequemste Weg (Dateien, AirDrop, Mail …)
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Schachtrainer-Backup' })
          setMsg({ ok: true, text: 'Backup geteilt.' })
          return
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return
        }
      }
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMsg({ ok: true, text: `Backup gespeichert: ${name}` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Export fehlgeschlagen.' })
    }
  }

  const chooseFile = async (f: File | undefined) => {
    setMsg(null)
    setPending(null)
    if (!f) return
    try {
      setPending(parseBackup(await f.text()))
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Datei konnte nicht gelesen werden.' })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const confirmImport = async () => {
    if (!pending) return
    try {
      await restoreBackup(getDatabase(), pending)
      for (const [k, v] of Object.entries(pending.settings)) if (SETTINGS_KEYS.includes(k)) localStorage.setItem(k, v)
      setPending(null)
      setMsg({ ok: true, text: 'Backup eingespielt. Die App wird neu geladen …' })
      setTimeout(() => window.location.reload(), 900)
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Import fehlgeschlagen.' })
    }
  }

  const s = pending ? summarize(pending) : null

  return (
    <div className="settings-page">
      <h1>Einstellungen</h1>

      {!install.installed && (
        <section className="card">
          <h2>Als App installieren</h2>
          {install.canPrompt ? (
            <>
              <p className="muted small">Dann startet der Schachtrainer wie eine App – im Vollbild, mit eigenem Icon und auch offline.</p>
              <button type="button" className="primary" onClick={() => void install.prompt()}>
                App installieren
              </button>
            </>
          ) : install.ios ? (
            <ol className="small steps">
              <li>
                In Safari unten auf <strong>Teilen</strong> tippen (Quadrat mit Pfeil nach oben).
              </li>
              <li>
                <strong>„Zum Home-Bildschirm“</strong> wählen und bestätigen.
              </li>
              <li>Ab jetzt die App über das neue Icon starten – dann läuft sie im Vollbild und offline.</li>
            </ol>
          ) : (
            <p className="muted small">
              In Chrome oder Edge: Menü → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“. Auf dem iPhone: in Safari Teilen →
              „Zum Home-Bildschirm“.
            </p>
          )}
        </section>
      )}

      <section className="card">
        <h2>Töne und Vibration</h2>
        <label className="toggle">
          <input
            type="checkbox"
            checked={app.sound}
            onChange={(e) => {
              app.set({ sound: e.target.checked })
              if (e.target.checked) playMoveSound('move')
            }}
          />
          Zuggeräusche
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={app.vibration}
            onChange={(e) => {
              app.set({ vibration: e.target.checked })
              if (e.target.checked) vibrate('success')
            }}
          />
          Vibration bei Fehlern (nur Android)
        </label>
      </section>

      <section className="card">
        <h2>Coach</h2>
        <label className="toggle">
          <input type="checkbox" checked={coach.enabled} onChange={(e) => updateCoach({ enabled: e.target.checked })} />
          Coach erklärt jeden meiner Züge
        </label>
        <label className="toggle">
          <input type="checkbox" checked={coach.pauseOnMistake} disabled={!coach.enabled} onChange={(e) => updateCoach({ pauseOnMistake: e.target.checked })} />
          Bei Fehlern anhalten, damit ich zurücknehmen kann
        </label>
        <label className="toggle">
          <input type="checkbox" checked={coach.claude} disabled={!coach.enabled} onChange={(e) => updateCoach({ claude: e.target.checked })} />
          „Genauer erklären“ mit Claude anbieten
        </label>
      </section>

      <section className="card">
        <h2>Backup &amp; Gerätewechsel</h2>
        <p className="muted small">
          Deine Daten (Partien, Eröffnungsfortschritt, Taktik, Endspiele) liegen nur auf diesem Gerät. Exportiere ein Backup und spiele es auf
          dem anderen Gerät ein, um Handy und Laptop abzugleichen.
        </p>
        <div className="button-row">
          <button type="button" onClick={() => void exportBackup()}>
            ⬇︎ Backup exportieren
          </button>
          <label className="button file-button">
            ⬆︎ Backup einspielen
            <input ref={fileRef} type="file" accept="application/json,.json" onChange={(e) => void chooseFile(e.target.files?.[0])} />
          </label>
        </div>
        {pending && s && (
          <div className="confirm-box" role="alertdialog" aria-label="Backup einspielen bestätigen">
            <p>
              Backup vom {new Date(pending.exportedAt).toLocaleString('de-DE')}: {s.games} Partien, {s.cards} Eröffnungsstellungen,{' '}
              {s.puzzleAttempts} Taktikversuche, {s.endgameResults} Endspiel-Ergebnisse.
            </p>
            <p>
              <strong>Achtung:</strong> Das ersetzt alle Daten auf diesem Gerät. Das lässt sich nicht rückgängig machen – exportiere vorher ein
              Backup, falls du sie noch brauchst.
            </p>
            <div className="button-row">
              <button type="button" className="danger" onClick={() => void confirmImport()}>
                Ersetzen und einspielen
              </button>
              <button type="button" onClick={() => setPending(null)}>
                Abbrechen
              </button>
            </div>
          </div>
        )}
        {msg && <p className={msg.ok ? 'ok-msg' : 'error'}>{msg.text}</p>}
      </section>

      <section className="card">
        <h2>Über</h2>
        <p className="small muted">
          Engine: Stockfish 19 (GPL-3.0). Taktikaufgaben: Lichess-Puzzle-Datenbank (CC0). Alle Daten bleiben auf deinem Gerät.
        </p>
      </section>
    </div>
  )
}
