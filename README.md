# Word Switch

Change one letter at a time to climb from one word to another. Solo mode plus a 2-player race with a 4-letter room code.

## Run
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine + duel rules
(cd server && npm test)  # server: rooms, matches, stats
npm run build
```

## Online duels (Node + Socket.IO + MongoDB)
Live rooms need a server, because a database alone can't push updates to browsers. The `server/` folder is a small
Node service that relays the two players' moves, decides and saves each match, and keeps win/loss records in MongoDB.

**Run it locally**
```bash
cd server && npm install
cp .env.example .env          # add MONGODB_URI, or leave it empty to keep stats in memory
npm run dev                   # http://localhost:3001  (GET /health)
```
Then in the app folder: `cp .env.example .env` (it points at `http://localhost:3001`) and `npm run dev`.

**Deploy**
1. MongoDB Atlas: create a free cluster, add a database user, allow network access, copy the connection string.
2. Render: new Web Service from this repo, root directory `server`, build `npm install`, start `npm start`.
   Environment: `MONGODB_URI`, `CLIENT_ORIGINS` (your Vercel URL, comma-separated for several), optional `MONGODB_DB`.
   Health check path: `/health`.
3. Vercel: add `VITE_SERVER_URL` = your Render URL, then redeploy.

The free Render plan sleeps when idle, so the app pings `/health` as soon as it loads, and the lobby shows a
"waking up the server" note if connecting takes a while.

Without `VITE_SERVER_URL`, duels run in local test mode (two tabs of the same browser).

**What MongoDB stores**
- `matches`: code, puzzle, both players' name, steps, hints, time, result, date.
- `players`: anonymous browser id, name, played / wins / losses / draws. No accounts or emails.

## Game modes (online rooms)
The host picks the mode in the lobby.
- **Race**: same puzzle at the same time. First to the target wins; the other player gets 15 seconds to beat it with fewer steps.
- **Versus**: one shared word, players alternate changing one letter. Whoever lands on the target wins, so avoid handing your rival a word one step away.
  45 seconds per turn. Run out of time, or have no legal move, and you lose. 30 moves with no winner is a draw. The host starts odd rounds, the guest even ones.
- **Co-op**: one shared chain, players alternate. Reach the target together; rated against par. Hints are allowed on your turn. A dead end ends the round.

Versus and Race count toward the online win/loss record; Co-op is saved but not counted.
Turn-based modes show each player's moves side by side in two colour-coded columns.

## Words and puzzles
`npm run words -- <words.txt> <wordnet-lemmas.txt> src/data` rebuilds `words.json` and `puzzles.json`
(WordNet-filtered, profanity-blocked, every puzzle verified by BFS).

## Controls
Tap a tile then a letter, or just tap a letter (if it fits one slot it plays; if several, tap the slot).
Keyboard: A-Z play, 1-5 / arrows pick a slot, Backspace undoes.
