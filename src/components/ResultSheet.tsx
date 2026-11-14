import { useState, type ReactNode } from 'react'
import { shortestPath } from '../engine/bfs'
import { diffIndex } from '../engine/dict'
import type { Owner } from '../store/game'
import { TurnLadder } from './TurnLadder'
import { formatTime, rate, shareText } from '../engine/scoring'
import { WordRow } from './WordRow'

interface Props {
  chain: string[]
  par: number
  hints: number
  ms: number
  /** The puzzle's target word. Needed when the player never reached it. */
  target?: string
  finished?: boolean
  heading?: string
  sub?: string
  /** Turn-based games: who made each move, shown as two side-by-side columns. */
  owners?: Owner[]
  names?: { me: string; rival: string }
  /** Rival chain, shown next to yours in duels. */
  rival?: { name: string; chain: string[] } | null
  actions: ReactNode
}

function Column({ title, words }: { title: string; words: string[] }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="label !mb-0.5">{title}</span>
      {words.map((w, i) => (
        <WordRow key={i + w} word={w} size="xs" changed={i > 0 ? diffIndex(words[i - 1], w) : undefined} />
      ))}
    </div>
  )
}

export function ResultSheet({ chain, par, hints, ms, target, finished = true, heading, sub, rival, owners, names, actions }: Props) {
  const steps = chain.length - 1
  const r = rate(steps, hints, par)
  const best = shortestPath(chain[0], target ?? chain[chain.length - 1]) ?? []
  const [copied, setCopied] = useState(false)

  const share = async () => {
    const text = shareText({ steps, par, hints, ms, stars: r.stars })
    try {
      if (navigator.share) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Round result">
      <div className="sheet">
        <div className="text-center">
          {finished && (
            <div className="text-4xl" aria-label={`${r.stars} of 3 stars`}>
              {'⭐'.repeat(r.stars)}
              <span className="opacity-20">{'⭐'.repeat(3 - r.stars)}</span>
            </div>
          )}
          <h2 className="font-display mt-1 text-3xl font-extrabold">{heading ?? r.label}</h2>
          <p className="mt-1 text-[var(--ink-2)]">
            {sub ?? `${steps} step${steps === 1 ? '' : 's'} · par ${par} · ${formatTime(ms)}`}
            {finished && hints > 0 && ` · ${hints} hint${hints > 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="card mt-4 flex max-h-[min(44dvh,440px)] justify-around gap-4 overflow-y-auto">
          {owners && names ? (
            <div className="min-w-0 flex-1">
              <TurnLadder chain={chain} owners={owners} names={names} />
            </div>
          ) : (
            <Column title={rival ? 'You' : 'Your path'} words={chain} />
          )}
          {rival && <Column title={rival.name} words={rival.chain} />}
          {(!rival || owners) && finished && steps > par ? <Column title="Shortest" words={best} /> : null}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {actions}
          {finished && (
            <button className="btn" onClick={share}>
              {copied ? 'Copied!' : 'Share result'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
