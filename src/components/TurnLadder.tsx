import { diffIndex } from '../engine/dict'
import type { Owner } from '../store/game'
import { WordRow, type RowSize } from './WordRow'

interface Props {
  chain: string[]
  owners: Owner[]
  names: { me: string; rival: string }
  size?: RowSize
}

/**
 * Side-by-side view of a turn-based game. Each player has a column, and every move sits in its
 * mover's column at the height it happened, so the two points of view read like a conversation.
 */
export function TurnLadder({ chain, owners, names, size = 'mini' }: Props) {
  return (
    <div className="turn-ladder">
      <div className="tl-head me" style={{ gridRow: 1 }}>
        {names.me}
      </div>
      <div className="tl-head rival" style={{ gridRow: 1 }}>
        {names.rival}
      </div>
      {chain.map((w, i) => (
        <div key={i + w} className={`tl-row ${owners[i] ?? 'start'}`} style={{ gridRow: i + 2 }}>
          <WordRow word={w} size={size} changed={i > 0 ? diffIndex(chain[i - 1], w) : undefined} />
        </div>
      ))}
    </div>
  )
}
