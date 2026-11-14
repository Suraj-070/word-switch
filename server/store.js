import { MongoClient } from 'mongodb'

/** Per-player stat increments for one finished match. */
function increments(match) {
  return match.players.map((p, i) => {
    const mine = i === 0 ? 'a' : 'b'
    const won = match.result === mine
    const draw = match.result === 'draw'
    return {
      pid: p.pid,
      name: p.name,
      inc: { played: 1, wins: won ? 1 : 0, losses: !won && !draw ? 1 : 0, draws: draw ? 1 : 0 },
    }
  })
}

const ZERO = { played: 0, wins: 0, losses: 0, draws: 0 }

/** No database: stats live in memory and vanish on restart. Used when MONGODB_URI is not set, and in tests. */
export function memoryStore() {
  const players = new Map()
  const matches = []
  return {
    kind: 'memory',
    matches,
    async saveMatch(match) {
      matches.push(match)
      if (!match.ranked) return
      for (const { pid, name, inc } of increments(match)) {
        const cur = players.get(pid) ?? { ...ZERO }
        for (const k of Object.keys(inc)) cur[k] += inc[k]
        players.set(pid, { ...cur, name })
      }
    },
    async getStats(pid) {
      const p = players.get(pid)
      return p ? { played: p.played, wins: p.wins, losses: p.losses, draws: p.draws } : { ...ZERO }
    },
    async close() {},
  }
}

/** MongoDB Atlas (or any MongoDB). Collections: `matches` (history) and `players` (running totals). */
export async function mongoStore(uri, dbName = 'wordswitch') {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 })
  await client.connect()
  return storeForDb(client.db(dbName), () => client.close())
}

/** The store logic, given any object shaped like a MongoDB `Db`. Split out so it can be tested with a fake. */
export async function storeForDb(db, closeFn = async () => {}) {
  const matches = db.collection('matches')
  const players = db.collection('players')
  await matches.createIndex({ at: -1 })
  await matches.createIndex({ 'players.pid': 1, at: -1 })

  return {
    kind: 'mongodb',
    async saveMatch(match) {
      await matches.insertOne({ ...match })
      if (!match.ranked) return
      await players.bulkWrite(
        increments(match).map(({ pid, name, inc }) => ({
          updateOne: {
            filter: { _id: pid },
            update: { $set: { name, updatedAt: match.at }, $inc: inc, $setOnInsert: { createdAt: match.at } },
            upsert: true,
          },
        })),
      )
    },
    async getStats(pid) {
      const p = await players.findOne({ _id: pid })
      return p ? { played: p.played ?? 0, wins: p.wins ?? 0, losses: p.losses ?? 0, draws: p.draws ?? 0 } : { ...ZERO }
    },
    close: closeFn,
  }
}
