import raw from '../data/puzzles.json'
import { distance } from './bfs'
import { isWord, type Len } from './dict'

export interface Puzzle {
  start: string
  end: string
  par: number
}
export type Difficulty = 'easy' | 'medium' | 'hard'
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

const all: Puzzle[] = (raw as [string, string, number][]).map(([start, end, par]) => ({ start, end, par }))

/** Par ranges per word length. Longer words have a higher minimum par because endpoints share no letters. */
const RANGES: Record<Len, Record<Difficulty, [number, number]>> = {
  3: { easy: [3, 4], medium: [5, 6], hard: [7, 8] },
  4: { easy: [4, 4], medium: [5, 6], hard: [7, 8] },
  5: { easy: [5, 5], medium: [6, 7], hard: [8, 8] },
}

const pools = new Map<string, Puzzle[]>()
function pool(len: Len, diff: Difficulty): Puzzle[] {
  const key = `${len}${diff}`
  let p = pools.get(key)
  if (!p) {
    const [lo, hi] = RANGES[len][diff]
    p = all.filter((x) => x.start.length === len && x.par >= lo && x.par <= hi)
    pools.set(key, p)
  }
  return p
}

export const puzzleKey = (p: Puzzle) => `${p.start}-${p.end}`

/** Random puzzle, avoiding any already in `seen` until the pool runs out. */
export function pickPuzzle(len: Len, diff: Difficulty, seen: Set<string> = new Set(), rand = Math.random): Puzzle {
  const p = pool(len, diff)
  const fresh = p.filter((x) => !seen.has(puzzleKey(x)))
  const from = fresh.length ? fresh : p
  return from[Math.floor(rand() * from.length)]
}

/** Never trust a puzzle that arrived over the network. */
export function isValidPuzzle(p: unknown): p is Puzzle {
  if (!p || typeof p !== 'object') return false
  const { start, end, par } = p as Puzzle
  if (typeof start !== 'string' || typeof end !== 'string' || typeof par !== 'number') return false
  if (start.length !== end.length || !isWord(start) || !isWord(end)) return false
  return distance(start, end) === par
}
