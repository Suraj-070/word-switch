import { useMemo } from 'react'
import { shortestPath } from '../engine/bfs'
import { diffIndex, LENGTHS } from '../engine/dict'
import { DIFFICULTIES } from '../engine/puzzles'
import { useSettings } from '../store/settings'
import { WordRow } from './WordRow'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

export function Home({ onSolo, onDuel }: { onSolo: () => void; onDuel: () => void }) {
  const { length, difficulty, solved, perfect, set } = useSettings()
  const demo = useMemo(() => shortestPath('cold', 'warm') ?? [], [])

  return (
    <div className="home">
      <div className="home-logo flex items-center gap-3">
        <img src="/icon.svg" alt="" width={44} height={44} className="rounded-xl" />
        <h1 className="font-display text-[2rem] leading-none font-extrabold tracking-tight">Word Switch</h1>
      </div>

      <section className="home-hero card flex flex-col items-center gap-4 !py-6">
        <div className="flex flex-col items-center gap-2" aria-label="Example: COLD to WARM, one letter at a time">
          {demo.map((w, i) => (
            <div key={w} className="hero-row" style={{ animationDelay: `${i * 380}ms` }}>
              <WordRow
                word={w}
                size="hero"
                variant={i === demo.length - 1 ? 'won' : 'normal'}
                changed={i > 0 && i < demo.length - 1 ? diffIndex(demo[i - 1], w) : undefined}
              />
            </div>
          ))}
        </div>
        <p className="max-w-[28ch] text-center text-[var(--ink-2)]">
          Change one letter at a time. Every step must be a real word.
        </p>
      </section>

      <div className="home-side">
      <section className="flex flex-col gap-3">
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
      </section>

      <div className="flex flex-col gap-3">
        <button className="btn btn-primary" onClick={onSolo}>
          Play solo
        </button>
        <button className="btn" onClick={onDuel}>
          Race a friend
        </button>
      </div>

      {solved > 0 && (
        <p className="mt-auto pt-2 text-center text-sm text-[var(--ink-2)]">
          {solved} solved · {perfect} perfect
        </p>
      )}
      </div>
    </div>
  )
}
