import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { io as connect } from 'socket.io-client'
import { createApp } from './app.js'
import { memoryStore } from './store.js'

let app, store, url
const clients = []

before(async () => {
  store = memoryStore()
  app = createApp({ store, graceMs: 300 })
  await new Promise((r) => app.httpServer.listen(0, r))
  url = `http://127.0.0.1:${app.httpServer.address().port}`
})
after(async () => {
  clients.forEach((c) => c.close())
  await app.close()
})

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PUZZLE = { start: 'cold', end: 'warm', par: 4 }

async function client() {
  const c = connect(url, { transports: ['websocket'], forceNew: true })
  clients.push(c)
  await new Promise((r) => c.on('connect', r))
  c.msgs = []
  c.on('m', (m) => c.msgs.push(m))
  c.join = (code, create, pid, name = 'P') => new Promise((r) => c.emit('join', { code, create, pid, name }, r))
  return c
}
const finish = (c, round, steps, ms, hints = 0) => c.emit('m', { v: 1, t: 'finish', id: 'x', round, steps, hints, ms, chain: [] })
const start = (c, round) => c.emit('m', { v: 1, t: 'start', id: 'h', round, puzzle: PUZZLE, startIn: 3500 })

describe('http', () => {
  it('health and empty stats', async () => {
    assert.equal(await (await fetch(`${url}/health`)).text(), 'ok')
    assert.deepEqual(await (await fetch(`${url}/api/stats/nobody`)).json(), { played: 0, wins: 0, losses: 0, draws: 0 })
  })
})

describe('rooms', () => {
  it('create, join, relay, reject full / missing / duplicate', async () => {
    const a = await client(), b = await client(), c = await client(), d = await client()
    assert.deepEqual(await a.join('ROOM', true, 'pa'), { ok: true })
    assert.deepEqual(await d.join('ROOM', true, 'pd'), { ok: false, error: 'taken' })
    assert.deepEqual(await b.join('ROOM', false, 'pb'), { ok: true })
    assert.deepEqual(await c.join('ROOM', false, 'pc'), { ok: false, error: 'full' })
    assert.deepEqual(await (await client()).join('NOPE', false, 'pz'), { ok: false, error: 'not_found' })
    assert.deepEqual(await (await client()).join('x1', false, 'pz'), { ok: false, error: 'bad_code' })

    a.emit('m', { v: 1, t: 'hello', id: 'A', name: 'Alice' })
    await wait(80)
    assert.equal(b.msgs.at(-1).name, 'Alice')
    assert.equal(a.msgs.length, 0, 'sender does not get its own message')
  })

  it('only the host can start, and bad puzzles are dropped', async () => {
    const a = await client(), b = await client()
    await a.join('HOST', true, 'a1'); await b.join('HOST', false, 'b1')
    b.emit('m', { v: 1, t: 'start', id: 'b', round: 1, puzzle: PUZZLE })
    a.emit('m', { v: 1, t: 'start', id: 'a', round: 1, puzzle: { start: 'x', end: 'y', par: 1 } })
    await wait(80)
    assert.equal(a.msgs.length + b.msgs.length, 0)
  })
})

