import http from 'node:http'
import cors from 'cors'
import express from 'express'
import { Server } from 'socket.io'
import { decideBoth, GRACE_MS, MAX_VERSUS_MOVES } from './rules.js'

const CODE = /^[A-Z]{4}$/
const WORD = /^[a-z]{3,5}$/
const MAX_MSGS_PER_SEC = 40

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const int = (v, lo, hi) => {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null
}

const MODES = ['race', 'versus', 'coop']

function oneLetterApart(a, b) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false
  return d === 1
}

function validPuzzle(p) {
  return (
    p &&
    typeof p === 'object' &&
    WORD.test(p.start ?? '') &&
    WORD.test(p.end ?? '') &&
    p.start.length === p.end.length &&
    int(p.par, 1, 20) !== null
  )
}

/**
 * Rooms live in memory (they only matter while someone is connected). The server relays the game
 * messages between the two players and, when a round ends, saves the match and updates stats.
 */
export function createApp({ store, origins = ['*'], graceMs = GRACE_MS } = {}) {
  const corsOrigin = origins.includes('*') ? true : origins
  const app = express()
  app.use(cors({ origin: corsOrigin }))

  // Render pings this; without it the service gets SIGTERMed.
  app.get('/health', (_req, res) => res.type('text').send('ok'))

  app.get('/api/stats/:pid', async (req, res) => {
    try {
      res.json(await store.getStats(String(req.params.pid).slice(0, 64)))
    } catch (e) {
      console.error('stats failed', e.message)
      res.status(503).json({ error: 'unavailable' })
    }
  })

  const httpServer = http.createServer(app)
  const io = new Server(httpServer, { cors: { origin: corsOrigin }, maxHttpBufferSize: 32_000 })
  const rooms = new Map()

  /**
   * End the current round and save it.
   *  race:   decided from both finishes (or the lone finisher / the player who stayed)
   *  versus: `forcedWinnerSid` is the winner (reached the target, or the rival forfeited / left)
   *  coop:   `coopOutcome` is 'coop' (reached the target) or 'coop-fail' (dead end / someone left)
   */
  function settle(room, forcedWinnerSid, coopOutcome, forcedResult) {
    if (!room.active) return
    room.active = false
    clearTimeout(room.timer)
    const [pa, pb] = room.players
    const fa = room.finishes.get(pa.sid)
    const fb = room.finishes.get(pb.sid)

    let result
    if (forcedResult) result = forcedResult
    else if (room.mode === 'coop') result = coopOutcome ?? 'coop-fail'
    else if (forcedWinnerSid) result = forcedWinnerSid === pa.sid ? 'a' : 'b'
    else if (!fa && !fb) return
    else if (fa && fb) result = decideBoth({ ...fa, chain: [] }, { ...fb, chain: [] })
    else result = fa ? 'a' : 'b'

    const moves = room.turn ? room.turn.chain.length - 1 : null
    const match = {
      code: room.code,
      mode: room.mode,
      round: room.round,
      puzzle: room.puzzle,
      moves,
      players: [pa, pb].map((p, i) => {
        const f = i === 0 ? fa : fb
        return { pid: p.pid, name: p.name, finished: Boolean(f), steps: f?.steps ?? null, hints: f?.hints ?? null, ms: f?.ms ?? null }
      }),
      result,
      // Two tabs of the same browser share a player id, and co-op has no winner: saved but not counted.
      ranked: room.mode !== 'coop' && pa.pid !== pb.pid && Boolean(pa.pid) && Boolean(pb.pid),
      at: new Date(),
    }
    store.saveMatch(match).catch((e) => console.error('saveMatch failed', e.message))
  }

  function startRound(room, sockId, msg) {
    if (sockId !== room.hostSid || room.socks.size !== 2) return false
    const round = int(msg.round, 1, 1e6)
    if (round === null || round <= room.round || !validPuzzle(msg.puzzle)) return false
    clearTimeout(room.timer)
    room.round = round
    room.puzzle = { start: msg.puzzle.start, end: msg.puzzle.end, par: msg.puzzle.par }
    room.players = [...room.socks].map(([sid, v]) => ({ sid, ...v }))
    room.finishes = new Map()
    room.mode = MODES.includes(msg.mode) ? msg.mode : 'race'
    if (room.mode === 'race') room.turn = null
    else {
      const guest = room.players.find((p) => p.sid !== room.hostSid)
      room.turn = { chain: [room.puzzle.start], sid: msg.first === 'guest' ? guest.sid : room.hostSid }
    }
    room.active = true
    return true
  }

  /** Turn modes: only the player whose turn it is may move, one letter at a time, never repeating a word. */
  function recordMove(room, sockId, msg) {
    const t = room.turn
    if (!room.active || !t || t.sid !== sockId || msg.round !== room.round) return false
    const word = typeof msg.word === 'string' ? msg.word : ''
    const cur = t.chain[t.chain.length - 1]
    if (!WORD.test(word) || !oneLetterApart(word, cur) || t.chain.includes(word)) return false
    t.chain.push(word)
    t.sid = room.players.find((p) => p.sid !== sockId).sid
    if (word === room.puzzle.end) settle(room, sockId, 'coop')
    else if (room.mode === 'versus' && t.chain.length - 1 >= MAX_VERSUS_MOVES) settle(room, null, null, 'draw')
    return true
  }

  /** The sender gives up (ran out of time, or has no legal move). Co-op just fails. */
  function recordForfeit(room, sockId) {
    if (!room.active || !room.turn || !room.players.some((p) => p.sid === sockId)) return
    settle(room, room.players.find((p) => p.sid !== sockId).sid, 'coop-fail')
  }

  function recordFinish(room, sockId, msg) {
    if (!room.active || msg.round !== room.round || room.finishes.has(sockId)) return
    const steps = int(msg.steps, 1, 80)
    const hints = int(msg.hints ?? 0, 0, 80)
    const ms = int(msg.ms, 0, 3_600_000)
    if (steps === null || hints === null || ms === null) return
    room.finishes.set(sockId, { steps, hints, ms })
    if (room.finishes.size >= 2) settle(room)
    else room.timer = setTimeout(() => settle(room), graceMs + 1500)
  }

  io.on('connection', (sock) => {
    let room = null
    let windowStart = Date.now()
    let count = 0

    sock.on('join', (req, ack) => {
      if (typeof ack !== 'function') return
      if (room) return ack({ ok: false, error: 'already_joined' })
      const code = clean(req?.code, 4).toUpperCase()
      if (!CODE.test(code)) return ack({ ok: false, error: 'bad_code' })
      let r = rooms.get(code)
      if (req.create) {
        if (r && r.socks.size) return ack({ ok: false, error: 'taken' })
        r = { code, hostSid: sock.id, socks: new Map(), round: 0, puzzle: null, players: [], finishes: new Map(), mode: 'race', turn: null, active: false, timer: null }
        rooms.set(code, r)
      } else if (!r) return ack({ ok: false, error: 'not_found' })
      if (r.socks.size >= 2) return ack({ ok: false, error: 'full' })
      r.socks.set(sock.id, { pid: clean(req.pid, 64), name: clean(req.name, 16) || 'Player' })
      room = r
      sock.join(code)
      ack({ ok: true })
    })

    sock.on('m', (msg) => {
      if (!room || !msg || typeof msg !== 'object') return
      const now = Date.now()
      if (now - windowStart > 1000) {
        windowStart = now
        count = 0
      }
      if (++count > MAX_MSGS_PER_SEC) return

      if (msg.t === 'hello' && typeof msg.id === 'string') sock.data.mid = msg.id.slice(0, 64)
      else if (msg.t === 'start' && !startRound(room, sock.id, msg)) return
      else if (msg.t === 'finish') recordFinish(room, sock.id, msg)
      else if (msg.t === 'move' && !recordMove(room, sock.id, msg)) return
      else if (msg.t === 'forfeit') recordForfeit(room, sock.id)
      sock.to(room.code).emit('m', msg)
    })

    sock.on('disconnect', () => {
      if (!room) return
      const r = room
      r.socks.delete(sock.id)
      if (sock.data.mid) sock.to(r.code).emit('m', { v: 1, t: 'leave', id: sock.data.mid })
      // Leaving mid-round forfeits it to whoever is still here.
      if (r.active && r.players.some((p) => p.sid === sock.id)) {
        const other = r.players.find((p) => p.sid !== sock.id)
        if (other && r.socks.has(other.sid)) settle(r, other.sid)
        else r.active = false
      }
      if (r.socks.size === 0) {
        clearTimeout(r.timer)
        rooms.delete(r.code)
      }
    })
  })

  return {
    httpServer,
    io,
    rooms,
    close: () =>
      new Promise((resolve) => {
        for (const r of rooms.values()) clearTimeout(r.timer)
        io.close(() => resolve())
      }),
  }
}
