import { memo } from 'react'

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

interface Props {
  /** Letters that can be played right now. null = all letters are enabled (Pro mode). */
  enabled: Set<string> | null
  pending: string | null
  onKey: (ch: string) => void
  onUndo: () => void
  canUndo: boolean
}

export const Keyboard = memo(function Keyboard({ enabled, pending, onKey, onUndo, canUndo }: Props) {
  return (
    <div className="kb" role="group" aria-label="Keyboard">
      {ROWS.map((row, r) => (
        <div className="kb-row" key={row}>
          {[...row].map((ch) => (
            <button
              key={ch}
              type="button"
              className="key"
              disabled={enabled !== null && !enabled.has(ch)}
              data-pending={pending === ch}
              onClick={() => onKey(ch)}
            >
              {ch}
            </button>
          ))}
          {r === 2 && (
            <button
              type="button"
              className="key"
              style={{ flex: '1.5 1 0', maxWidth: 74 }}
              disabled={!canUndo}
              onClick={onUndo}
              aria-label="Undo last move"
            >
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  )
})
