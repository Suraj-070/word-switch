import { describe, expect, it } from 'vitest'
import raw from '../data/puzzles.json'
import { distance, nextStep, shortestPath } from './bfs'
import { diffIndex, isWord, neighbors } from './dict'
import { isValidPuzzle, pickPuzzle } from './puzzles'
import { rate } from './scoring'

describe('dictionary', () => {
  it('knows common words and rejects junk', () => {
    expect(isWord('boat')).toBe(true)
    expect(isWord('xqzv')).toBe(false)
  })
  it('neighbors differ by exactly one letter', () => {
    for (const n of neighbors('boat')) expect(diffIndex('boat', n)).toBeGreaterThan(-1)
    expect(neighbors('boat')).toContain('coat')
  })
})

describe('bfs', () => {
  it('shortest path steps are all valid single swaps', () => {
    const p = shortestPath('cold', 'warm')!
    expect(p[0]).toBe('cold')
    expect(p.at(-1)).toBe('warm')
    for (let i = 1; i < p.length; i++) {
      expect(isWord(p[i])).toBe(true)
      expect(diffIndex(p[i - 1], p[i])).toBeGreaterThan(-1)
    }
    expect(p.length - 1).toBe(distance('cold', 'warm'))
  })
  it('nextStep gets closer every time', () => {
    const n = nextStep('cold', 'warm')!
    expect(distance(n, 'warm')).toBe(distance('cold', 'warm') - 1)
  })
})

describe('puzzles', () => {
  it('every shipped puzzle has the stated par and no shared letter positions', () => {
    for (const [s, e, par] of raw as [string, string, number][]) {
      expect(distance(s, e)).toBe(par)
      expect([...s].some((c, i) => c === e[i])).toBe(false)
    }
  })
  it('pickPuzzle is valid; garbage is rejected', () => {
    expect(isValidPuzzle(pickPuzzle(4, 'easy'))).toBe(true)
    expect(isValidPuzzle({ start: 'boat', end: 'fish', par: 1 })).toBe(false)
    expect(isValidPuzzle(null)).toBe(false)
  })
})

describe('rating', () => {
  it('par is perfect, hints count as extra steps', () => {
    expect(rate(5, 0, 5).stars).toBe(3)
    expect(rate(5, 1, 5).stars).toBe(2)
    expect(rate(9, 0, 5).stars).toBe(1)
  })
})