describe('matches', () => {
  it('first finisher wins, saved with stats', async () => {
    const a = await client(), b = await client()
    await a.join('WINN', true, 'pa1', 'Alice'); await b.join('WINN', false, 'pb1', 'Bob')
    start(a, 1); await wait(50)
    finish(a, 1, 5, 20000); finish(b, 1, 5, 30000); await wait(100)
    const m = store.matches.at(-1)
    assert.equal(m.result, 'a')
    assert.equal(m.ranked, true)
    assert.deepEqual(m.players.map((p) => p.name), ['Alice', 'Bob'])
    assert.deepEqual(await store.getStats('pa1'), { played: 1, wins: 1, losses: 0, draws: 0 })
    assert.deepEqual(await store.getStats('pb1'), { played: 1, wins: 0, losses: 1, draws: 0 })
  })

  it('second finisher inside the window with fewer steps wins', async () => {
    const a = await client(), b = await client()
    await a.join('FEWR', true, 'pa2'); await b.join('FEWR', false, 'pb2')
    start(a, 1); await wait(50)
    finish(a, 1, 8, 20000); finish(b, 1, 5, 25000); await wait(100)
    assert.equal(store.matches.at(-1).result, 'b')
  })

  it('a lone finisher wins when the grace window runs out', async () => {
    const a = await client(), b = await client()
    await a.join('LONE', true, 'pa3'); await b.join('LONE', false, 'pb3')
    start(a, 1); await wait(50)
    const before = store.matches.length
    finish(b, 1, 6, 15000)
    await wait(100); assert.equal(store.matches.length, before, 'not settled yet')
    await wait(1800)
    assert.equal(store.matches.at(-1).result, 'b')
  })

  it('leaving mid-round forfeits, and the rival is told right away', async () => {
    const a = await client(), b = await client()
    await a.join('QUIT', true, 'pa4'); await b.join('QUIT', false, 'pb4')
    a.emit('m', { v: 1, t: 'hello', id: 'A4' }); b.emit('m', { v: 1, t: 'hello', id: 'B4' })
    start(a, 1); await wait(50)
    b.close(); await wait(150)
    assert.equal(a.msgs.find((m) => m.t === 'leave')?.id, 'B4')
    assert.equal(store.matches.at(-1).result, 'a')
    assert.deepEqual(await store.getStats('pb4'), { played: 1, wins: 0, losses: 1, draws: 0 })
  })

  it('same player id on both sides is saved but not counted', async () => {
    const a = await client(), b = await client()
    await a.join('SELF', true, 'same'); await b.join('SELF', false, 'same')
    start(a, 1); await wait(50)
    finish(a, 1, 5, 20000); finish(b, 1, 5, 30000); await wait(100)
    assert.equal(store.matches.at(-1).ranked, false)
    assert.deepEqual(await store.getStats('same'), { played: 0, wins: 0, losses: 0, draws: 0 })
  })

  it('rematch rounds work and stale or duplicate finishes are ignored', async () => {
    const a = await client(), b = await client()
    await a.join('REMA', true, 'pa6'); await b.join('REMA', false, 'pb6')
    start(a, 1); await wait(50)
    finish(a, 1, 5, 20000); finish(a, 1, 1, 1); finish(b, 1, 5, 30000); await wait(100)
    const n = store.matches.length
    finish(a, 1, 5, 1); await wait(60)
    assert.equal(store.matches.length, n, 'finish after the round ended does nothing')
    start(a, 1); await wait(50)
    start(a, 2); await wait(50)
    finish(b, 2, 4, 10000); finish(a, 2, 4, 12000); await wait(100)
    assert.equal(store.matches.length, n + 1)
    assert.equal(store.matches.at(-1).result, 'b')
  })
})

