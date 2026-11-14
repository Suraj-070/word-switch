import { useCallback, useEffect, useReducer, useRef } from 'react'
import { distance } from '../engine/bfs'
import { neighbors } from '../engine/dict'
import { isValidPuzzle, pickPuzzle, type Difficulty, type Puzzle } from '../engine/puzzles'
import type { Len } from '../engine/dict'
import { useGame } from '../store/game'
import { useSettings } from '../store/settings'
import { decideBoth, GRACE_MS, MAX_VERSUS_MOVES, TURN_MS, type Finish } from './rules'
import { openTransport } from './transport'

export type Phase = 'connecting' | 'lobby' | 'countdown' | 'playing' | 'over' | 'closed'
export type Mode = 'race' | 'versus' | 'coop'
export const MODES: Mode[] = ['race', 'versus', 'coop']
export interface Result {
  /** team / fail are the co-op outcomes */
  winner: 'me' | 'rival' | 'draw' | 'team' | 'fail'
  reason: string
}
export interface RoomState {
  phase: Phase
  mode: Mode
  error: string | null
  live: boolean
  rival: { id: string; name: string; seen: number } | null
  round: number
  puzzle: Puzzle | null
  startAt: number
  rivalDist: number | null
  rivalSteps: number
  rivalFinish: Finish | null
  myFinish: Finish | null
  graceEndsAt: number | null
  result: Result | null
}

const HEARTBEAT_MS = 3000
const STALE_MS = 10_000
const COUNTDOWN_MS = 3500
const JOIN_TIMEOUT_MS = 7000

const initial: RoomState = {
  phase: 'connecting',
  mode: 'race',
  error: null,
  live: false,
  rival: null,
  round: 0,
  puzzle: null,
  startAt: 0,
  rivalDist: null,
  rivalSteps: 0,
  rivalFinish: null,
  myFinish: null,
  graceEndsAt: null,
  result: null,
}

const cleanName = (n: unknown) => (typeof n === 'string' && n.trim() ? n.trim().slice(0, 16) : 'Player')

interface Msg {
  v: 1
  t: 'hello' | 'start' | 'progress' | 'finish' | 'leave' | 'move' | 'forfeit'
  id: string
  [k: string]: unknown
}

