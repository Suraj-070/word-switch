import raw from '../data/words.json'

const lists = raw as Record<string, string>
const sets = new Map<number, Set<string>>()
const buckets = new Map<number, Map<string, string[]>>()

/** Lazily index one word length. Each word lands in one bucket per slot with that slot wildcarded. */
function ensure(len: number) {
  if (sets.has(len)) return
  const words = lists[len]?.split(',') ?? []
  sets.set(len, new Set(words))
  const b = new Map<string, string[]>()
  for (const w of words) {
    for (let i = 0; i < len; i++) {
      const key = `${i}|${w.slice(0, i)}|${w.slice(i + 1)}`
      const arr = b.get(key)
      if (arr) arr.push(w)
      else b.set(key, [w])
    }
  }
  buckets.set(len, b)
}

export const LENGTHS = [3, 4, 5] as const
export type Len = (typeof LENGTHS)[number]

export function isWord(w: string): boolean {
  ensure(w.length)
  return sets.get(w.length)!.has(w)
}

/** All dictionary words exactly one letter away from `w`. */
export function neighbors(w: string): string[] {
  ensure(w.length)
  const b = buckets.get(w.length)!
  const out: string[] = []
  for (let i = 0; i < w.length; i++) {
    const arr = b.get(`${i}|${w.slice(0, i)}|${w.slice(i + 1)}`)
    if (!arr) continue
    for (const x of arr) if (x !== w) out.push(x)
  }
  return out
}

/** Index of the single differing letter, or -1 if the words are not exactly one swap apart. */
export function diffIndex(a: string, b: string): number {
  if (a.length !== b.length) return -1
  let idx = -1
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      if (idx !== -1) return -1
      idx = i
    }
  }
  return idx
}
