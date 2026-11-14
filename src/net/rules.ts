/** Pure duel rules, kept separate so they can be unit tested. */
export const GRACE_MS = 15_000
/** Versus: time you have to make your move before you forfeit the round. */
export const TURN_MS = 45_000
/** Versus: if nobody has reached the target after this many moves, it's a draw. Keep in sync with server/rules.js. */
export const MAX_VERSUS_MOVES = 30

export interface Finish {
  steps: number
  hints: number
  /** Milliseconds from the round start to the finishing move. */
  ms: number
  chain: string[]
}

export const score = (f: Finish) => f.steps + f.hints

/**
 * Both players finished. The first finisher wins unless the second one finished within the grace
 * window with a strictly better score (fewer steps+hints). Equal scores go to whoever was faster.
 */
export function decideBoth(a: Finish, b: Finish): 'a' | 'b' | 'draw' {
  if (a.ms === b.ms && score(a) === score(b)) return 'draw'
  const aFirst = a.ms <= b.ms
  const first = aFirst ? a : b
  const second = aFirst ? b : a
  const secondWins = second.ms <= first.ms + GRACE_MS && score(second) < score(first)
  const winnerIsFirst = !secondWins
  return winnerIsFirst === aFirst ? 'a' : 'b'
}
