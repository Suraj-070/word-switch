/**
 * Tiny pub/sub over a named room. Two backends:
 *  - Socket.IO server (production; any device). The server also saves matches and records to MongoDB.
 *  - BroadcastChannel (no server URL set): works across tabs of one browser, for local testing.
 */
export interface Transport {
  send: (msg: unknown) => void
  onMessage: (cb: (msg: unknown) => void) => void
  close: () => void
  /** true when talking to the server, false in local two-tab mode */
  live: boolean
}

export interface Identity {
  pid: string
  name: string
}

export const SERVER_URL = ((import.meta.env.VITE_SERVER_URL as string | undefined) ?? '').replace(/\/$/, '')
export const hasRealtime = Boolean(SERVER_URL)

const JOIN_ERRORS: Record<string, (code: string) => string> = {
  not_found: (c) => `No room "${c}" found. Check the code, or ask your friend to create a new one.`,
  full: () => 'This room already has two players.',
  taken: () => 'That room code is already in use. Go back and create a new room.',
}

function local(code: string): Transport {
  const bc = new BroadcastChannel(`word-switch:${code}`)
  let cb: (m: unknown) => void = () => {}
  bc.onmessage = (e) => cb(e.data)
  return {
    live: false,
    send: (m) => bc.postMessage(m),
    onMessage: (f) => (cb = f),
    close: () => bc.close(),
  }
}

async function server(code: string, create: boolean, who: Identity): Promise<Transport> {
  const { io } = await import('socket.io-client')
  const socket = io(SERVER_URL, { transports: ['websocket'], reconnection: false, timeout: 45_000 })
  let cb: (m: unknown) => void = () => {}
  socket.on('m', (m) => cb(m))

  await new Promise<void>((resolve, reject) => {
    const fail = (msg: string) => {
      socket.close()
      reject(new Error(msg))
    }
    socket.on('connect_error', () => fail('Could not reach the game server. Check your connection and try again.'))
    socket.on('connect', () => {
      socket.emit('join', { code, create, pid: who.pid, name: who.name }, (res: { ok: boolean; error?: string }) => {
        if (res?.ok) resolve()
        else fail((JOIN_ERRORS[res?.error ?? ''] ?? (() => 'Could not join this room.'))(code))
      })
    })
  })
  // A dropped connection ends the game for this player: the server tells the rival.
  socket.on('disconnect', () => cb({ v: 1, t: 'leave', id: '' }))

  return {
    live: true,
    send: (m) => void socket.emit('m', m),
    onMessage: (f) => (cb = f),
    close: () => void socket.close(),
  }
}

export function openTransport(code: string, create: boolean, who: Identity): Promise<Transport> {
  return hasRealtime ? server(code, create, who) : Promise.resolve(local(code))
}

/** Free hosting spins servers down when idle. Poking /health on load wakes it before the player needs it. */
export function warmServer() {
  if (SERVER_URL) fetch(`${SERVER_URL}/health`, { mode: 'no-cors' }).catch(() => {})
}

/** Four consonants. No vowels means no accidental words. */
export function makeCode(): string {
  const set = 'BCDFGHJKLMNPQRSTVWXZ'
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return [...bytes].map((b) => set[b % set.length]).join('')
}
