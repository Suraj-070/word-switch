import { useEffect, useState } from 'react'
import { DIFFICULTIES } from '../engine/puzzles'
import { LENGTHS } from '../engine/dict'
import { useGame } from '../store/game'
import { useSettings } from '../store/settings'
import { makeCode } from '../net/transport'
import { fetchRecord, type Record as Rec } from '../net/stats'
import { MODES, useRoom, type Mode } from '../net/useRoom'
import { MAX_VERSUS_MOVES, TURN_MS } from '../net/rules'
import { GameScreen } from './GameScreen'
import { ResultSheet } from './ResultSheet'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/* ---------- Menu: create or join ---------- */
function Menu({ initialCode, onExit, onGo }: { initialCode: string | null; onExit: () => void; onGo: (code: string, host: boolean, name: string) => void }) {
  const { name, pid, set } = useSettings()
  const [code, setCode] = useState(initialCode ?? '')
  const [rec, setRec] = useState<Rec | null>(null)
  useEffect(() => {
    fetchRecord(pid).then(setRec)
  }, [pid])
  const ready = /^[A-Za-z]{4}$/.test(code)
  const nm = name.trim() || 'Player'

  return (
    <div className="panel-page">
      <button className="btn btn-ghost !min-h-10 !px-2 self-start" onClick={onExit}>
        ← Back
      </button>
      <h1 className="font-display text-[2rem] leading-none font-extrabold tracking-tight">Race a friend</h1>
      <p className="-mt-3 text-[var(--ink-2)]">Same puzzle, same start. First to the target wins.</p>
      {rec && rec.played > 0 && (
        <p className="chip self-start" aria-label="Your online record">
          {rec.wins}W · {rec.losses}L{rec.draws > 0 ? ` · ${rec.draws}D` : ''}
        </p>
      )}

      <label className="block">
        <span className="label">Your name</span>
        <input
          className="text-input"
          value={name}
          maxLength={16}
          placeholder="Player"
          autoComplete="nickname"
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>

      <button className="btn btn-primary" onClick={() => onGo(makeCode(), true, nm)}>
        Create a room
      </button>

      <div className="flex items-center gap-3 text-sm text-[var(--ink-2)]">
        <span className="h-0.5 flex-1 rounded bg-[var(--line)]" />
        or join one
        <span className="h-0.5 flex-1 rounded bg-[var(--line)]" />
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (ready) onGo(code.toUpperCase(), false, nm)
        }}
      >
        <input
          className="code-input"
          value={code}
          maxLength={4}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="CODE"
          aria-label="Room code"
          onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())}
        />
        <button className="btn" type="submit" disabled={!ready}>
          Join room
        </button>
      </form>
    </div>
  )
}

/* ---------- Small helpers ---------- */
function Countdown({ startAt }: { startAt: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])
  const n = Math.ceil((startAt - now) / 1000)
  if (n <= 0) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-10 grid place-items-center bg-[color-mix(in_srgb,var(--bg)_72%,transparent)]" aria-live="assertive">
      <div className="text-center">
        <div className="font-display text-[8rem] leading-none font-extrabold text-[var(--rung)]">{Math.min(n, 3)}</div>
        <div className="font-semibold text-[var(--ink-2)]">Get ready</div>
      </div>
    </div>
  )
}

const MODE_LABEL: Record<Mode, string> = { race: 'Race', versus: 'Versus', coop: 'Co-op' }
const MODE_HELP: Record<Mode, string> = {
  race: 'Same puzzle at the same time. First to the target wins.',
  versus: "Take turns changing one letter of a shared word. Land on the target to win, so don't set your rival up.",
  coop: 'Take turns building one chain together. Reach the target in as few steps as you can.',
}

function TurnBanner({ mode, myTurn, rivalName, since, over, moves }: { mode: Mode; myTurn: boolean; rivalName: string; since: number; over: boolean; moves: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (mode !== 'versus' || over) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [mode, over])
  const left = Math.min(TURN_MS, Math.max(0, since + TURN_MS - now)) / 1000
  const secs = Math.ceil(left)
  return (
    <div className="px-3 pb-2">
      <div className={`turn-banner ${myTurn ? 'mine' : 'theirs'}`} role="status" aria-live="polite">
        <div>
          <div>{over ? 'Round over' : myTurn ? 'Your turn' : `${rivalName}'s turn`}</div>
          <div className="sub">{mode === 'versus' ? `Land on the target to win. Move ${moves} of ${MAX_VERSUS_MOVES}.` : 'Reach the target together.'}</div>
        </div>
        {mode === 'versus' && !over && (
          <span className={`tabular-nums text-lg ${secs <= 10 ? 'urgent' : ''}`} aria-label={`${secs} seconds left`}>
            0:{String(secs).padStart(2, '0')}
          </span>
        )}
      </div>
    </div>
  )
}

