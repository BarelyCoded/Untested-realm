// Deck-vs-deck harness: plays deck A against deck B with the same procedural bot on both seats.
//
//   npm run deckmatch -- testing/decks.json PF_TECH FIRE_NECRO 300 testing/results.jsonl [seed]
//
// Deck A alternates seats and who goes first. One JSON line per game is appended to the output file
// (result, turns, final life, illegal-action fallbacks, and what each side cast / activated / fetched
// from its collection). Games that pass turn 80 are recorded as draws.
import { readFileSync, appendFileSync } from 'node:fs'
import { createGame, applyAction, avatarOf, type GameState, type PlayerId, type Action, type DeckList } from '../packages/shared/src'
import { botAction, botNeedsToAct } from '../packages/client/src/bot'
const [file, A, B, nStr, out, seedStr] = process.argv.slice(2)
const decks: Record<string, DeckList> = JSON.parse(readFileSync(file, 'utf8'))
const N = Number(nStr); const MAXTURN = 80; const ACT_CAP = 400; const BASE = Number(seedStr ?? 20261109)
const inc = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1 }
const srcName = (g: GameState, id: string): string => {
  const o: any = (g as any).units?.[id] ?? (g as any).artifacts?.[id] ?? (g as any).sites?.[id]
  return (o?.cardId && g.cards[o.cardId]?.name) || o?.name || '?'
}
for (let i = 0; i < N; i++) {
  const aSeat = (i % 2) as PlayerId                 // A alternates seats
  const first = (Math.floor(i / 2) % 2) as PlayerId // and who goes first, independently
  const pair: [DeckList, DeckList] = aSeat === 0 ? [decks[A], decks[B]] : [decks[B], decks[A]]
  const seed = (BASE + i * 7919) >>> 0
  const g: GameState = createGame(pair, ['P0', 'P1'], seed, first)
  const fb = [0, 0]; const casts: Record<string, number>[] = [{}, {}]; const coll: Record<string, number>[] = [{}, {}]; const acts: Record<string, number>[] = [{}, {}]
  let lastTurn = -1, turnActs = 0, capHits = 0; const t0 = Date.now(); let crashed = ''
  try {
    while (g.phase !== 'over' && g.turn <= MAXTURN) {
      if (g.turn !== lastTurn) { lastTurn = g.turn; turnActs = 0 }
      const seat: PlayerId | null = botNeedsToAct(g, 0) ? 0 : botNeedsToAct(g, 1) ? 1 : null
      if (seat === null) { if (!applyAction(g, g.activePlayer, { t: 'endTurn' }).ok) break; continue }
      if (++turnActs > ACT_CAP) { capHits++; applyAction(g, seat, { t: 'endTurn' }); turnActs = 0; continue }
      let action: Action
      try { action = botAction(g, seat) } catch { fb[seat]++; action = { t: 'endTurn' } }
      if (action.t === 'castSpell') { const nm = g.cards[action.cardId]?.name; if (nm) inc(casts[seat], nm) }
      if (action.t === 'activate') inc(acts[seat], srcName(g, action.sourceId) + ':' + action.ability)
      if (action.t === 'prompt' && typeof action.choice === 'string' && g.prompts[0]?.kind === 'nameCard' && (g.prompts[0] as any).data?.fromCollection) inc(coll[seat], action.choice)
      const res = applyAction(g, seat, action)
      if (!res.ok) {
        fb[seat]++
        const f: Action = g.prompts[0]?.player === seat ? { t: 'prompt', promptId: g.prompts[0].id, choice: null } : g.phase === 'mulligan' ? { t: 'keepHand' } : { t: 'endTurn' }
        if (!applyAction(g, seat, f).ok) { applyAction(g, seat, { t: 'concede' }); break }
      }
    }
  } catch (e: any) { crashed = String(e?.message ?? e).slice(0, 200) }
  const w = g.phase === 'over' ? g.winner : null
  const life = (p: PlayerId) => { try { return avatarOf(g, p).life ?? 0 } catch { return null } }
  const rec = { A, B, i, seed, aSeat, aFirst: first === aSeat, result: crashed ? 'crash' : w === null || w === undefined ? 'draw' : w === aSeat ? 'A' : 'B', turns: g.turn,
    lifeA: life(aSeat), lifeB: life((1 - aSeat) as PlayerId), fbA: fb[aSeat], fbB: fb[1 - aSeat], capHits, secs: +((Date.now() - t0) / 1000).toFixed(1),
    collA: coll[aSeat], collB: coll[1 - aSeat], actsA: acts[aSeat], actsB: acts[1 - aSeat], castsA: casts[aSeat], castsB: casts[1 - aSeat], crashed }
  appendFileSync(out, JSON.stringify(rec) + '\n')
}
process.stderr.write(`${A} v ${B} done ${N}\n`)
