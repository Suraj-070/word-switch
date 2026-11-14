import { lazy, Suspense, useEffect, useState } from 'react'
import { warmServer } from './net/transport'
import { Home } from './components/Home'
import { Solo } from './components/Solo'

// Duel pulls in the realtime client, so it loads only when someone races.
const Duel = lazy(() => import('./components/Duel').then((m) => ({ default: m.Duel })))

type Screen = 'home' | 'solo' | 'duel'

const roomFromUrl = () => {
  const c = new URLSearchParams(location.search).get('room')
  return c && /^[A-Za-z]{4}$/.test(c) ? c.toUpperCase() : null
}

export function App() {
  const [joinCode] = useState(roomFromUrl)
  const [screen, setScreen] = useState<Screen>(joinCode ? 'duel' : 'home')
  useEffect(warmServer, [])

  const home = () => {
    if (location.search) history.replaceState(null, '', location.pathname)
    setScreen('home')
  }

  if (screen === 'solo') return <Solo onExit={home} />
  if (screen === 'duel')
    return (
      <Suspense fallback={<div className="grid h-dvh place-items-center text-[var(--ink-2)]">Loading…</div>}>
        <Duel initialCode={joinCode} onExit={home} />
      </Suspense>
    )
  return <Home onSolo={() => setScreen('solo')} onDuel={() => setScreen('duel')} />
}
