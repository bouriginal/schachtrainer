import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router'
import { lazy, Suspense, useEffect } from 'react'
import { HomePage } from './features/home/HomePage'
import { MorePage } from './features/home/MorePage'
import { Icon, type IconName } from './ui/Icon'

// Bereiche werden erst beim ersten Aufruf geladen → schneller Start am Handy
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))
const PlayPage = page(() => import('./features/play/PlayPage'), 'PlayPage')
const OpeningsPage = page(() => import('./features/openings/OpeningsPage'), 'OpeningsPage')
const RepertoirePage = page(() => import('./features/openings/OpeningsPage'), 'RepertoirePage')
const TrainerPage = page(() => import('./features/openings/TrainerPage'), 'TrainerPage')
const TacticsPage = page(() => import('./features/tactics/TacticsPage'), 'TacticsPage')
const EndgamesPage = page(() => import('./features/endgames/EndgamesPage'), 'EndgamesPage')
const EndgameTrainerPage = page(() => import('./features/endgames/EndgamesPage'), 'EndgameTrainerPage')
const AnalysisListPage = page(() => import('./features/analysis/AnalysisPages'), 'AnalysisListPage')
const GameAnalysisPage = page(() => import('./features/analysis/AnalysisPages'), 'GameAnalysisPage')
const ProgressPage = page(() => import('./features/progress/ProgressPage'), 'ProgressPage')
const SettingsPage = page(() => import('./features/settings/SettingsPage'), 'SettingsPage')

/** Hauptbereiche für die Tab-Leiste am Handy; "Mehr" sammelt den Rest */
const TABS: { to: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { to: '/', label: 'Start', icon: 'home', match: (p) => p === '/' },
  { to: '/spielen', label: 'Spielen', icon: 'play', match: (p) => p.startsWith('/spielen') },
  { to: '/eroeffnungen', label: 'Eröffnungen', icon: 'book', match: (p) => p.startsWith('/eroeffnungen') },
  { to: '/taktik', label: 'Taktik', icon: 'bolt', match: (p) => p.startsWith('/taktik') },
  {
    to: '/mehr',
    label: 'Mehr',
    icon: 'more',
    match: (p) => ['/mehr', '/endspiele', '/analyse', '/fortschritt', '/einstellungen'].some((x) => p.startsWith(x)),
  },
]

/**
 * Handy: Tab-Leiste beim Runterscrollen ausblenden, beim Hochscrollen zeigen (wie in nativen Apps).
 * Gesteuert über eine Klasse am <html>, damit auch die Aktionsleiste mitrutschen kann.
 */
function useAutoHideTabBar() {
  const { pathname } = useLocation()
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('tabbar-hidden')
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      const atBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 4
      if (y < 40 || (y < last - 6 && !atBottom)) root.classList.remove('tabbar-hidden')
      else if (y > last + 6) root.classList.add('tabbar-hidden')
      last = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [pathname])
}

function TabBar() {
  const { pathname } = useLocation()
  useAutoHideTabBar()
  return (
    <nav className="tab-bar" aria-label="Hauptnavigation">
      {TABS.map((t) => {
        const active = t.match(pathname)
        return (
          <NavLink key={t.to} to={t.to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="app-header">
          <NavLink to="/" className="brand" aria-label="Schachtrainer – Start">
            ♞<span className="brand-text"> Schachtrainer</span>
          </NavLink>
          {/* Desktop: alle Bereiche oben. Am Handy übernimmt die Tab-Leiste unten. */}
          <nav className="top-nav" aria-label="Bereiche">
            <NavLink to="/" end>Start</NavLink>
            <NavLink to="/spielen">Spielen</NavLink>
            <NavLink to="/eroeffnungen">Eröffnungen</NavLink>
            <NavLink to="/taktik">Taktik</NavLink>
            <NavLink to="/endspiele">Endspiele</NavLink>
            <NavLink to="/analyse">Analyse</NavLink>
            <NavLink to="/fortschritt">Fortschritt</NavLink>
          </nav>
          <NavLink to="/einstellungen" className="header-icon" aria-label="Einstellungen" title="Einstellungen">
            <Icon name="settings" size={22} />
          </NavLink>
        </header>
        <main className="app-main">
          <Suspense fallback={<p className="muted">Lade …</p>}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/spielen" element={<PlayPage />} />
            <Route path="/eroeffnungen" element={<OpeningsPage />} />
            <Route path="/eroeffnungen/:id" element={<RepertoirePage />} />
            <Route path="/eroeffnungen/:id/training" element={<TrainerPage />} />
            <Route path="/taktik" element={<TacticsPage />} />
            <Route path="/endspiele" element={<EndgamesPage />} />
            <Route path="/endspiele/:id" element={<EndgameTrainerPage />} />
            <Route path="/analyse" element={<AnalysisListPage />} />
            <Route path="/analyse/:id" element={<GameAnalysisPage />} />
            <Route path="/fortschritt" element={<ProgressPage />} />
            <Route path="/mehr" element={<MorePage />} />
            <Route path="/einstellungen" element={<SettingsPage />} />
          </Routes>
          </Suspense>
        </main>
        <TabBar />
      </div>
    </BrowserRouter>
  )
}
