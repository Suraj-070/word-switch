import { useEffect, useState } from 'react'
import { formatTime } from '../engine/scoring'

/** Isolated so the once-a-second tick never re-renders the board. */
export function Clock({ since, until }: { since: number; until?: number | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [until])
  return <span className="tabular-nums">{formatTime((until ?? now) - since)}</span>
}
