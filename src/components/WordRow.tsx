import { memo, type CSSProperties } from 'react'

export type RowSize = 'lg' | 'sm' | 'xs' | 'mini' | 'hero'
export type RowVariant = 'normal' | 'target' | 'ghost' | 'won'

interface Props {
  word: string
  size?: RowSize
  variant?: RowVariant
  /** Slot that just changed (highlighted). */
  changed?: number
  selected?: number | null
  /** Slots that pulse because a pending letter can go there. */
  eligible?: number[]
  onTile?: (i: number) => void
  className?: string
  label?: string
}

function stateFor(i: number, p: Props): string {
  if (p.variant === 'target') return 'target'
  if (p.variant === 'won') return 'won'
  if (p.variant === 'ghost') return p.changed === i ? 'ghost-changed' : 'ghost'
  if (p.selected === i) return 'selected'
  if (p.eligible?.includes(i)) return 'eligible'
  if (p.changed === i) return 'changed'
  return 'idle'
}

export const WordRow = memo(function WordRow(p: Props) {
  const { word, size = 'lg', onTile, className = '', label } = p
  return (
    <div
      className={`word-row row-${size} ${className}`}
      style={{ '--n': word.length } as CSSProperties}
      role="group"
      aria-label={label ?? word.toUpperCase()}
    >
      {[...word].map((ch, i) =>
        onTile ? (
          <button
            key={i}
            type="button"
            className="tile"
            data-state={stateFor(i, p)}
            aria-label={`Letter ${i + 1}, ${ch.toUpperCase()}`}
            aria-pressed={p.selected === i}
            onClick={() => onTile(i)}
          >
            {ch}
          </button>
        ) : (
          <div key={i} className="tile" data-state={stateFor(i, p)} aria-hidden>
            {ch}
          </div>
        ),
      )}
    </div>
  )
})
