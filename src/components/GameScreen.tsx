import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { diffIndex, neighbors } from '../engine/dict'
import { slotsFor, useGame } from '../store/game'
import { useSettings } from '../store/settings'
import { Clock } from './Clock'
import { Keyboard } from './Keyboard'
import { TurnLadder } from './TurnLadder'
import { WordRow } from './WordRow'

interface Props {
  title: string
  onExit: () => void
  /** Rival strip, countdown notice, etc. rendered under the header. */
  top?: ReactNode
  /** Ignore all input (duel countdown, round over). */
  locked?: boolean
  /** Freeze the clock at this time. */
  clockUntil?: number | null
  /** Turn-based modes: show the side-by-side ladder and only allow input on my turn. */
  turn?: { rivalName: string; coop: boolean }
  /** Overlay content (result sheet, countdown). */
  children?: ReactNode
}

export function GameScreen({ title, onExit, top, locked = false, clockUntil, turn, children }: Props) {
  const g = useGame()
  const { assist, set } = useSettings()
  const { puzzle, chain, selected, pending, status } = g
  const cur = chain[chain.length - 1] ?? ''
  const prev = chain[chain.length - 2]
  const changed = prev ? diffIndex(prev, cur) : -1
  const won = status === 'won'
  const dead = locked || won || Boolean(turn && !g.myTurn)

  const used = useMemo(() => new Set(chain), [chain])

  // Letters the keyboard enables in Assist mode.
  const enabled = useMemo(() => {
    if (!assist || !cur) return null
    const s = new Set<string>()
    for (const n of neighbors(cur)) {
      if (used.has(n)) continue
      const i = diffIndex(cur, n)
      if (selected === null || selected === i) s.add(n[i])
    }
    return s
  }, [assist, cur, used, selected])

  const eligible = useMemo(() => (pending ? slotsFor(cur, pending, used) : []), [pending, cur, used])

  // Keep the newest rung in view.
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [chain.length])

  // Toast auto-dismiss.
  useEffect(() => {
    if (!g.toast) return
    const id = setTimeout(g.clearToast, 1900)
    return () => clearTimeout(id)
  }, [g.toast, g.clearToast])

  // Physical keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || dead) return
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const k = e.key
      if (/^[a-zA-Z]$/.test(k)) g.pressLetter(k.toLowerCase())
      else if (k === 'Backspace') g.undo()
      else if (/^[1-5]$/.test(k) && Number(k) <= cur.length) g.selectSlot(Number(k) - 1)
      else if (k === 'ArrowLeft') g.selectSlot(Math.max(0, (selected ?? cur.length) - 1))
      else if (k === 'ArrowRight') g.selectSlot(Math.min(cur.length - 1, (selected ?? -1) + 1))
      else if (k === 'Escape' && selected !== null) g.selectSlot(selected)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dead, g, cur.length, selected])

  if (!puzzle) return null
  const steps = chain.length - 1
  const history = chain.slice(0, -1)

  return (
    <div className="game">
      <header className="g-header flex items-center justify-between gap-2 px-3 pt-[max(10px,env(safe-area-inset-top))] pb-1">
        <button className="btn btn-ghost !min-h-10 !px-3" onClick={onExit} aria-label="Leave game">
          ← Back
        </button>
        <h1 className="font-display text-lg font-extrabold">{title}</h1>
        <button
          className="chip"
          aria-pressed={assist}
          onClick={() => set({ assist: !assist })}
          title="Assist dims letters that can't make a word"
        >
          Assist {assist ? 'on' : 'off'}
        </button>
      </header>

      <div className="g-top">{top}</div>

      <div className="g-stats flex items-center justify-center gap-2 px-3 pb-2">
        <span className="chip">
          Steps {steps}
          {(!turn || turn.coop) && <span className="text-[var(--ink-2)]"> / par {puzzle.par}</span>}
        </span>
        <span className="chip">
          <Clock since={g.startedAt} until={clockUntil ?? g.finishedAt} />
        </span>
        {g.hintsUsed > 0 && <span className="chip">Hints {g.hintsUsed}</span>}
      </div>

      <div className="g-target flex flex-col items-center gap-1 pb-1">
        <span className="label !mb-0">Climb to</span>
        <WordRow word={puzzle.end} size="sm" variant="target" label={`Target word ${puzzle.end}`} />
      </div>

      <div ref={scroller} className="g-ladder">
        <div className="g-ladder-title">{turn ? 'Moves' : 'Your path'}</div>
        <div className="ladder">
          {turn ? (
            <TurnLadder chain={history} owners={g.owners.slice(0, history.length)} names={{ me: 'You', rival: turn.rivalName }} />
          ) : (
            history.map((w, i) => (
              <div className="rung" key={i + w}>
                <WordRow word={w} size="sm" changed={i > 0 ? diffIndex(chain[i - 1], w) : undefined} />
              </div>
            ))
          )}
        </div>
      </div>

      <div className="g-play relative flex flex-col items-center gap-2 px-3 pt-3">
        <div className="toast" role="status" data-show={Boolean(g.toast)} data-id={g.toast?.id ?? 0}>
          {g.toast?.text}
        </div>
        <div key={g.shake} className={g.shake ? 'shake' : ''}>
          <div key={chain.length} className="pop">
            <WordRow
              word={cur}
              size="lg"
              variant={won ? 'won' : 'normal'}
              changed={changed >= 0 ? changed : undefined}
              selected={selected}
              eligible={eligible}
              onTile={dead ? undefined : g.selectSlot}
              label={`Current word ${cur}`}
            />
          </div>
        </div>
        <div className="flex h-12 items-center justify-center">
          {turn && !turn.coop ? null : g.hintWord ? (
            <div className="flex items-center gap-2">
              <span className="label !mb-0">Try</span>
              <WordRow word={g.hintWord} size="xs" variant="ghost" changed={diffIndex(cur, g.hintWord)} />
            </div>
          ) : (
            <button className="btn btn-ghost !min-h-10" disabled={dead} onClick={g.hint}>
              💡 Show a step <span className="text-xs opacity-70">(counts as +1)</span>
            </button>
          )}
        </div>
      </div>

      <div className="g-kb">
        <p className="g-tip">
          Type letters on your keyboard · 1–{cur.length} pick a tile{turn ? '' : ' · Backspace undoes'}
        </p>
        <Keyboard
          enabled={dead ? new Set() : enabled}
          pending={pending}
          onKey={g.pressLetter}
          onUndo={g.undo}
          canUndo={!dead && chain.length > 1 && !turn}
        />
      </div>
      {children}
    </div>
  )
}
