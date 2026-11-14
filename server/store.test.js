import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { storeForDb } from './store.js'

/** Minimal fake of the Mongo calls the store uses, with $set / $inc / $setOnInsert upsert semantics. */
function fakeDb() {
  const data = { matches: [], players: new Map() }
  return {
    data,
    collection: (name) =>
      name === 'matches'
        ? { createIndex: async () => {}, insertOne: async (d) => void data.matches.push(d) }
        : {
            createIndex: async () => {},
            findOne: async ({ _id }) => data.players.get(_id) ?? null,
            bulkWrite: async (ops) => {
              for (const { updateOne: { filter, update, upsert } } of ops) {
                let doc = data.players.get(filter._id)
                if (!doc) {
                  assert.ok(upsert)
                  doc = { _id: filter._id, ...update.$setOnInsert }
                }
                Object.assign(doc, update.$set)
                for (const [k, v] of Object.entries(update.$inc)) doc[k] = (doc[k] ?? 0) + v
                data.players.set(filter._id, doc)
              }
            },
          },
  }
}

const match = (result, ranked = true) => ({
  code: 'ABCD', round: 1, puzzle: { start: 'cold', end: 'warm', par: 4 },
  players: [{ pid: 'p1', name: 'A' }, { pid: 'p2', name: 'B' }], result, ranked, at: new Date(),
})

describe('mongo store', () => {
  it('saves matches and accumulates player totals', async () => {
    const db = fakeDb(); const store = await storeForDb(db)
    await store.saveMatch(match('a')); await store.saveMatch(match('b')); await store.saveMatch(match('draw'))
    assert.equal(db.data.matches.length, 3)
    assert.deepEqual(await store.getStats('p1'), { played: 3, wins: 1, losses: 1, draws: 1 })
    assert.deepEqual(await store.getStats('p2'), { played: 3, wins: 1, losses: 1, draws: 1 })
    assert.ok(db.data.players.get('p1').createdAt)
  })
  it('unranked matches are kept but not counted; unknown players are zero', async () => {
    const db = fakeDb(); const store = await storeForDb(db)
    await store.saveMatch(match('a', false))
    assert.equal(db.data.matches.length, 1)
    assert.deepEqual(await store.getStats('p1'), { played: 0, wins: 0, losses: 0, draws: 0 })
  })
})
