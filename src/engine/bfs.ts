import { neighbors } from './dict'

const cache = new Map<string, Map<string, number>>()
const CACHE_MAX = 24

/** Distance from every reachable word to `target`. Cached, computed once per target. */
export function distMap(target: string): Map<string, number> {
  const hit = cache.get(target)
  if (hit) {
    cache.delete(target)
    cache.set(target, hit)
    return hit
  }
  const dist = new Map<string, number>([[target, 0]])
  const queue = [target]
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]
    const d = dist.get(u)!
    for (const v of neighbors(u)) {
      if (!dist.has(v)) {
        dist.set(v, d + 1)
        queue.push(v)
      }
    }
  }
  cache.set(target, dist)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
  return dist
}

export function distance(from: string, target: string): number {
  return distMap(target).get(from) ?? Infinity
}

/** The neighbor of `from` that is closest to `target`, or null when there is no route. */
export function nextStep(from: string, target: string): string | null {
  const dist = distMap(target)
  const here = dist.get(from)
  if (here === undefined || here === 0) return null
  let best: string | null = null
  for (const v of neighbors(from)) {
    if (dist.get(v) === here - 1) {
      best = v
      break
    }
  }
  return best
}

export function shortestPath(from: string, target: string): string[] | null {
  const dist = distMap(target)
  if (!dist.has(from)) return null
  const path = [from]
  let cur: string | null = from
  while (cur && cur !== target) {
    cur = nextStep(cur, target)
    if (cur) path.push(cur)
  }
  return path
}