export function useRoom(code: string, isHost: boolean, myName: string) {
  const st = useRef<RoomState>({ ...initial })
  const [, force] = useReducer((x: number) => x + 1, 0)
  const set = useCallback((p: Partial<RoomState>) => {
    st.current = { ...st.current, ...p }
    force()
  }, [])

  const id = useRef(crypto.randomUUID())
  const name = useRef(cleanName(myName))
  const tr = useRef<Awaited<ReturnType<typeof openTransport>> | null>(null)
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t)
      fn()
    }, ms)
    timers.current.add(t)
    return t
  }

  const send = useCallback((t: Msg['t'], extra: Record<string, unknown> = {}) => {
    tr.current?.send({ v: 1, t, id: id.current, ...extra } satisfies Msg)
  }, [])

  const hello = useCallback(() => {
    const s = st.current
    send('hello', {
      name: name.current,
      host: isHost,
      guest: isHost ? s.rival?.id ?? null : null,
      phase: s.phase,
    })
  }, [isHost, send])

  const finishRound = useCallback(
    (result: Result) => {
      if (st.current.phase === 'over' || st.current.phase === 'closed') return
      set({ phase: 'over', result, graceEndsAt: null })
    },
    [set],
  )

  /** Called whenever either player's finish arrives or the grace timer fires. */
  const evaluate = useCallback(() => {
    const s = st.current
    if (s.phase !== 'playing') return
    const { myFinish: me, rivalFinish: rv } = s
    if (me && rv) {
      const d = decideBoth(me, rv)
      const winner = d === 'a' ? 'me' : d === 'b' ? 'rival' : 'draw'
      const reason =
        winner === 'draw'
          ? 'Same score, same time.'
          : winner === 'me'
            ? me.ms <= rv.ms
              ? 'You got there first.'
              : `You beat their ${rv.steps + rv.hints} with fewer steps.`
            : rv.ms <= me.ms
              ? 'They got there first.'
              : `They beat your ${me.steps + me.hints} with fewer steps.`
      finishRound({ winner, reason })
      return
    }
    const first = me ?? rv
    if (!first) return
    if (s.graceEndsAt === null) {
      set({ graceEndsAt: Date.now() + GRACE_MS })
      later(() => {
        const c = st.current
        if (c.phase !== 'playing') return
        if (c.myFinish && !c.rivalFinish) finishRound({ winner: 'me', reason: 'You got there first.' })
        else if (c.rivalFinish && !c.myFinish) finishRound({ winner: 'rival', reason: 'They got there first.' })
      }, GRACE_MS + 400)
    }
  }, [finishRound, set])

  const applyStart = useCallback(
    (round: number, puzzle: Puzzle, startIn: number, mode: Mode = 'race', first: 'me' | 'rival' = 'me') => {
      const startAt = Date.now() + startIn
      set({
        phase: 'countdown',
        mode,
        round,
        puzzle,
        startAt,
        rivalDist: puzzle.par,
        rivalSteps: 0,
        rivalFinish: null,
        myFinish: null,
        graceEndsAt: null,
        result: null,
      })
      useGame.getState().start(puzzle, startAt, mode === 'race' ? undefined : { first })
      later(() => {
        if (st.current.round === round && st.current.phase === 'countdown') set({ phase: 'playing' })
      }, startIn)
    },
    [set],
  )

  const onMessage = useCallback(
    (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return
      const m = raw as Msg
      if (m.v !== 1 || m.id === id.current) return
      const s = st.current
      const now = Date.now()

      switch (m.t) {
        case 'hello': {
          if (isHost) {
            if (m.host) return
            if (!s.rival) {
              set({ rival: { id: m.id, name: cleanName(m.name), seen: now }, phase: s.phase === 'connecting' ? 'lobby' : s.phase })
              hello()
            } else if (s.rival.id === m.id) {
              set({ rival: { ...s.rival, name: cleanName(m.name), seen: now } })
            }
          } else {
            if (!m.host) return
            if (m.guest && m.guest !== id.current) {
              set({ phase: 'closed', error: 'This room already has two players.' })
              return
            }
            set({
              rival: { id: m.id, name: cleanName(m.name), seen: now },
              phase: s.phase === 'connecting' ? 'lobby' : s.phase,
            })
          }
          return
        }
        case 'start': {
          if (isHost || s.rival?.id !== m.id) return
          const puzzle = m.puzzle
          const round = Number(m.round)
          if (!isValidPuzzle(puzzle) || !Number.isFinite(round) || round <= s.round) return
          const mode = MODES.includes(m.mode as Mode) ? (m.mode as Mode) : 'race'
          applyStart(round, puzzle, Math.min(Math.max(Number(m.startIn) || COUNTDOWN_MS, 1000), 6000), mode, m.first === 'host' ? 'rival' : 'me')
          return
        }
        case 'move': {
          if (s.rival?.id !== m.id || Number(m.round) !== s.round || s.phase !== 'playing' || s.mode === 'race') return
          useGame.getState().applyRemote(String(m.word))
          set({ rival: { ...s.rival, seen: now } })
          return
        }
        case 'forfeit': {
          if (s.rival?.id !== m.id || Number(m.round) !== s.round || s.phase !== 'playing' || s.mode === 'race') return
          if (s.mode === 'coop') finishRound({ winner: 'fail', reason: 'Dead end: nowhere left to go.' })
          else finishRound({ winner: 'me', reason: m.reason === 'timeout' ? 'Your rival ran out of time.' : 'Your rival has no moves left.' })
          return
        }
        case 'progress': {
          if (s.rival?.id !== m.id || Number(m.round) !== s.round) return
          set({
            rivalDist: Number(m.dist),
            rivalSteps: Number(m.steps),
            rival: { ...s.rival, seen: now },
          })
          return
        }
        case 'finish': {
          if (s.rival?.id !== m.id || Number(m.round) !== s.round || s.rivalFinish) return
          const chain = Array.isArray(m.chain) ? (m.chain as unknown[]).filter((w): w is string => typeof w === 'string') : []
          set({
            rivalFinish: { steps: Number(m.steps), hints: Number(m.hints) || 0, ms: Number(m.ms), chain },
            rivalDist: 0,
            rivalSteps: Number(m.steps),
          })
          evaluate()
          return
        }
        case 'leave': {
          if (s.rival?.id !== m.id) return
          if (!isHost) {
            set({ phase: 'closed', error: 'The host left the room.' })
          } else if (s.phase === 'playing' || s.phase === 'countdown') {
            set({ rival: null })
            finishRound({ winner: 'me', reason: 'Your rival left the room.' })
          } else {
            set({ rival: null, phase: s.phase === 'over' ? 'lobby' : s.phase })
          }
        }
      }
    },
    [applyStart, evaluate, finishRound, hello, isHost, set],
  )

  // Connect, heartbeat, and watch for stale rivals.
  useEffect(() => {
    let cancelled = false
    let beat: ReturnType<typeof setInterval>
    const mine = timers.current

    openTransport(code, isHost, { pid: useSettings.getState().pid, name: name.current })
      .then((t) => {
        if (cancelled) return t.close()
        tr.current = t
        t.onMessage(onMessage)
        set({ live: t.live, phase: isHost ? 'lobby' : 'connecting' })
        hello()
        beat = setInterval(() => {
          hello()
          const s = st.current
          if (s.rival && Date.now() - s.rival.seen > STALE_MS) {
            if (s.phase === 'lobby') set({ rival: null })
            else if ((s.phase === 'playing' || s.phase === 'countdown') && !s.rivalFinish) {
              set({ rival: null })
              finishRound({ winner: 'me', reason: 'Your rival disconnected.' })
            }
          }
        }, HEARTBEAT_MS)
        if (!isHost) {
          later(() => {
            if (st.current.phase === 'connecting')
              set({ phase: 'closed', error: `No room "${code}" found. Check the code, or ask your friend to create a new one.` })
          }, JOIN_TIMEOUT_MS)
        }
      })
      .catch((e: Error) => !cancelled && set({ phase: 'closed', error: e.message }))

    return () => {
      cancelled = true
      clearInterval(beat)
      mine.forEach(clearTimeout)
      mine.clear()
      send('leave')
      tr.current?.close()
      tr.current = null
    }
  }, [code, isHost, onMessage, hello, send, set, finishRound])

  // Mirror my own game into the room.
  useEffect(() => {
    return useGame.subscribe((g, prev) => {
      const s = st.current
      if (s.phase !== 'playing' || !g.puzzle || g.puzzle !== s.puzzle) return
      if (s.mode !== 'race') {
        // Send my own moves; the rival's arrive through onMessage and don't echo back.
        if (g.chain.length > prev.chain.length && g.owners[g.owners.length - 1] === 'me') {
          send('move', { round: s.round, word: g.chain[g.chain.length - 1] })
        }
        if (g.status === 'won' && prev.status !== 'won') {
          const steps = g.chain.length - 1
          if (s.mode === 'coop') finishRound({ winner: 'team', reason: `You reached ${g.puzzle.end.toUpperCase()} in ${steps} step${steps === 1 ? '' : 's'}.` })
          else if (g.owners[g.owners.length - 1] === 'me') finishRound({ winner: 'me', reason: `You reached ${g.puzzle.end.toUpperCase()}.` })
          else finishRound({ winner: 'rival', reason: `They reached ${g.puzzle.end.toUpperCase()}.` })
        } else if (s.mode === 'versus' && g.chain.length - 1 >= MAX_VERSUS_MOVES) {
          finishRound({ winner: 'draw', reason: `${MAX_VERSUS_MOVES} moves and nobody reached ${g.puzzle.end.toUpperCase()}.` })
        }
        return
      }
      if (g.status === 'won' && prev.status !== 'won' && !s.myFinish) {
        const fin: Finish = {
          steps: g.chain.length - 1,
          hints: g.hintsUsed,
          ms: (g.finishedAt ?? Date.now()) - s.startAt,
          chain: g.chain,
        }
        set({ myFinish: fin })
        send('finish', { round: s.round, ...fin })
        evaluate()
      } else if (g.chain.length !== prev.chain.length) {
        send('progress', {
          round: s.round,
          steps: g.chain.length - 1,
          dist: distance(g.chain[g.chain.length - 1], g.puzzle.end),
        })
      }
    })
  }, [evaluate, finishRound, send, set])

  /** Turn modes: forfeit when I run out of time (versus) or have no legal move left. */
  const { phase: curPhase, mode: curMode } = st.current
  const myTurn = useGame((g) => g.myTurn)
  const turnSince = useGame((g) => g.turnSince)
  const chainLen = useGame((g) => g.chain.length)
  useEffect(() => {
    if (curPhase !== 'playing' || curMode === 'race' || !myTurn) return
    const g = useGame.getState()
    if (g.status !== 'playing' || !g.puzzle) return
    const used = new Set(g.chain)
    const giveUp = (reason: 'timeout' | 'nomoves') => {
      const round = st.current.round
      send('forfeit', { round, reason })
      if (st.current.mode === 'coop') finishRound({ winner: 'fail', reason: 'Dead end: nowhere left to go.' })
      else finishRound({ winner: 'rival', reason: reason === 'timeout' ? 'You ran out of time.' : 'You have no moves left.' })
    }
    if (!neighbors(g.chain[g.chain.length - 1]).some((n) => !used.has(n))) {
      giveUp('nomoves')
      return
    }
    if (curMode !== 'versus') return
    const t = setTimeout(() => giveUp('timeout'), Math.max(0, turnSince + TURN_MS - Date.now()))
    return () => clearTimeout(t)
  }, [curPhase, curMode, myTurn, turnSince, chainLen, finishRound, send])

  /** Host only: pick a puzzle and tell the guest. */
  const startRound = useCallback(
    (length: Len, difficulty: Difficulty, mode: Mode = 'race') => {
      const s = st.current
      if (!isHost || !s.rival || (s.phase !== 'lobby' && s.phase !== 'over')) return
      const puzzle = pickPuzzle(length, difficulty)
      const round = s.round + 1
      // Turn modes: the host starts odd rounds, the guest starts even ones.
      const hostFirst = round % 2 === 1
      send('start', { round, puzzle, startIn: COUNTDOWN_MS, mode, first: hostFirst ? 'host' : 'guest' })
      applyStart(round, puzzle, COUNTDOWN_MS, mode, hostFirst ? 'me' : 'rival')
    },
    [applyStart, isHost, send],
  )

  return { state: st.current, startRound, myId: id.current, myName: name.current }
}
