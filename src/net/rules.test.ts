import { describe, expect, it } from 'vitest'
import { decideBoth, GRACE_MS, type Finish } from './rules'

const f = (steps: number, ms: number, hints = 0): Finish => ({ steps, hints, ms, chain: [] })

describe('decideBoth', () => {
  it('first finisher wins on equal score', () => {
    expect(decideBoth(f(5, 20_000), f(5, 30_000))).toBe('a')
    expect(decideBoth(f(5, 30_000), f(5, 20_000))).toBe('b')
  })
  it('second finisher wins with fewer steps inside the grace window', () => {
    expect(decideBoth(f(7, 20_000), f(5, 25_000))).toBe('b')
  })
  it('grace window expires', () => {
    expect(decideBoth(f(7, 20_000), f(5, 20_000 + GRACE_MS + 1))).toBe('a')
  })
  it('hints count as steps', () => {
    expect(decideBoth(f(5, 20_000, 1), f(5, 25_000))).toBe('b')
  })
  it('identical results draw', () => {
    expect(decideBoth(f(5, 20_000), f(5, 20_000))).toBe('draw')
  })
})
