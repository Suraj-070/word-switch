import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Difficulty } from '../engine/puzzles'

interface Settings {
  /** Anonymous id so the server can keep an online record for this browser. */
  pid: string
  name: string
  assist: boolean
  length: 3 | 4 | 5
  difficulty: Difficulty
  solved: number
  perfect: number
  seen: string[]
  set: (p: Partial<Pick<Settings, 'name' | 'assist' | 'length' | 'difficulty'>>) => void
  recordWin: (key: string, perfect: boolean) => void
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      pid: crypto.randomUUID(),
      name: '',
      assist: true,
      length: 4,
      difficulty: 'easy',
      solved: 0,
      perfect: 0,
      seen: [],
      set: (p) => set(p),
      recordWin: (key, perfect) =>
        set((s) => ({
          solved: s.solved + 1,
          perfect: s.perfect + (perfect ? 1 : 0),
          seen: [...s.seen.filter((k) => k !== key), key].slice(-400),
        })),
    }),
    { name: 'word-switch:v1' },
  ),
)
