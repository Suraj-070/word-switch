// Same rules as src/net/rules.ts. Keep the two in sync.
export const GRACE_MS = 15_000
// Versus: if nobody has reached the target after this many moves, it's a draw. Keep in sync with src/net/rules.ts.
export const MAX_VERSUS_MOVES = 30

export const score = (f) => f.steps + f.hints

/**
 * Both players finished. First finisher wins unless the second finished inside the grace window
 * with a strictly better score (steps + hints). Equal scores go to whoever was faster.
 * Returns 'a' | 'b' | 'draw'.
 */
export function decideBoth(a, b) {
  if (a.ms === b.ms && score(a) === score(b)) return 'draw'
  const aFirst = a.ms <= b.ms
  const first = aFirst ? a : b
  const second = aFirst ? b : a
  const secondWins = second.ms <= first.ms + GRACE_MS && score(second) < score(first)
  const winnerIsFirst = !secondWins
  return winnerIsFirst === aFirst ? 'a' : 'b'
}
