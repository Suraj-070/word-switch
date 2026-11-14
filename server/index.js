import { createApp } from './app.js'
import { memoryStore, mongoStore } from './store.js'

const PORT = Number(process.env.PORT) || 3001
const origins = (process.env.CLIENT_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

let store
if (process.env.MONGODB_URI) {
  store = await mongoStore(process.env.MONGODB_URI, process.env.MONGODB_DB || 'wordswitch')
  console.log('MongoDB connected')
} else {
  store = memoryStore()
  console.warn('MONGODB_URI not set: match history and records are kept in memory only')
}

const { httpServer, close } = createApp({ store, origins })
httpServer.listen(PORT, () => console.log(`Word Switch server on :${PORT} (${store.kind})`))

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    await close()
    await store.close()
    process.exit(0)
  })
}
