export interface Rating {
  stars: 1 | 2 | 3
  label: string
}

/** Moves plus hints are compared to par (the BFS shortest path). Par itself is a perfect run. */
export function rate(steps: number, hints: number, par: number): Rating {
  const over = steps + hints - par
  if (over <= 0) return { stars: 3, label: hints ? 'Perfect with help' : 'Perfect' }
  if (over <= 2) return { stars: 2, label: 'Nicely done' }
  return { stars: 1, label: 'Made it' }
}

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Spoiler-free share text: row of squares per step, no words. */
export function shareText(opts: { steps: number; par: number; hints: number; ms: number; stars: number }): string {
  const bar = '🟦'.repeat(Math.min(opts.steps, 12)) + (opts.steps > 12 ? '…' : '')
  return `Word Switch ${'⭐'.repeat(opts.stars)}\n${bar}\n${opts.steps} steps (par ${opts.par}) · ${formatTime(opts.ms)}${
    opts.hints ? ` · ${opts.hints} hint${opts.hints > 1 ? 's' : ''}` : ''
  }`
}