describe('turn modes', () => {
  const PATH = ['wold', 'word', 'ward', 'warm'] // cold -> warm
  const startTurns = (c, mode, first = 'host', round = 1) =>
    c.emit('m', { v: 1, t: 'start', id: 'h', round, puzzle: PUZZLE, startIn: 3500, mode, first })
  const move = (c, word, round = 1) => c.emit('m', { v: 1, t: 'move', id: 'x', round, word })

  it('only the player whose turn it is can move, and bad moves are dropped', async () => {
    const a = await client(), b = await client()
    await a.join('TURN', true, 'pa7'); await b.join('TURN', false, 'pb7')
    startTurns(a, 'versus', 'host'); await wait(50)
    b.msgs.length = 0; a.msgs.length = 0
    move(b, 'wold'); await wait(60)                 // not b's turn
    assert.equal(a.msgs.length, 0)
    move(a, 'warm'); move(a, 'cold'); move(a, 'colds'); await wait(60) // too far / same word / wrong length
    assert.equal(b.msgs.length, 0)
    move(a, 'wold'); await wait(60)                 // fine
    assert.equal(b.msgs.at(-1).word, 'wold')
    move(a, 'word'); await wait(60)                 // a again: not allowed
    assert.equal(b.msgs.length, 1)
    move(b, 'cold'); await wait(60)                 // repeats the start word
    assert.equal(b.msgs.length, 1)
  })

  it('versus: landing on the target wins and counts', async () => {
    const a = await client(), b = await client()
    await a.join('VERS', true, 'pa8', 'Ann'); await b.join('VERS', false, 'pb8', 'Ben')
    startTurns(a, 'versus', 'host'); await wait(50)
    move(a, PATH[0]); await wait(30); move(b, PATH[1]); await wait(30); move(a, PATH[2]); await wait(30); move(b, PATH[3]); await wait(100)
    const m = store.matches.at(-1)
    assert.equal(m.mode, 'versus'); assert.equal(m.result, 'b'); assert.equal(m.moves, 4); assert.equal(m.ranked, true)
    assert.deepEqual(await store.getStats('pb8'), { played: 1, wins: 1, losses: 0, draws: 0 })
    assert.deepEqual(await store.getStats('pa8'), { played: 1, wins: 0, losses: 1, draws: 0 })
  })

  it('versus: a forfeit gives the win to the rival; guest can go first on a rematch', async () => {
    const a = await client(), b = await client()
    await a.join('FORF', true, 'pa9'); await b.join('FORF', false, 'pb9')
    startTurns(a, 'versus', 'guest'); await wait(50)
    move(a, PATH[0]); await wait(40)                // host moving first is rejected
    b.msgs.length = 0
    move(b, PATH[0]); await wait(40)
    assert.equal(a.msgs.at(-1).word, PATH[0])
    a.emit('m', { v: 1, t: 'forfeit', id: 'h', round: 1, reason: 'timeout' }); await wait(100)
    assert.equal(store.matches.at(-1).result, 'b')
  })

  it('co-op: reaching the target is saved but nobody gains a win or loss', async () => {
    const a = await client(), b = await client()
    await a.join('COOP', true, 'pa10'); await b.join('COOP', false, 'pb10')
    startTurns(a, 'coop', 'host'); await wait(50)
    move(a, PATH[0]); await wait(30); move(b, PATH[1]); await wait(30); move(a, PATH[2]); await wait(30); move(b, PATH[3]); await wait(100)
    const m = store.matches.at(-1)
    assert.equal(m.mode, 'coop'); assert.equal(m.result, 'coop'); assert.equal(m.ranked, false)
    assert.deepEqual(await store.getStats('pa10'), { played: 0, wins: 0, losses: 0, draws: 0 })
  })

  it('co-op: a dead end fails the round, and so does someone leaving', async () => {
    const a = await client(), b = await client()
    await a.join('DEAD', true, 'pa11'); await b.join('DEAD', false, 'pb11')
    startTurns(a, 'coop', 'host'); await wait(50)
    a.emit('m', { v: 1, t: 'forfeit', id: 'h', round: 1, reason: 'nomoves' }); await wait(100)
    assert.equal(store.matches.at(-1).result, 'coop-fail')
    startTurns(a, 'coop', 'guest', 2); await wait(50)
    const n = store.matches.length
    b.close(); await wait(150)
    assert.equal(store.matches.length, n + 1); assert.equal(store.matches.at(-1).result, 'coop-fail')
  })
})

describe('versus move limit', () => {
  it('30 moves without reaching the target is a draw', async () => {
    const a = await client(), b = await client()
    await a.join('LIMI', true, 'pa12'); await b.join('LIMI', false, 'pb12')
    a.emit('m', { v: 1, t: 'start', id: 'h', round: 1, puzzle: PUZZLE, startIn: 3500, mode: 'versus', first: 'host' }); await wait(50)
    let word = ['c', 'o', 'l', 'd']
    for (let i = 0; i < 30; i++) {
      word = [...word]; word[i % 4] = String.fromCharCode(97 + ((i + 5) % 26))
      ;(i % 2 === 0 ? a : b).emit('m', { v: 1, t: 'move', id: 'x', round: 1, word: word.join('') })
      await wait(15)
    }
    await wait(100)
    assert.equal(store.matches.at(-1).result, 'draw')
    assert.deepEqual(await store.getStats('pa12'), { played: 1, wins: 0, losses: 0, draws: 1 })
  })
})
