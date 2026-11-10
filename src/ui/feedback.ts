import type { MoveEvent } from '../core/chess/moveEvent'
import { useAppSettings } from './appSettings'

/**
 * Zuggeräusche, synthetisch per Web Audio erzeugt (keine Audiodateien, keine Lizenzfragen).
 * Der AudioContext entsteht erst bei der ersten Nutzer-Interaktion (Vorgabe von iOS/Chrome).
 */
let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** kurzer "Holzklick": gefiltertes Rauschen mit schnellem Abklingen */
function knock(ac: AudioContext, at: number, freq: number, gain: number, length = 0.07) {
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * length), ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3
  const src = ac.createBufferSource()
  src.buffer = buffer
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = 1.2
  const g = ac.createGain()
  g.gain.value = gain
  src.connect(filter).connect(g).connect(ac.destination)
  src.start(at)
}

function tone(ac: AudioContext, at: number, freq: number, length: number, gain = 0.08) {
  const osc = ac.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = freq
  const g = ac.createGain()
  g.gain.setValueAtTime(gain, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + length)
  osc.connect(g).connect(ac.destination)
  osc.start(at)
  osc.stop(at + length)
}

export function playMoveSound(event: MoveEvent) {
  if (!useAppSettings.getState().sound) return
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.01
  switch (event) {
    case 'move':
      knock(ac, t, 1800, 0.9)
      break
    case 'capture':
      knock(ac, t, 1100, 1.2, 0.1)
      knock(ac, t + 0.05, 1600, 0.7)
      break
    case 'castle':
      knock(ac, t, 1800, 0.8)
      knock(ac, t + 0.09, 1700, 0.8)
      break
    case 'check':
      knock(ac, t, 1500, 1)
      tone(ac, t, 880, 0.18)
      break
    case 'promote':
      knock(ac, t, 1800, 0.8)
      tone(ac, t + 0.03, 660, 0.12)
      tone(ac, t + 0.12, 990, 0.18)
      break
    case 'mate':
      knock(ac, t, 1200, 1.1, 0.1)
      tone(ac, t + 0.05, 523, 0.25)
      tone(ac, t + 0.2, 659, 0.25)
      tone(ac, t + 0.35, 784, 0.4)
      break
  }
}

/** Kurzer Ton für richtig/falsch in Trainern */
export function playResultSound(ok: boolean) {
  if (!useAppSettings.getState().sound) return
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.01
  if (ok) {
    tone(ac, t, 660, 0.12, 0.06)
    tone(ac, t + 0.09, 880, 0.2, 0.06)
  } else tone(ac, t, 220, 0.25, 0.07)
}

/** Vibration (nur Android – iPhones erlauben das im Browser nicht) */
export function vibrate(kind: 'error' | 'success') {
  if (!useAppSettings.getState().vibration) return
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  navigator.vibrate(kind === 'error' ? [40, 60, 40] : 25)
}
