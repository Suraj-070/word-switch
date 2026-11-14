import { useCallback, useEffect, useRef } from 'react'
import { pickPuzzle } from '../engine/puzzles'
import { recordWinOnce, useGame } from '../store/game'
import { useSettings } from '../store/settings'
import { GameScreen } from './GameScreen'
import { ResultSheet } from './ResultSheet'

export function Solo({ onExit }: { onExit: () => void }) {
  const { length, difficulty } = useSettings()
  const game = useGame()
  const recorded = useRef(false)

  const next = useCallback(() => {
    recorded.current = false
    useGame.getState().start(pickPuzzle(length, difficulty, new Set(useSettings.getState().seen)))
  }, [length, difficulty])

  useEffect(next, [next])

  useEffect(() => {
    if (game.status === 'won' && game.puzzle && !recorded.current) {
      recorded.current = true
      recordWinOnce(game.puzzle, game.chain.length - 1, game.hintsUsed)
    }
  }, [game.status, game.puzzle, game.chain.length, game.hintsUsed])

  const restart = () => {
    if (game.puzzle) {
      recorded.current = true // replays don't count twice
      game.start(game.puzzle)
    }
  }

  return (
    <GameScreen title="Solo" onExit={onExit}>
      {game.status === 'won' && game.puzzle && (
        <ResultSheet
          chain={game.chain}
          par={game.puzzle.par}
          hints={game.hintsUsed}
          ms={(game.finishedAt ?? Date.now()) - game.startedAt}
          actions={
            <>
              <button className="btn btn-primary" onClick={next} autoFocus>
                Next puzzle
              </button>
              <div className="flex gap-2">
                <button className="btn flex-1" onClick={restart}>
                  Try again
                </button>
                <button className="btn flex-1" onClick={onExit}>
                  Home
                </button>
              </div>
            </>
          }
        />
      )}
    </GameScreen>
  )
}
