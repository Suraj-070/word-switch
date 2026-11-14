import { create } from 'zustand'
import { distance, nextStep } from '../engine/bfs'
import { isWord } from '../engine/dict'
import type { Puzzle } from '../engine/puzzles'
import { useSettings } from './settings'

export type Status = 'idle' | 'playing' | 'won'
/** Who made each move of a turn-based game. The starting word has no owner. */
export type Owner = 'me' | 'rival' | null

interface Game {
  puzzle: Puzzle | null
  chain: string[]
  hintsUsed: number
  hintWord: string | null
  selected: number | null
  /** Letter waiting for the player to pick which slot it goes in (only when several slots work). */
  pending: string | null
  status: Status
  startedAt: number
  finishedAt: number | null
  /** Bumped on every rejected move so the board can replay its shake animation. */
  shake: number
  toast: { id: number; text: string } | null
  /** Turn-based modes: whose move it is, who made each word, and when this turn began. */
  turnMode: boolean
  myTurn: boolean
  owners: Owner[]
  turnSince: number

  start: (p: Puzzle, startedAt?: number, turn?: { first: 'me' | 'rival' }) => void
  /** Apply the rival's move in a turn-based game. Returns false if it isn't a legal move right now. */
  applyRemote: (word: string) => boolean
  selectSlot: (i: number) => void
  pressLetter: (ch: string) => void
  undo: () => void
  hint: () => void
  clearToast: () => void
}

let toastId = 0
const buzz = () => {
  try {
    navigator.vibrate?.(20)
  } catch {
    /* not supported */
  }
}

/** Slots where `ch` produces a fresh dictionary word. */
export function slotsFor(cur: string, ch: string, used: Set<string>): number[] {
  const out: number[] = []
  for (let i = 0; i < cur.length; i++) {
    if (cur[i] === ch) continue
    const w = cur.slice(0, i) + ch + cur.slice(i + 1)
    if (isWord(w) && !used.has(w)) out.push(i)
  }
  return out
}

export const useGame = create<Game>((set, get) => {
  const fail = (text: string) => {
    buzz()
    set((s) => ({ shake: s.shake + 1, pending: null, toast: { id: ++toastId, text } }))
  }

  const commit = (word: string) => {
    const { puzzle, chain } = get()
    if (!puzzle) return
    const next = [...chain, word]
    const won = word === puzzle.end
    const turn = get().turnMode
    set({
      ...(turn ? { owners: [...get().owners, 'me' as const], myTurn: false, turnSince: Date.now() } : {}),
      chain: next,
      selected: null,
      pending: null,
      hintWord: null,
      toast: null,
      status: won ? 'won' : 'playing',
      finishedAt: won ? Date.now() : null,
    })
  }

  const tryApply = (slot: number, ch: string) => {
    const { chain } = get()
    const cur = chain[chain.length - 1]
    if (cur[slot] === ch) return fail('That letter is already there')
    const w = cur.slice(0, slot) + ch + cur.slice(slot + 1)
    if (!isWord(w)) return fail(`${w.toUpperCase()} isn't in the word list`)
    if (chain.includes(w)) return fail(`You already used ${w.toUpperCase()}`)
    commit(w)
  }

  return {
    puzzle: null,
    chain: [],
    hintsUsed: 0,
    hintWord: null,
    selected: null,
    pending: null,
    status: 'idle',
    startedAt: 0,
    finishedAt: null,
    shake: 0,
    toast: null,
    turnMode: false,
    myTurn: true,
    owners: [],
    turnSince: 0,

    start: (puzzle, startedAt = Date.now(), turn) =>
      set({
        turnMode: Boolean(turn),
        myTurn: turn ? turn.first === 'me' : true,
        owners: [null],
        turnSince: startedAt,
        puzzle,
        chain: [puzzle.start],
        hintsUsed: 0,
        hintWord: null,
        selected: null,
        pending: null,
        status: 'playing',
        startedAt,
        finishedAt: null,
        toast: null,
      }),

    applyRemote: (word) => {
      const { status, chain, puzzle, turnMode, myTurn, owners } = get()
      if (status !== 'playing' || !turnMode || myTurn || !puzzle) return false
      const cur = chain[chain.length - 1]
      if (word.length !== cur.length || !isWord(word) || chain.includes(word)) return false
      let diff = 0
      for (let i = 0; i < cur.length; i++) if (cur[i] !== word[i]) diff++
      if (diff !== 1) return false
      const won = word === puzzle.end
      set({
        chain: [...chain, word],
        owners: [...owners, 'rival'],
        myTurn: true,
        turnSince: Date.now(),
        selected: null,
        pending: null,
        hintWord: null,
        toast: null,
        status: won ? 'won' : 'playing',
        finishedAt: won ? Date.now() : null,
      })
      return true
    },

    selectSlot: (i) => {
      const { status, pending, selected, turnMode, myTurn } = get()
      if (status !== 'playing' || (turnMode && !myTurn)) return
      if (pending) return tryApply(i, pending)
      set({ selected: selected === i ? null : i, toast: null })
    },

    pressLetter: (ch) => {
      const { status, selected, chain, turnMode, myTurn } = get()
      if (status !== 'playing' || (turnMode && !myTurn)) return
      if (selected !== null) return tryApply(selected, ch)
      const cur = chain[chain.length - 1]
      const slots = slotsFor(cur, ch, new Set(chain))
      if (slots.length === 1) return commit(cur.slice(0, slots[0]) + ch + cur.slice(slots[0] + 1))
      if (slots.length === 0) return fail(`No word you can make with ${ch.toUpperCase()}`)
      set({ pending: ch, toast: null })
    },

    undo: () => {
      const { status, chain, turnMode } = get()
      if (status !== 'playing' || chain.length < 2 || turnMode) return
      set({ chain: chain.slice(0, -1), selected: null, pending: null, hintWord: null, toast: null })
    },

    hint: () => {
      const { status, chain, puzzle, hintWord, hintsUsed, turnMode, myTurn } = get()
      if (status !== 'playing' || !puzzle || hintWord || (turnMode && !myTurn)) return
      const next = nextStep(chain[chain.length - 1], puzzle.end)
      if (next) set({ hintWord: next, hintsUsed: hintsUsed + 1, selected: null, pending: null })
    },

    clearToast: () => set({ toast: null }),
  }
})

/** Moves still needed from the current word. */
export function stepsLeft(chain: string[], puzzle: Puzzle | null): number {
  return puzzle && chain.length ? distance(chain[chain.length - 1], puzzle.end) : 0
}

export function recordWinOnce(puzzle: Puzzle, steps: number, hints: number) {
  useSettings.getState().recordWin(`${puzzle.start}-${puzzle.end}`, steps + hints <= puzzle.par)
}
