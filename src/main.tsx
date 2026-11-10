import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'
import { registerInstallPrompt } from './ui/install'

registerInstallPrompt()
// Service Worker: lädt Updates im Hintergrund und aktiviert sie beim nächsten Start
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