function SecondsLeft({ until }: { until: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  return <span className="tabular-nums">{Math.max(0, Math.ceil((until - now) / 1000))}s</span>
}

function Connecting({ text }: { text: string }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 4000)
    return () => clearTimeout(id)
  }, [])
  return (
    <div className="grid h-dvh place-items-center px-6 text-center text-[var(--ink-2)]">
      <div>
        <p className="font-semibold">{text}</p>
        {slow && <p className="mt-2 text-sm">Waking up the game server. This can take up to a minute the first time.</p>}
      </div>
    </div>
  )
}

/* ---------- Room ---------- */
function Room({ code, isHost, name, onExit }: { code: string; isHost: boolean; name: string; onExit: () => void }) {
  const { state: s, startRound, myName } = useRoom(code, isHost, name)
  const { length, difficulty, set } = useSettings()
  const game = useGame()
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState<Mode>('race')

  const link = `${location.origin}${location.pathname}?room=${code}`
  const invite = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Word Switch', text: `Race me on Word Switch! Room ${code}`, url: link })
      else {
        await navigator.clipboard.writeText(link)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }
    } catch {
      /* cancelled */
    }
  }

  if (s.phase === 'connecting') return <Connecting text={isHost ? 'Opening room…' : `Joining ${code}…`} />

  if (s.phase === 'closed')
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-5xl">🪜</div>
        <h1 className="font-display text-2xl font-extrabold">Can't open this room</h1>
        <p className="text-[var(--ink-2)]">{s.error ?? 'Something went wrong.'}</p>
        <button className="btn btn-primary" onClick={onExit}>
          Back to menu
        </button>
      </div>
    )

  if (s.phase === 'lobby' || !s.puzzle)
    return (
      <div className="panel-page">
        <button className="btn btn-ghost !min-h-10 !px-2 self-start" onClick={onExit}>
          ← Leave room
        </button>

        <section className="card flex flex-col items-center gap-3 !py-6">
          <span className="label !mb-0">Room code</span>
          <div className="font-display text-[3.2rem] leading-[1.15] font-extrabold tracking-[0.18em] pl-[0.18em]" aria-label={`Room code ${code.split('').join(' ')}`}>
            {code}
          </div>
          {isHost && (
            <button className="btn" onClick={invite}>
              {copied ? 'Link copied!' : 'Invite a friend'}
            </button>
          )}
        </section>

        {!s.live && (
          <p className="rounded-xl bg-[var(--surface-2)] p-3 text-sm text-[var(--ink-2)]">
            Local test mode: no server keys are set, so rooms only work between tabs of this browser. Open this page in a
            second tab and join with the code.
          </p>
        )}

        <section className="card flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-bold">{myName}</span>
            <span className="chip !border-[var(--ok)] text-[var(--ok)]">Ready</span>
          </div>
          <div className="flex items-center justify-between">
            <span className={s.rival ? 'font-bold' : 'text-[var(--ink-2)]'}>{s.rival?.name ?? (isHost ? 'Waiting for a friend…' : 'Finding the host…')}</span>
            {s.rival && <span className="chip !border-[var(--ok)] text-[var(--ok)]">Ready</span>}
          </div>
        </section>

        {isHost ? (
          <>
            <div>
              <div className="label">Game</div>
              <div className="seg" role="group" aria-label="Game mode">
                {MODES.map((m) => (
                  <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
                    {MODE_LABEL[m]}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-sm text-[var(--ink-2)]">{MODE_HELP[mode]}</p>
            </div>
            <div>
              <div className="label">Letters</div>
              <div className="seg" role="group" aria-label="Word length">
                {LENGTHS.map((n) => (
                  <button key={n} aria-pressed={length === n} onClick={() => set({ length: n })}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label">Difficulty</div>
              <div className="seg" role="group" aria-label="Difficulty">
                {DIFFICULTIES.map((d) => (
                  <button key={d} aria-pressed={difficulty === d} onClick={() => set({ difficulty: d })}>
                    {cap(d)}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-primary cta-sticky mt-auto" disabled={!s.rival} onClick={() => startRound(length, difficulty, mode)}>
              {s.rival ? (mode === 'race' ? 'Start race' : mode === 'versus' ? 'Start versus' : 'Start co-op') : 'Waiting for a friend…'}
            </button>
          </>
        ) : (
          <p className="mt-auto text-center text-[var(--ink-2)]">Waiting for {s.rival?.name ?? 'the host'} to start…</p>
        )}
      </div>
    )

  /* ---------- Race ---------- */
  const over = s.phase === 'over'
  const locked = s.phase !== 'playing'
  const rivalName = s.rival?.name ?? 'Rival'
  const pct = s.rivalFinish ? 100 : Math.round(Math.max(0, Math.min(1, 1 - (s.rivalDist ?? s.puzzle.par) / s.puzzle.par)) * 100)
  const myScore = s.myFinish ? s.myFinish.steps + s.myFinish.hints : null
  const rivalScore = s.rivalFinish ? s.rivalFinish.steps + s.rivalFinish.hints : null

  const turnMode = s.mode !== 'race'
  const raceTop = (
    <div className="px-3 pb-2">
      <div className="card !rounded-2xl !p-3">
        <div className="mb-2 flex items-center justify-between text-sm font-bold">
          <span>{rivalName}</span>
          <span className="text-[var(--ink-2)]">{s.rivalFinish ? `Finished in ${rivalScore}` : `${s.rivalSteps} steps`}</span>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${rivalName} progress`}>
          <i style={{ width: `${pct}%` }} />
        </div>
        {s.graceEndsAt && !over && (
          <p className="mt-2 text-sm font-semibold" role="status">
            {s.rivalFinish && !s.myFinish && (
              <>
                {rivalName} got there in {rivalScore}. Finish in fewer than {rivalScore} within <SecondsLeft until={s.graceEndsAt} /> to win.
              </>
            )}
            {s.myFinish && !s.rivalFinish && (
              <>
                You're in with {myScore}! {rivalName} has <SecondsLeft until={s.graceEndsAt} /> to beat it.
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )

  const top = turnMode ? (
    <TurnBanner mode={s.mode} myTurn={game.myTurn} rivalName={rivalName} since={game.turnSince} over={over} moves={game.chain.length - 1} />
  ) : (
    raceTop
  )

  const myChain = s.myFinish?.chain ?? game.chain
  const w = s.result?.winner
  const heading =
    w === 'me' ? 'You win!' : w === 'rival' ? `${rivalName} wins` : w === 'team' ? 'Team win!' : w === 'fail' ? 'Dead end' : 'Draw'

  return (
    <GameScreen
      title={`Room ${code}`}
      onExit={onExit}
      top={top}
      locked={locked}
      clockUntil={s.myFinish ? game.finishedAt : over ? Date.now() : null}
      turn={turnMode ? { rivalName, coop: s.mode === 'coop' } : undefined}
    >
      {s.phase === 'countdown' && <Countdown startAt={s.startAt} />}
      {over && s.result && (
        <ResultSheet
          chain={turnMode ? game.chain : myChain}
          target={s.puzzle.end}
          finished={turnMode ? w === 'team' : Boolean(s.myFinish)}
          par={s.puzzle.par}
          hints={turnMode ? game.hintsUsed : (s.myFinish?.hints ?? game.hintsUsed)}
          ms={turnMode ? Math.max(0, (game.finishedAt ?? Date.now()) - game.startedAt) : (s.myFinish?.ms ?? 0)}
          heading={heading}
          sub={w === 'team' ? `${s.result.reason} Par was ${s.puzzle.par}.` : s.result.reason}
          owners={turnMode ? game.owners : undefined}
          names={turnMode ? { me: 'You', rival: rivalName } : undefined}
          rival={!turnMode && s.rivalFinish ? { name: rivalName, chain: s.rivalFinish.chain } : null}
          actions={
            <>
              {isHost ? (
                <button className="btn btn-primary" disabled={!s.rival} onClick={() => startRound(length, difficulty, mode)} autoFocus>
                  {s.rival ? 'Rematch' : 'Rival left'}
                </button>
              ) : (
                <p className="py-3 text-center text-[var(--ink-2)]">Waiting for the host to start a rematch…</p>
              )}
              <button className="btn" onClick={onExit}>
                Leave room
              </button>
            </>
          }
        />
      )}
    </GameScreen>
  )
}

/* ---------- Entry ---------- */
export function Duel({ initialCode, onExit }: { initialCode: string | null; onExit: () => void }) {
  const [room, setRoom] = useState<{ code: string; host: boolean; name: string } | null>(null)
  if (!room) return <Menu initialCode={initialCode} onExit={onExit} onGo={(code, host, name) => setRoom({ code, host, name })} />
  return <Room key={room.code} code={room.code} isHost={room.host} name={room.name} onExit={() => (initialCode ? onExit() : setRoom(null))} />
}
